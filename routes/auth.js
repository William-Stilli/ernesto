// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const ms = require("ms"); // Pour calculer les dates d'expiration
const TemporaryCode = require("../models/TemporaryCode");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken"); // <<< Importer le nouveau modèle
require("dotenv").config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m"; //TODO: Need to be changed to 15m
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

// --- LOGIN : Renvoie maintenant Access + Refresh Token ---
// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, code } = req.body;
  const lowerCaseUsername = username?.toLowerCase();

  if (!lowerCaseUsername || !code) {
    return res.status(400).json({ message: "Username et code requis." });
  }

  try {
    const tempCode = await TemporaryCode.findOneAndDelete({
      username: lowerCaseUsername,
      code: code,
    });

    if (tempCode) {
      const user = await User.findOne({ username: lowerCaseUsername });
      if (!user) {
        console.warn(
          `Utilisateur ${lowerCaseUsername} non trouvé après validation du code.`
        );
        return res
          .status(401)
          .json({ message: "Utilisateur associé non trouvé." });
      }

      // --- Génération des Tokens ---
      const userPayload = { id: user._id, username: user.username };

      // 1. Access Token (courte durée)
      const accessToken = jwt.sign(userPayload, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      });

      // 2. Refresh Token (longue durée - utilisant aussi JWT ici pour simplicité)
      // On pourrait utiliser une chaîne aléatoire sécurisée + la stocker.
      // Utiliser JWT permet de vérifier sa propre expiration/signature facilement.
      const refreshTokenPayload = { id: user._id, type: "refresh" }; // Payload minimal
      const refreshToken = jwt.sign(refreshTokenPayload, JWT_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
      });

      // Calculer la date d'expiration pour le stockage en DB
      const refreshTokenExpiresAt = new Date(
        Date.now() + ms(REFRESH_TOKEN_EXPIRY)
      );

      // --- Stockage du Refresh Token ---
      // Supprimer les anciens refresh tokens pour cet utilisateur (sécurité/propreté)
      await RefreshToken.deleteMany({ userId: user._id });

      // Enregistrer le nouveau refresh token
      const storedRefreshToken = new RefreshToken({
        token: refreshToken, // Ici on stocke le token JWT lui-même
        userId: user._id,
        expiresAt: refreshTokenExpiresAt,
      });
      await storedRefreshToken.save();

      console.log(`Login réussi, tokens générés pour ${user.username}`);

      // --- Réponse au Client ---
      // Renvoyer LES DEUX tokens
      res.json({
        accessToken: accessToken,
        refreshToken: refreshToken,
        username: user.username,
        // Optionnel: renvoyer l'expiration de l'access token pour aider le client
        // expiresIn: ms(ACCESS_TOKEN_EXPIRY) // en millisecondes
      });
    } else {
      console.log(`Tentative de login échouée pour ${lowerCaseUsername}`);
      res
        .status(401)
        .json({ message: "Code invalide, expiré ou déjà utilisé." });
    }
  } catch (error) {
    console.error("Erreur lors du login:", error);
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

// --- REFRESH : Obtient un nouvel Access Token via un Refresh Token ---
// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const { token: providedRefreshToken } = req.body; // Attendre le refresh token dans le body

  if (!providedRefreshToken) {
    return res.status(401).json({ message: "Refresh token manquant." });
  }

  try {
    // 1. Chercher le token dans la base de données
    const storedToken = await RefreshToken.findOne({
      token: providedRefreshToken,
    });

    if (!storedToken) {
      console.log("Refresh token non trouvé en DB.");
      // Sécurité: Si un token inconnu est présenté, il pourrait être volé/compromis.
      // On pourrait invalider TOUS les refresh tokens de l'utilisateur potentiel
      // si on pouvait extraire l'userId du token JWT fourni (même s'il n'est pas en DB).
      return res
        .status(403)
        .json({ message: "Refresh token invalide ou révoqué (not found)." });
    }

    // 2. Vérifier si le token stocké en DB est expiré
    if (new Date() > storedToken.expiresAt) {
      console.log(`Refresh token ${storedToken._id} trouvé mais expiré en DB.`);
      await RefreshToken.findByIdAndDelete(storedToken._id); // Nettoyer
      return res.status(403).json({ message: "Refresh token expiré." });
    }

    // 3. Vérifier la validité du token JWT lui-même (signature, expiration propre au JWT)
    //    et s'assurer qu'il correspond à l'utilisateur stocké.
    let decodedRefresh;
    try {
      decodedRefresh = jwt.verify(providedRefreshToken, JWT_SECRET);
      if (decodedRefresh.id !== storedToken.userId.toString()) {
        console.error(
          `ERREUR DE SECURITE: UserID du JWT refresh (${decodedRefresh.id}) différent de UserID stocké (${storedToken.userId}) pour le token ${storedToken._id}`
        );
        await RefreshToken.findByIdAndDelete(storedToken._id); // Supprimer ce token suspect
        return res
          .status(403)
          .json({ message: "Refresh token invalide (user mismatch)." });
      }
      // Optionnel: Vérifier si le payload contient bien 'type: refresh' si on l'a mis
      // if(decodedRefresh.type !== 'refresh') { ... }
    } catch (err) {
      console.log(
        `Erreur vérification JWT du refresh token ${storedToken._id}: ${err.message}`
      );
      // Le token fourni n'est pas un JWT valide signé par nous OU est expiré (selon JWT)
      await RefreshToken.findByIdAndDelete(storedToken._id); // Nettoyer le token de la DB
      return res
        .status(403)
        .json({ message: "Refresh token invalide (JWT verification failed)." });
    }

    // 4. Trouver l'utilisateur associé
    const user = await User.findById(storedToken.userId);
    if (!user) {
      console.error(
        `Utilisateur ${storedToken.userId} introuvable pour le refresh token ${storedToken._id}`
      );
      await RefreshToken.findByIdAndDelete(storedToken._id); // Nettoyer
      return res
        .status(403)
        .json({ message: "Utilisateur associé introuvable." });
    }

    // 5. Générer un NOUVEL Access Token
    const newAccessTokenPayload = { id: user._id, username: user.username };
    const newAccessToken = jwt.sign(newAccessTokenPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    console.log(`Access token rafraîchi pour ${user.username}`);

    // --- Implémentation SANS rotation du Refresh Token ---
    // On ne génère pas de nouveau refresh token, on renvoie juste le nouvel access token.
    // L'ancien refresh token reste valide jusqu'à son expiration initiale.

    // --- Implémentation AVEC rotation du Refresh Token (plus sécurisé) ---
    /*
        // Générer un nouveau refresh token
        const newRefreshTokenPayload = { id: user._id, type: 'refresh' };
        const newRefreshToken = jwt.sign(newRefreshTokenPayload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
        const newRefreshTokenExpiresAt = new Date(Date.now() + ms(REFRESH_TOKEN_EXPIRY));

        // Mettre à jour l'ancien token en DB avec le nouveau token et la nouvelle expiration
        storedToken.token = newRefreshToken;
        storedToken.expiresAt = newRefreshTokenExpiresAt;
        await storedToken.save();

        // Renvoyer les deux nouveaux tokens
        return res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken // Renvoyer le NOUVEAU refresh token
        });
        */
    // --- Fin de l'implémentation AVEC rotation ---

    // Renvoyer uniquement le nouvel access token (version SANS rotation)
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Erreur lors du rafraîchissement du token:", error);
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

// --- LOGOUT : Invalide un Refresh Token ---
// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  // Le client doit envoyer le REFRESH token qu'il veut invalider
  const { token: providedRefreshToken } = req.body;

  if (!providedRefreshToken) {
    // On pourrait aussi invalider TOUS les refresh tokens si l'utilisateur est authentifié
    // via un Access Token valide sur cet endpoint, mais demander le refresh token
    // permet de cibler une session spécifique (ex: déconnexion d'un appareil).
    return res
      .status(400)
      .json({ message: "Refresh token requis pour la déconnexion." });
  }

  try {
    // Simplement supprimer le refresh token de la base de données
    const result = await RefreshToken.deleteOne({
      token: providedRefreshToken,
    });

    if (result.deletedCount === 0) {
      console.log("Logout: Refresh token non trouvé ou déjà supprimé.");
    } else {
      console.log("Logout: Refresh token supprimé.");
    }

    // Toujours renvoyer un succès, même si le token n'existait pas/plus.
    res.status(200).json({ message: "Déconnexion réussie." });
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

module.exports = router; // Assurez-vous d'exporter le routeur
