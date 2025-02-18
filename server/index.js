require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cookiesParser = require('cookie-parser')
const cors = require("cors");
const { app, server } = require('./socket/index')

const router = require("./routes/route")

// const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
  origin: "https://chatify-frontend-vj8e.onrender.com",
  credentials : true
}))
app.use(express.json());
app.use(cookiesParser())

app.use(express.raw({ type: "image/*", limit: "30mb" }));
app.use(express.raw({ type: "application/*", limit: "30mb" }));

//mongoose Connection

mongoose.connect(process.env.MONGODB_URI, {})
  .then(() => {
    console.log("connected to mongodb");
  })
  .catch((err) => {
    console.log("error", err);
  });

  app.get('/', (req, res) => {
    res.json({
        message: "server "+PORT
    })
  })

  // api endpoint
  app.use('/api', router)


  // PORT
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  