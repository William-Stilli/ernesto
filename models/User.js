// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      // Minecraft username
      type: String,
      required: true,
      unique: true,
      lowercase: true, // Stocker les pseudos en minuscules pour éviter les doublons de casse
      trim: true,
      index: true,
    },
    // Stockez le pseudo avec la casse originale si nécessaire pour certaines commandes MC
    // originalCaseUsername: { type: String },
    uuid: {
      // Optionnel mais recommandé: UUID Minecraft (unique)
      type: String,
      unique: true,
      sparse: true, // Permet les valeurs null/absentes si non unique
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0, // Le solde ne devrait pas être négatif
    },
  },
  { timestamps: true }
); // Ajoute createdAt et updatedAt

module.exports = mongoose.model("User", userSchema);
