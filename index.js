const express = require("express");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Life Ball Summer Camp is Running");
});

const verifyJWT = (req, res, next) => {

    const authorization = req.headers.authorization; 
    console.log("authorization access token", authorization); 
    if(!authorization){
      return res.status(401).send({error: true, message: "Unauthorized Access Request"})
    }
    const token = authorization.split(" ")[1]; 

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if(err){
           return res.status(401).send({error: true, message: "Unauthorized Access. May be a problem with your token"})
        }

       req.decoded = decoded; 
       next(); 
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iizb9vt.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const classesCollection = client.db("lifeBall").collection("classes");
    const instructorCollection = client.db("lifeBall").collection("instructors");
    const userCollection = client.db("lifeBall").collection('users'); 

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign({ data: user }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({token})
    });

    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.get("/instructors", async (req, res) => {
      const result = await instructorCollection.find().toArray();
      res.send(result);
    });
    // todo: verify for admin too. 
    app.get("/users", verifyJWT, async (req, res) => {

      const result = await userCollection.find().toArray(); 
      res.send(result);
    })

    app.post('/add-user', async (req, res) => {

        const newUser = req.body.newUser; 
        const query = {email: newUser.email}
        const existingUser = await userCollection.findOne(query); 
        if(existingUser){

           return res.send({message: "User Already Exist"})
        }

        const result = await userCollection.insertOne(newUser); 
        res.send(result);

    })
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Life Ball server is listening on the port ${port}.`);
});
