require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");

const router = require("./routes/index")

const app = express();
const PORT = process.env.PORT || 5001;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

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
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  