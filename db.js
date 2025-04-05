const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    const options = {};
    await mongoose.connect(process.env.MONGODB_URI, options);
    console.log("MongoDB connecté avec succès.");
  } catch (err) {
    console.error("Erreur de connexion MongoDB:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
