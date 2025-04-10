// models/PlayerQuest.js
const mongoose = require("mongoose");

const playerQuestSchema = new mongoose.Schema(
  {
    // --- Liaison ---
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Lien vers le document de l'utilisateur
      required: true,
      index: true, // Pour retrouver facilement les quêtes d'un joueur
    },
    questDefinitionId: {
      // Lien vers la définition générale de la quête
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuestDefinition", // Référence au modèle 'QuestDefinition'
      required: true,
      index: true,
    },
    // Alternativement, on pourrait stocker directement le questId textuel ici
    // questId: { type: String, required: true, index: true },

    // --- Suivi de l'état ---
    status: {
      type: String,
      required: true,
      enum: ["not_started", "in_progress", "completed", "reward_claimed"],
      default: "not_started", // Statut initial
      index: true, // Utile pour trouver les quêtes complétées, en cours, etc.
    },
    progress: {
      current: {
        // Progression actuelle du joueur pour cette quête
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      // La valeur 'target' se trouve dans le document QuestDefinition lié
    },
    completion_streak: {
      // Uniquement pertinent pour les quêtes journalières
      type: Number, // Stocke le nombre de jours consécutifs
      default: 0,
      min: 0,
    },

    // --- Gestion du Temps ---
    assignedAt: {
      // Date à laquelle cette instance de quête a été assignée/démarrée pour le joueur
      type: Date,
      default: Date.now, // Peut être écrasé par la logique d'assignation
    },
    expiresAt: {
      // Date et heure exactes d'expiration de cette instance de quête
      type: Date, // Calculé par le backend (ex: fin de journée/semaine/mois UTC)
      index: true, // Important pour identifier les quêtes actives/expirées
    },
    completedAt: {
      // Timestamp: quand le statut est passé à 'completed'
      type: Date,
    },
    claimedAt: {
      // Timestamp: quand le statut est passé à 'reward_claimed'
      type: Date,
    },
  },
  { timestamps: true }
); // Ajoute createdAt (création de ce document) et updatedAt

// Index Composé Optionnel : Pourrait être utile si un joueur ne peut avoir qu'une seule
// instance active d'une QuestDefinition pour une période donnée (ex: une seule 'daily_kill_zombies' par jour).
// Demande une clé de 'période' supplémentaire (ex: date d'assignation) pour être vraiment unique.
// Laisser de côté pour l'instant, la logique d'assignation gérera les doublons.
// playerQuestSchema.index({ userId: 1, questDefinitionId: 1, assignedAt: 1 }, { unique: true });

module.exports = mongoose.model("PlayerQuest", playerQuestSchema);
