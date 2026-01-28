// Load environment variables from .env.local (or .env as fallback)
// Path is relative to project root (one level up from config directory)
const path = require('path');
const fs = require('fs');

const envLocalPath = path.resolve(__dirname, '..', '.env.local');
const envPath = path.resolve(__dirname, '..', '.env');

// Try to load .env.local first, then fallback to .env
if (fs.existsSync(envLocalPath)) {
  require("dotenv").config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config(); // This will still work if vars are set in system
}
const { MongoClient, ServerApiVersion} = require("mongodb");

let db = null;

const DbConnect = async () => {
  if (db) return db;
  
  // Validate environment variables before attempting connection
  if (!process.env.DB_USER || !process.env.DB_PASS) {
    throw new Error("Missing MongoDB credentials: DB_USER and DB_PASS must be set in environment variables");
  }
  
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
    
    // Connect to the database
    await client.connect();
    db = client.db("lifeBall");
    
    // Ping the database to verify connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    return db;
  } catch (error) {
    // Reset db to null so we can retry on next call
    db = null;
    console.error("MongoDB connection error:", error.message);
    // Re-throw the error so the caller knows the connection failed
    throw error;
  }
};

module.exports = DbConnect;