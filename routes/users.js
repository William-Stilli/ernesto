// routes/users.js
const express = require("express");
const User = require("../models/User");
const { authenticateToken } = require("../middleware/auth"); // On utilise authenticateToken pour /me

const router = express.Router();

// --- GET /api/users/me ---
// Déjà protégé par authenticateToken. Renvoie maintenant aussi le rôle.
router.get("/me", authenticateToken, async (req, res) => {
  // authenticateToken a déjà mis le payload JWT dans req.user (incluant id, username, role)
  try {
    const userId = req.user.id;
    const userRole = req.user.role; // <<< Récupérer le rôle depuis le token
    const username = req.user.username;

    // Optionnel: Re-vérifier en base si on veut être ultra-parano, mais le token fait foi pour le rôle ici.
    // const userFromDb = await User.findById(userId).select("balance createdAt");
    // if (!userFromDb) {
    //   return res.status(404).json({ message: "Utilisateur non trouvé en base." });
    // }

    // Pour la réponse, on utilise directement les infos du token + infos spécifiques de la DB si besoin
    const userFromDb = await User.findById(userId).select("balance createdAt"); // On récupère quand même balance/createdAt
    if (!userFromDb) {
      console.warn(
        `Utilisateur ${username} (ID: ${userId}) trouvé dans le token mais pas dans la DB pour /me.`
      );
      return res
        .status(404)
        .json({ message: "Données utilisateur introuvables." });
    }

    // Renvoyer les informations nécessaires, Y COMPRIS LE ROLE
    res.json({
      username: username,
      role: userRole, // <<< Renvoyer le rôle
      balance: userFromDb.balance, // Depuis la DB
      memberSince: userFromDb.createdAt, // Depuis la DB
    });
  } catch (error) {
    console.error(
      `Erreur lors de la récupération de l'utilisateur /me (ID: ${req.user?.id}):`,
      error
    );
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

// --- GET /api/users/:username ---
// Reste public et ne renvoie PAS le rôle ni le solde
router.get("/:username", async (req, res) => {
  try {
    const requestedUsername = req.params.username?.toLowerCase();

    if (!requestedUsername) {
      return res
        .status(400)
        .json({ message: "Nom d'utilisateur manquant dans l'URL." });
    }

    const user = await User.findOne({ username: requestedUsername }).select(
      "username createdAt" // Sélection publique
    );

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé." });
    }

    res.json({
      username: user.username,
      memberSince: user.createdAt,
    });
  } catch (error) {
    console.error(
      `Erreur lors de la récupération de l'utilisateur /:username (${req.params.username}):`,
      error
    );
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

module.exports = router;
