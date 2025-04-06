// models/ShopItem.js
const mongoose = require("mongoose");

const shopItemSchema = new mongoose.Schema(
  {
    itemId: {
      // ID Minecraft, ex: 'diamond'. N'est PLUS unique.
      type: String,
      required: [true, "L'ID de l'item est requis."],
      trim: true,
      lowercase: true,
      index: true, // Toujours utile pour rechercher par type d'item
    },
    name: {
      // Nom affiché. Pourrait être le nom custom de l'item vendu par le joueur.
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
      // Prix fixé par l'admin OU par le joueur vendeur
      type: Number,
      required: [true, "Le prix de l'item est requis."],
      min: [0, "Le prix ne peut pas être négatif."],
    },
    quantity: {
      // Quantité d'items dans cette offre spécifique
      type: Number,
      required: [true, "La quantité est requise."],
      min: [1, "La quantité doit être au moins 1."],
      default: 1,
    },
    sellerUsername: {
      // Pseudo Minecraft du vendeur (en minuscules)
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: null, // Important: null ou l'absence indique un item AdminShop
    },
    // Optionnel: Stocker les données NBT pour les items enchantés/renommés etc.
    // nbtData: { type: String },
    isEnabled: {
      // Pour activer/désactiver l'offre (admin ou joueur)
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
); // Ajoute createdAt et updatedAt

// Indique qu'un item Admin est unique par son itemId (si sellerUsername est null)
// Et qu'un item joueur est unique par son _id généré par Mongo
// Optionnel mais peut aider à la logique admin plus tard:
// shopItemSchema.index({ itemId: 1, sellerUsername: 1 }, { unique: true, partialFilterExpression: { sellerUsername: null } });

module.exports = mongoose.model("ShopItem", shopItemSchema);
