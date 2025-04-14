// models/PlayerQuest.js
const mongoose = require("mongoose");

const playerQuestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Index simple toujours utile
    },
    questDefinitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuestDefinition",
      required: true,
      index: true, // Index simple toujours utile
    },
    status: {
      /* ... */
    },
    progress: {
      /* ... */
    },
    completion_streak: {
      /* ... */
    },
    assignedAt: {
      /* ... */
    },
    expiresAt: {
      type: Date,
      index: true, // Index simple toujours utile
    },
    completedAt: {
      /* ... */
    },
    claimedAt: {
      /* ... */
    },
  },
  { timestamps: true }
);

// --- AJOUT DE L'INDEX UNIQUE COMPOSÉ ---
// Assure qu'un utilisateur ne peut avoir qu'une seule instance d'une quête
// spécifique pour une date d'expiration donnée.
// Attention: Gère le cas où expiresAt peut être null (pour les quêtes non expirables)
// L'option sparse permet à plusieurs documents d'avoir expiresAt=null pour la même paire user/questDef.
playerQuestSchema.index(
  { userId: 1, questDefinitionId: 1, expiresAt: 1 },
  { unique: true, sparse: true } // sparse:true si expiresAt n'est pas toujours défini et que null ne doit pas bloquer l'unicité
);
// Si expiresAt est TOUJOURS défini pour les quêtes récurrentes, on peut enlever sparse: true.
// Gardons sparse: true pour plus de flexibilité.

module.exports = mongoose.model("PlayerQuest", playerQuestSchema);
