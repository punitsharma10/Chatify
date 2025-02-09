const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = (uri) => {
  console.log("Database Connected");
  return mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
};

module.exports = connectDB;