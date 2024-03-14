require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const cors = require("cors");
const DbConnect = require("./config/dbConfig");

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Life Ball Summer Camp is Running");
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access Request" });
  }
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({
        error: true,
        message: "Unauthorized Access. May be a problem with your token",
      });
    }

    req.decoded = decoded;

    next();
  });
};

async function run() {
  try {
 
    const db = await DbConnect();

    const classesCollection = db.collection("classes");
    const instructorCollection = db.collection("instructors");
    const userCollection = db.collection("users");
    const cartCollection = db.collection("cart");
    const paymentCollection = db.collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verify Admin
    const verifyAdmin = async (req, res, next) => {
      const user = req.decoded;

      const query = { email: user?.email };
      console.log("From admin verification,", user);
      const userFromDb = await userCollection.findOne(query);

      if (userFromDb?.role !== "admin") {
        res
          .status(403)
          .send({ error: true, message: "Forbidden Request. Not an admin" });
        return;
      }
      next();
    };

    app.get("/popular-classes", async (req, res) => {
      const popularClassesData = await paymentCollection
        .aggregate([
          {
            $unwind: "$orderedClassesId",
          },
          {
            $group: {
              _id: "$orderedClassesId",
              count: { $sum: 1 },
            },
          },
          {
            $sort: { count: -1 },
          },
          {
            $limit: 7,
          },
        ])
        .toArray();

      const classIds = popularClassesData.map(
        (popularClass) => new ObjectId(popularClass._id)
      );

      // Query the classes collection for the top 6 class details
      const classQuery = { _id: { $in: classIds } };
      const popularClasses = await classesCollection.find(classQuery).toArray();
      res.send(popularClasses);
    });

    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.get("/instructors", async (req, res) => {
      const result = await instructorCollection.find().toArray();
      res.send(result);
    });
    app.get("/users", verifyJWT, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/find-role/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email: email };
      const userData = await userCollection.findOne(query);

      const userRole = userData?.role || "student";

      res.send(userRole);
    });
    app.get("/cart-data", verifyJWT, async (req, res) => {
      const email = req.decoded.email;
      const query = { userEmail: email };
      console.log("hitted Email", email);
      const result = await cartCollection.find(query).toArray();

      res.send(result);
    });

    app.post("/add-user", async (req, res) => {
      const newUser = req.body.newUser;
      const query = { email: newUser.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already Exist" });
      }

      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    app.post("/add-to-cart", verifyJWT, async (req, res) => {
      const cartData = req.body;
      const result = await cartCollection.insertOne(cartData);
      res.send(result);
    });

    app.patch("/update-role", verifyJWT, verifyAdmin, async (req, res) => {
      const { role, _id } = req.body.reqData;
      const filter = { _id: new ObjectId(_id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      console.log(result);
      res.send(result);
    });

    app.delete("/delete-cart-item/:id", verifyJWT, async (req, res) => {
      const userEmail = req.query.userEmail;
      if (req.decoded.email !== userEmail) {
        res.status(403).send({ error: true, message: "Forbidden Request" });
      }
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payment Related Routes
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { totalPrice } = req.body;
      const amount = parseInt(totalPrice) * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const paymentData = req.body;
      console.log(paymentData);
      const paymentInsertionRes = await paymentCollection.insertOne(
        paymentData
      );

      const query = {
        _id: { $in: paymentData.cartItemsId.map((id) => new ObjectId(id)) },
      };
      const deletedCartRes = await cartCollection.deleteMany(query);

      const classesId = paymentData.orderedClassesId;
      classesId.forEach(async (classId) => {
        await classesCollection.updateOne(
          { _id: new ObjectId(classId) },
          { $inc: { availableSeats: -1 } }
        );
      });

      res.send({ paymentInsertionRes, deletedCartRes });
    });

    app.get("/payment-history", verifyJWT, async (req, res) => {
      const email = req.decoded.email;
      const query = { email: email };
      const sort = { date: -1 };
      const result = await paymentCollection.find(query).sort(sort).toArray();
      res.send(result);
    });

    app.get("/enrolled-classes", verifyJWT, async (req, res) => {
      const email = req.decoded.email;

      const paymentQuery = { email: email };
      const payments = await paymentCollection.find(paymentQuery).toArray();
      const orderedClassesId = Array.from(
        new Set(payments.flatMap((payment) => payment.orderedClassesId))
      );
      const classQuery = {
        _id: { $in: orderedClassesId.map((classId) => new ObjectId(classId)) },
      };

      const classes = await classesCollection.find(classQuery).toArray();
      res.send(classes);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Life Ball server is listening on the port ${port}.`);
});

module.exports = app;
