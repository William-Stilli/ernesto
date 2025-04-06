// models/RefreshToken.js
const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      // Le refresh token lui-même. Pour plus de sécu, on pourrait stocker un hash.
      type: String,
      required: true,
      unique: true,
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
      // Date d'expiration de CE refresh token
      type: Date,
      required: true,
    },
    // On pourrait ajouter : createdAt, revokedAt, ipAddress, userAgent etc.
  },
  { timestamps: true }
); // Ajoute createdAt et updatedAt

// Optionnel : Index TTL pour que MongoDB nettoie automatiquement les tokens expirés
// Bien que la vérification manuelle soit faite, ça aide à garder la collection propre.
// refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
