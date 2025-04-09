// models/ShopItem.js
const mongoose = require("mongoose");

const shopItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: [true, "L'ID de l'item est requis."],
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Le nom de l'item est requis."],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      // Prix d'ACHAT par le joueur
      type: Number,
      required: [true, "Le prix de l'item est requis."],
      min: [0, "Le prix ne peut pas être négatif."],
    },
    adminSellPrice: {
      // <<< NOUVEAU CHAMP : Prix de VENTE du joueur A L'ADMINSHOP
      type: Number,
      min: [0, "Le prix de vente admin ne peut pas être négatif."],
      default: null, // Si null/absent, l'admin ne rachète pas cet item
    },
    quantity: {
      // Quantité pour les offres P2P ou stock initial admin (si géré)
      type: Number,
      required: [true, "La quantité est requise."],
      min: [1, "La quantité doit être au moins 1."],
      default: 1,
    },
    sellerUsername: {
      // null ou absent pour item AdminShop
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: null,
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShopItem", shopItemSchema);
