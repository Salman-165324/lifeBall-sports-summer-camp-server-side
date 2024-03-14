require("dotenv").config();
const { MongoClient, ServerApiVersion} = require("mongodb");

let db = null;

const DbConnect = async () => {
  if (db) return db;
  try {
    // Create a MongoClient with a MongoClientOptions object to set the Stable API version
    const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iizb9vt.mongodb.net/?retryWrites=true&w=majority`;

    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    db = client.db("lifeBall");
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    return db;
  } catch (error) {
    console.log(error.message);
  }
};

module.exports = DbConnect;
