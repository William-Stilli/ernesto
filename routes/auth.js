// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const ms = require("ms");
const crypto = require("crypto"); // <<< Importer le module crypto pour le hachage
const TemporaryCode = require("../models/TemporaryCode");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
require("dotenv").config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

// --- Helper pour hacher les tokens ---
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// --- LOGIN : Génère Access + Refresh Token, stocke le HASH du Refresh Token ---
router.post("/login", async (req, res) => {
  const { username, code } = req.body;
  const lowerCaseUsername = username?.toLowerCase();

  if (!lowerCaseUsername || !code) {
    return res.status(400).json({ message: "Username et code requis." });
  }

  try {
    // 1. Valider le code temporaire
    const tempCode = await TemporaryCode.findOneAndDelete({
      username: lowerCaseUsername,
      code: code,
    });

    if (!tempCode) {
      console.log(
        `Login échoué (code invalide/expiré) pour ${lowerCaseUsername}`
      );
      return res
        .status(401)
        .json({ message: "Code invalide, expiré ou déjà utilisé." });
    }

    // 2. Trouver l'utilisateur associé (avec son rôle)
    const user = await User.findOne({ username: lowerCaseUsername }).select(
      "+role"
    );
    if (!user) {
      console.warn(
        `Utilisateur ${lowerCaseUsername} non trouvé après validation du code.`
      );
      return res
        .status(401)
        .json({ message: "Utilisateur associé au code non trouvé." });
    }

    // --- Génération des Tokens ---
    const userPayload = {
      id: user._id,
      username: user.username,
      role: user.role,
    };
    const accessToken = jwt.sign(userPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshTokenPayload = { id: user._id, type: "refresh" }; // Payload minimal pour refresh
    const refreshToken = jwt.sign(refreshTokenPayload, JWT_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    // --- Hachage et Stockage du Refresh Token ---
    const refreshTokenHash = hashToken(refreshToken); // <<< Hacher le token
    const refreshTokenExpiresAt = new Date(
      Date.now() + ms(REFRESH_TOKEN_EXPIRY)
    );

    // Supprimer les anciens tokens pour cet user
    await RefreshToken.deleteMany({ userId: user._id });

    // Enregistrer le NOUVEAU hash
    const storedRefreshToken = new RefreshToken({
      token: refreshTokenHash, // <<< Stocker le HASH
      userId: user._id,
      expiresAt: refreshTokenExpiresAt,
    });
    await storedRefreshToken.save();

    console.log(
      `Login réussi, tokens générés pour ${user.username} (Rôle: ${user.role}), hash refresh token stocké.`
    );

    // --- Réponse au Client ---
    // Renvoyer les tokens originaux (non hachés)
    res.json({
      accessToken: accessToken,
      refreshToken: refreshToken, // Le client reçoit le JWT, pas le hash
      username: user.username,
    });
  } catch (error) {
    console.error(`Erreur lors du login pour ${lowerCaseUsername}:`, error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne pendant le login." });
  }
});

// --- REFRESH : Implémente la Rotation des Refresh Tokens ---
router.post("/refresh", async (req, res) => {
  const { token: providedRefreshToken } = req.body; // Le JWT refresh fourni par le client

  if (!providedRefreshToken) {
    return res.status(401).json({ message: "Refresh token manquant." });
  }

  // 1. Hacher le token fourni pour chercher en DB
  const providedTokenHash = hashToken(providedRefreshToken);

  try {
    // 2. Chercher le HASH dans la base de données
    const storedToken = await RefreshToken.findOne({
      token: providedTokenHash,
    });

    // --- Vérification d'existence et d'expiration en DB ---
    if (!storedToken) {
      // Le hash n'est pas trouvé. Soit le token est invalide, soit il a déjà été utilisé (rotation).
      // Optionnel : Sécurité renforcée -> essayer de vérifier le JWT fourni. S'il est valide
      // mais pas en DB, cela pourrait indiquer une tentative de rejeu d'un token déjà utilisé/volé.
      // On pourrait invalider tous les tokens de l'utilisateur concerné.
      console.warn(
        `Refresh token (hash: ...${providedTokenHash.slice(
          -6
        )}) non trouvé en DB. Possible réutilisation ou invalidité.`
      );
      return res
        .status(403)
        .json({ message: "Refresh token invalide, révoqué ou déjà utilisé." });
    }

    if (new Date() > storedToken.expiresAt) {
      console.log(
        `Refresh token ${storedToken._id} (hash: ...${providedTokenHash.slice(
          -6
        )}) trouvé mais expiré en DB.`
      );
      await RefreshToken.findByIdAndDelete(storedToken._id); // Nettoyer
      return res.status(403).json({ message: "Refresh token expiré." });
    }

    // --- Vérification du JWT fourni (signature, expiration intrinsèque) ---
    let decodedRefresh;
    try {
      decodedRefresh = jwt.verify(providedRefreshToken, JWT_SECRET);
      // Vérifier la correspondance User ID (sécurité supplémentaire)
      if (decodedRefresh.id !== storedToken.userId.toString()) {
        console.error(
          `ERREUR SECURITE REFRESH: UserID JWT (${
            decodedRefresh.id
          }) != UserID DB (${
            storedToken.userId
          }) pour hash ...${providedTokenHash.slice(-6)}. Invalidation.`
        );
        await RefreshToken.findByIdAndDelete(storedToken._id); // Supprimer ce token suspect
        return res
          .status(403)
          .json({
            message: "Refresh token invalide (incohérence utilisateur).",
          });
      }
    } catch (err) {
      // Le JWT fourni est invalide (mauvaise signature, format, expiré selon le JWT lui-même)
      console.log(
        `Erreur vérification JWT du refresh token fourni (hash: ...${providedTokenHash.slice(
          -6
        )}): ${err.message}`
      );
      await RefreshToken.findByIdAndDelete(storedToken._id); // Nettoyer le token de la DB aussi
      return res
        .status(403)
        .json({ message: "Refresh token invalide (échec vérification JWT)." });
    }

    // --- Si tout est OK jusqu'ici : Procéder à la rotation ---

    // 4. Trouver l'utilisateur associé (pour générer le nouvel access token avec rôle)
    const user = await User.findById(storedToken.userId).select("+role");
    if (!user) {
      console.error(
        `Utilisateur ${
          storedToken.userId
        } introuvable pour refresh token (hash: ...${providedTokenHash.slice(
          -6
        )}). Invalidation.`
      );
      await RefreshToken.findByIdAndDelete(storedToken._id);
      return res
        .status(403)
        .json({ message: "Utilisateur associé au token introuvable." });
    }

    // 5. Générer le NOUVEL Access Token
    const newAccessTokenPayload = {
      id: user._id,
      username: user.username,
      role: user.role,
    };
    const newAccessToken = jwt.sign(newAccessTokenPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // 6. Générer le NOUVEAU Refresh Token
    const newRefreshTokenPayload = { id: user._id, type: "refresh" };
    const newRefreshToken = jwt.sign(newRefreshTokenPayload, JWT_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });
    const newRefreshTokenHash = hashToken(newRefreshToken); // <<< Hacher le nouveau
    const newRefreshTokenExpiresAt = new Date(
      Date.now() + ms(REFRESH_TOKEN_EXPIRY)
    );

    // 7. Mettre à jour l'enregistrement en base avec le NOUVEAU hash et la NOUVELLE expiration
    //    Ceci invalide l'ancien token (son hash ne correspondra plus)
    storedToken.token = newRefreshTokenHash;
    storedToken.expiresAt = newRefreshTokenExpiresAt;
    await storedToken.save(); // Met à jour l'enregistrement existant

    console.log(
      `Access et Refresh tokens rafraîchis (rotation effectuée) pour ${user.username}.`
    );

    // 8. Renvoyer les DEUX nouveaux tokens au client
    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken, // <<< Renvoyer le NOUVEAU refresh token
    });
  } catch (error) {
    console.error(
      `Erreur lors du rafraîchissement du token (hash: ...${providedTokenHash.slice(
        -6
      )}):`,
      error
    );
    res
      .status(500)
      .json({ message: "Erreur serveur interne pendant le rafraîchissement." });
  }
});

// --- LOGOUT : Invalide un Refresh Token en supprimant son hash ---
router.post("/logout", async (req, res) => {
  const { token: providedRefreshToken } = req.body;

  if (!providedRefreshToken) {
    return res
      .status(400)
      .json({ message: "Refresh token requis pour la déconnexion." });
  }

  // Hacher le token fourni pour le trouver en DB
  const providedTokenHash = hashToken(providedRefreshToken);

  try {
    // Supprimer l'enregistrement correspondant au hash
    const result = await RefreshToken.deleteOne({ token: providedTokenHash });

    if (result.deletedCount === 0) {
      console.log(
        `Logout: Refresh token (hash: ...${providedTokenHash.slice(
          -6
        )}) non trouvé ou déjà supprimé.`
      );
    } else {
      console.log(
        `Logout: Refresh token (hash: ...${providedTokenHash.slice(
          -6
        )}) supprimé.`
      );
    }

    res.status(200).json({ message: "Déconnexion réussie." });
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la déconnexion." });
  }
});

module.exports = router;
