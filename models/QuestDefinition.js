// models/QuestDefinition.js
const mongoose = require("mongoose");

// --- Sous-schéma pour les Récompenses ---
const rewardSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["money", "item", "xp"], // Types de récompenses confirmés
      trim: true,
    },
    amount: {
      // Utilisé pour type 'money' ou 'xp'
      type: Number,
      min: 0,
      // Techniquement requis si type est money/xp, mais on peut valider ça dans la logique métier
      // ou rendre le schéma plus complexe avec des validateurs conditionnels.
      // Laisser optionnel ici simplifie le schéma.
    },
    itemId: {
      // Utilisé pour type 'item' (ex: 'minecraft:diamond')
      type: String,
      trim: true,
      lowercase: true,
      // Requis si type est 'item'
    },
    quantity: {
      // Utilisé pour type 'item'
      type: Number,
      min: 1,
      default: 1,
      // Requis si type est 'item'
    },
    // Pourrait inclure nbtData pour des items spécifiques plus tard
  },
  { _id: false }
); // Pas besoin d'un _id séparé pour chaque récompense dans le tableau

// --- Schéma Principal pour la Définition des Quêtes ---
const questDefinitionSchema = new mongoose.Schema(
  {
    questId: {
      // Identifiant unique textuel défini par l'admin (ex: 'daily_kill_zombies')
      type: String,
      required: [true, "L'ID unique de la quête (questId) est requis."],
      unique: true, // Assure qu'il n'y a pas deux définitions avec le même ID
      trim: true,
      index: true,
    },
    title: {
      // Nom affiché de la quête
      type: String,
      required: [true, "Le titre de la quête est requis."],
      trim: true,
    },
    description: {
      // Description de ce qu'il faut faire
      type: String,
      required: [true, "La description de la quête est requise."],
      trim: true,
    },
    type: {
      // Type de quête (pour le reset, etc.)
      type: String,
      required: true,
      enum: ["daily", "weekly", "monthly"],
      index: true,
    },
    target: {
      // La valeur numérique à atteindre pour compléter la quête
      type: Number,
      required: [true, "L'objectif numérique (target) est requis."],
      min: [1, "L'objectif doit être au moins 1."],
    },
    // On pourrait ajouter ici des infos sur COMMENT tracker la progression (ex: type d'événement, cible...)
    // mais gardons simple pour l'instant, cette logique sera gérée ailleurs.

    rewards: {
      // Tableau des récompenses à donner
      type: [rewardSchema],
      required: true,
      validate: [
        (v) => Array.isArray(v) && v.length > 0,
        "Au moins une récompense est requise.",
      ], // Assure qu'il y a au moins une récompense
    },
    isActive: {
      // Permet à l'admin de désactiver une quête sans la supprimer
      type: Boolean,
      default: true,
      index: true,
    },
    // Autres champs potentiels: prérequis (autres quêtes), niveau requis, etc.
  },
  { timestamps: true }
); // Ajoute createdAt et updatedAt

module.exports = mongoose.model("QuestDefinition", questDefinitionSchema);
