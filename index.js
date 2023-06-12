const express = require('express'); 
const cors = require('cors'); 
const jwt = require("jsonwebtoken")

const app = express(); 
const port = process.env.PORT || 5000; 


// middleware 
app.use(express.json()); 
app.use(cors()); 




app.get('/', (req, res) => {

    res.send("Life Ball Summer Camp is Running"); 
})

app.listen(port, () => {

    console.log(`Life Ball server is listening on the port ${port}.`);
})