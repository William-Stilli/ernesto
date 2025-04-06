// models/PendingDelivery.js
const mongoose = require("mongoose");

const pendingDeliverySchema = new mongoose.Schema(
  {
    buyerUserId: {
      // ID de l'utilisateur qui doit recevoir l'item
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    buyerUsername: {
      // Pseudo (en minuscules) pour référence facile
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    listingId: {
      // Optionnel : ID de l'offre originale (si achat joueur)
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopItem",
    },
    itemId: {
      // ID Minecraft de l'item
      type: String,
      required: true,
      lowercase: true,
    },
    quantity: {
      // Quantité à livrer
      type: Number,
      required: true,
      min: 1,
    },
    itemName: {
      // Nom de l'item (pour affichage / référence)
      type: String,
    },
    itemDescription: {
      // Description (optionnel)
      type: String,
    },
    // nbtData: { type: String }, // Si besoin pour items spécifiques
    status: {
      // Statut de la livraison
      type: String,
      enum: ["pending", "delivered", "failed"], // Seulement ces valeurs sont permises
      default: "pending",
      index: true,
    },
    purchaseTransactionId: {
      // Optionnel: ID de la transaction d'achat
      type: String, // Ou un autre type si vous avez des ID de transaction
    },
    deliveryAttempts: {
      // Compteur si on veut réessayer automatiquement (peu probable ici)
      type: Number,
      default: 0,
    },
    deliveredAt: {
      // Date de livraison effective
      type: Date,
    },
  },
  { timestamps: true }
); // createdAt sera la date d'achat

module.exports = mongoose.model("PendingDelivery", pendingDeliverySchema);
