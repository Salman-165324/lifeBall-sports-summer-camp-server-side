// Load environment variables from .env.local (or .env as fallback)
require("dotenv").config({ path: '.env.local' });
// Fallback to .env if .env.local doesn't exist or doesn't have the required vars
if (!process.env.DB_USER && !process.env.DB_PASS) {
  require("dotenv").config();
}
const express = require("express");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const cors = require("cors");
const DbConnect = require("./config/dbConfig");

// middleware
app.use(cors());
app.use(express.json());

// Root route
app.get("/", (req, res) => {
  res.send("Life Ball Summer Camp is Running");
});

// JWT verification middleware
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

// Admin verification middleware - connects to DB on-demand
const verifyAdmin = async (req, res, next) => {
  try {
    const user = req.decoded;
    const db = await DbConnect();
    const userCollection = db.collection("users");

    const query = { email: user?.email };
    console.log("From admin verification,", user);
    const userFromDb = await userCollection.findOne(query);

    if (userFromDb?.role !== "admin") {
      return res
        .status(403)
        .send({ error: true, message: "Forbidden Request. Not an admin" });
    }
    next();
  } catch (error) {
    console.error("Admin verification error:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
};

// Helper function to get database collections (lazy connection)
const getCollections = async () => {
  const db = await DbConnect();
  return {
    classesCollection: db.collection("classes"),
    instructorCollection: db.collection("instructors"),
    userCollection: db.collection("users"),
    cartCollection: db.collection("cart"),
    paymentCollection: db.collection("payments"),
  };
};

// JWT token generation endpoint
app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

// Popular classes endpoint
app.get("/popular-classes", async (req, res) => {
  try {
    const { paymentCollection, classesCollection } = await getCollections();

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
  } catch (error) {
    console.error("Error fetching popular classes:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Get all classes
app.get("/classes", async (req, res) => {
  try {
    const { classesCollection } = await getCollections();
    const result = await classesCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching classes:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Get all instructors
app.get("/instructors", async (req, res) => {
  try {
    const { instructorCollection } = await getCollections();
    const result = await instructorCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching instructors:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Get all users (admin only)
app.get("/users", verifyJWT, async (req, res) => {
  try {
    const { userCollection } = await getCollections();
    const result = await userCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Find user role by email
app.get("/find-role/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const { userCollection } = await getCollections();

    const query = { email: email };
    const userData = await userCollection.findOne(query);

    const userRole = userData?.role || "student";
    res.send(userRole);
  } catch (error) {
    console.error("Error finding user role:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Get cart data for authenticated user
app.get("/cart-data", verifyJWT, async (req, res) => {
  try {
    const email = req.decoded.email;
    const { cartCollection } = await getCollections();

    const query = { userEmail: email };
    console.log("hitted Email", email);
    const result = await cartCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching cart data:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Add new user
app.post("/add-user", async (req, res) => {
  try {
    const newUser = req.body.newUser;
    const { userCollection } = await getCollections();

    const query = { email: newUser.email };
    const existingUser = await userCollection.findOne(query);
    if (existingUser) {
      return res.send({ message: "User Already Exist" });
    }

    const result = await userCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Add item to cart
app.post("/add-to-cart", verifyJWT, async (req, res) => {
  try {
    const cartData = req.body;
    const { cartCollection } = await getCollections();

    const result = await cartCollection.insertOne(cartData);
    res.send(result);
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Update user role (admin only)
app.patch("/update-role", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { role, _id } = req.body.reqData;
    const { userCollection } = await getCollections();

    const filter = { _id: new ObjectId(_id) };
    const updateDoc = {
      $set: {
        role: role,
      },
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    console.log(result);
    res.send(result);
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Delete cart item
app.delete("/delete-cart-item/:id", verifyJWT, async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    if (req.decoded.email !== userEmail) {
      return res.status(403).send({ error: true, message: "Forbidden Request" });
    }

    const id = req.params.id;
    const { cartCollection } = await getCollections();

    console.log(id);
    const query = { _id: new ObjectId(id) };
    const result = await cartCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error deleting cart item:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Payment Related Routes

// Create payment intent
app.post("/create-payment-intent", verifyJWT, async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Process payment
app.post("/payments", verifyJWT, async (req, res) => {
  try {
    const paymentData = req.body;
    const { paymentCollection, cartCollection, classesCollection } = await getCollections();

    console.log(paymentData);
    const paymentInsertionRes = await paymentCollection.insertOne(paymentData);

    const query = {
      _id: { $in: paymentData.cartItemsId.map((id) => new ObjectId(id)) },
    };
    const deletedCartRes = await cartCollection.deleteMany(query);

    // Update available seats for each class
    const classesId = paymentData.orderedClassesId;
    // Use Promise.all for proper async handling
    await Promise.all(
      classesId.map(async (classId) => {
        await classesCollection.updateOne(
          { _id: new ObjectId(classId) },
          { $inc: { availableSeats: -1 } }
        );
      })
    );

    res.send({ paymentInsertionRes, deletedCartRes });
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Get payment history
app.get("/payment-history", verifyJWT, async (req, res) => {
  try {
    const email = req.decoded.email;
    const { paymentCollection } = await getCollections();

    const query = { email: email };
    const sort = { date: -1 };
    const result = await paymentCollection.find(query).sort(sort).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching payment history:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Get enrolled classes
app.get("/enrolled-classes", verifyJWT, async (req, res) => {
  try {
    const email = req.decoded.email;
    const { paymentCollection, classesCollection } = await getCollections();

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
  } catch (error) {
    console.error("Error fetching enrolled classes:", error);
    res.status(500).send({ error: true, message: "Internal server error" });
  }
});

// Export the Express app for Vercel (required for serverless deployment)
module.exports = app;

// For local development with 'node index.js', start the server
// Vercel will ignore this and use the exported app instead
if (require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Life Ball server is listening on the port ${port}.`);
  });
}
