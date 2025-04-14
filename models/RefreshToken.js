// models/RefreshToken.js
const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      // Le HASH (SHA-256) du refresh token JWT.
      // Ne pas stocker le token JWT brut ici.
      type: String,
      required: true,
      unique: true, // L'unicité du hash est attendue
      index: true, // Important pour la recherche rapide lors du refresh/logout
    },
    userId: {
      // Lien vers l'utilisateur à qui appartient ce token
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Référence au modèle 'User'
      required: true,
      index: true,
    },
    expiresAt: {
      // Date d'expiration de CE refresh token (associé au hash stocké)
      type: Date,
      required: true,
    },
    // On pourrait ajouter : createdAt, revoked (boolean), ipAddress, userAgent etc.
  },
  { timestamps: true } // Ajoute createdAt et updatedAt
);

// Optionnel mais recommandé: Index TTL pour que MongoDB nettoie automatiquement les tokens expirés
// même si la vérification manuelle est faite. Se base sur la date d'expiration stockée.
// refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
