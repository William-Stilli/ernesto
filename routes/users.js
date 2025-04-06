// routes/users.js
const express = require("express");
const User = require("../models/User");
const { authenticateToken } = require("../middleware/auth"); // On garde l'import pour /me

const router = express.Router();

// --- GET /api/users/me ---
// RESTE PROTÉGÉ par authenticateToken
router.get("/me", authenticateToken, async (req, res) => {
  // ... (code inchangé pour /me) ...
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select(
      "username balance createdAt"
    );
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé." });
    }
    res.json({
      username: user.username,
      balance: user.balance,
      memberSince: user.createdAt,
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
// DEVIENT PUBLIC - on retire authenticateToken
router.get(
  "/:username",
  /* authenticateToken, */ async (req, res) => {
    // <<< Middleware retiré !
    try {
      const requestedUsername = req.params.username?.toLowerCase();

      if (!requestedUsername) {
        return res
          .status(400)
          .json({ message: "Nom d'utilisateur manquant dans l'URL." });
      }

      // Sélectionner uniquement les champs publics
      const user = await User.findOne({ username: requestedUsername }).select(
        "username createdAt"
      ); // Pas de solde !

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
  }
);

module.exports = router;
