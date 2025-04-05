// routes/internal.js
const express = require("express");
const TemporaryCode = require("../models/TemporaryCode");
const User = require("../models/User"); // Importer User pour créer/trouver l'utilisateur
const { authenticateInternal } = require("../middleware/auth");

const router = express.Router();

// POST /api/internal/store-code
// Appelé par le plugin Minecraft pour enregistrer un code
// Protégé par une clé API simple (à améliorer si besoin: IP whitelist, etc.)
router.post("/store-code", authenticateInternal, async (req, res) => {
  const { username, code } = req.body;
  const lowerCaseUsername = username?.toLowerCase(); // Utiliser le nom en minuscules

  if (!lowerCaseUsername || !code) {
    return res.status(400).json({ message: "Username et code requis." });
  }

  // Vérifiez que le code a le bon format (ex: 6 chiffres)
  if (!/^\d{6}$/.test(code)) {
    return res
      .status(400)
      .json({
        message: "Le format du code est invalide (doit être 6 chiffres).",
      });
  }

  try {
    // Optionnel: Créer ou trouver l'utilisateur dans la DB s'il n'existe pas encore
    // Cela garantit que seul un joueur existant (vu par le plugin) peut avoir un code
    let user = await User.findOneAndUpdate(
      { username: lowerCaseUsername },
      {
        $setOnInsert: {
          username: lowerCaseUsername /*, originalCaseUsername: username */,
        },
      }, // Crée avec le nom en minuscules si non trouvé
      { upsert: true, new: true, setDefaultsOnInsert: true } // Crée si absent, retourne le doc nouveau/mis à jour
    );

    if (!user) {
      console.error(
        `Échec de la création/récupération de l'utilisateur: ${lowerCaseUsername}`
      );
      return res
        .status(500)
        .json({ message: "Erreur lors de la gestion de l'utilisateur." });
    }

    // Supprimer les anciens codes pour cet utilisateur avant d'en créer un nouveau
    await TemporaryCode.deleteMany({ username: lowerCaseUsername });

    // Créer le nouveau code temporaire
    const tempCode = new TemporaryCode({ username: lowerCaseUsername, code });
    await tempCode.save();

    console.log(`Code ${code} enregistré pour ${lowerCaseUsername}`);
    res.status(201).json({ message: "Code enregistré avec succès." });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du code:", error);
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

module.exports = router;
