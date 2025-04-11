// models/Todo.js
const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, "Le texte de la tâche est requis."],
      trim: true, // Enlève les espaces inutiles au début/fin
    },
    isCompleted: {
      type: Boolean,
      default: false, // Une nouvelle tâche n'est pas complétée par défaut
    },
    // Le champ 'id' sera l'_id de MongoDB
    // Les champs 'createdAt' et 'updatedAt' sont ajoutés automatiquement
  },
  { timestamps: true }
);

module.exports = mongoose.model("Todo", todoSchema);

//TODO: Améliorer avec des dates, des tags, etc...
