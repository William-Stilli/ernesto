// models/TemporaryCode.js
const mongoose = require("mongoose");

const temporaryCodeSchema = new mongoose.Schema({
  username: {
    // Associer le code à l'utilisateur (en minuscules)
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  code: {
    type: String,
    required: true,
  },
  createdAt: {
    // Utiliser l'index TTL de MongoDB pour l'expiration automatique
    type: Date,
    default: Date.now,
    expires: "5m", // Le document sera supprimé après 5 minutes
  },
});

module.exports = mongoose.model("TemporaryCode", temporaryCodeSchema);
