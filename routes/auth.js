// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const TemporaryCode = require("../models/TemporaryCode");
const User = require("../models/User"); // Importer User pour récupérer les infos
require("dotenv").config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/login
// Appelé par l'interface Shop pour se connecter avec pseudo + code
router.post("/login", async (req, res) => {
  const { username, code } = req.body;
  const lowerCaseUsername = username?.toLowerCase();

  if (!lowerCaseUsername || !code) {
    return res.status(400).json({ message: "Username et code requis." });
  }

  try {
    // 1. Trouver le code temporaire dans la DB
    // Mongoose gère l'expiration via l'index TTL, donc on cherche juste le code correspondant
    const tempCode = await TemporaryCode.findOneAndDelete({
      username: lowerCaseUsername,
      code: code,
    });
    // findOneAndDelete est atomique: trouve et supprime. Si trouvé, il est valide et utilisé.

    if (tempCode) {
      // 2. Code valide et utilisé (supprimé), trouver l'utilisateur associé
      const user = await User.findOne({ username: lowerCaseUsername });

      if (!user) {
        // Ne devrait pas arriver si le plugin crée l'user, mais sécurité
        console.warn(
          `Utilisateur ${lowerCaseUsername} non trouvé après validation du code.`
        );
        return res
          .status(401)
          .json({ message: "Utilisateur associé non trouvé." });
      }

      // 3. Générer le JWT
      const userPayload = {
        id: user._id, // ID MongoDB de l'utilisateur
        username: user.username, // Utiliser le username normalisé (minuscules)
        // Ajoutez d'autres infos non sensibles si besoin (ex: roles)
      };
      const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: "3h" }); // Expire dans 3 heures

      console.log(`Login réussi et JWT généré pour ${user.username}`);
      res.json({ token: token, username: user.username }); // Renvoyer le token
    } else {
      // 4. Code non trouvé ou déjà utilisé/expiré
      console.log(
        `Tentative de login échouée pour ${lowerCaseUsername} (code invalide/expiré/utilisé)`
      );
      res
        .status(401)
        .json({ message: "Code invalide, expiré ou déjà utilisé." });
    }
  } catch (error) {
    console.error("Erreur lors du login:", error);
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

module.exports = router;
// routes/auth.js
