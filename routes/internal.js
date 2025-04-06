// routes/internal.js
const express = require("express");
const TemporaryCode = require("../models/TemporaryCode");
const User = require("../models/User");
// Vérifiez attentivement cette ligne d'import :
const { authenticateInternal } = require("../middleware/auth");
const ShopItem = require("../models/ShopItem");

const router = express.Router();

// POST /api/internal/store-code
// Appelé par le plugin Minecraft pour enregistrer un code
// Protégé par une clé API simple
router.post("/store-code", authenticateInternal, async (req, res) => {
  const { username, code } = req.body;
  const lowerCaseUsername = username?.toLowerCase(); // Utiliser le nom en minuscules

  if (!lowerCaseUsername || !code) {
    return res.status(400).json({ message: "Username et code requis." });
  }

  // Vérifiez que le code a le bon format (ex: 6 chiffres)
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({
      message: "Le format du code est invalide (doit être 6 chiffres).",
    });
  }

  try {
    // Optionnel: Créer ou trouver l'utilisateur dans la DB s'il n'existe pas encore
    let user = await User.findOneAndUpdate(
      { username: lowerCaseUsername },
      { $setOnInsert: { username: lowerCaseUsername } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
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

router.post("/sell", authenticateInternal, async (req, res) => {
  // Informations envoyées par le mod/plugin serveur
  // après qu'il ait retiré l'item de la main/inventaire du joueur
  const {
    sellerUsername,
    itemId,
    quantity,
    price,
    itemName,
    itemDescription /*, nbtData */,
  } = req.body;

  // --- Validation Basique ---
  if (
    !sellerUsername ||
    !itemId ||
    !quantity ||
    price === undefined ||
    price === null
  ) {
    return res.status(400).json({
      message: "Données manquantes (sellerUsername, itemId, quantity, price).",
    });
  }
  const intQuantity = parseInt(quantity, 10);
  if (isNaN(intQuantity) || intQuantity < 1) {
    return res
      .status(400)
      .json({ message: "La quantité doit être un entier positif." });
  }
  const numPrice = parseFloat(price);
  if (isNaN(numPrice) || numPrice < 0) {
    return res
      .status(400)
      .json({ message: "Le prix doit être un nombre positif ou zéro." });
  }
  // Utiliser un nom par défaut si non fourni par le mod
  const finalItemName = itemName || itemId;
  const finalDescription = itemDescription || "";

  const lowerCaseSeller = sellerUsername.toLowerCase();
  const lowerCaseItemId = itemId.toLowerCase();

  try {
    // Vérifier que le vendeur existe dans notre DB (sécurité)
    const seller = await User.findOne({ username: lowerCaseSeller });
    if (!seller) {
      console.warn(
        `Tentative de vente par un utilisateur inconnu via API interne: ${lowerCaseSeller}`
      );
      // Important de ne pas créer l'offre si le vendeur n'est pas géré par notre système
      return res.status(404).json({
        message: `Vendeur non géré par le système: ${sellerUsername}`,
      });
    }

    // Créer le nouveau document dans la collection shopitems
    const newListing = new ShopItem({
      itemId: lowerCaseItemId,
      name: finalItemName, // Nom fourni par le mod/plugin ou ID par défaut
      description: finalDescription,
      price: numPrice,
      quantity: intQuantity,
      sellerUsername: lowerCaseSeller, // <<< Identifie comme une vente joueur
      isEnabled: true,
    });

    await newListing.save();

    console.log(
      `Nouvelle vente enregistrée par ${lowerCaseSeller}: ${intQuantity}x ${lowerCaseItemId} pour ${numPrice} (chaque?). ID Listing: ${newListing._id}`
    );
    // Renvoyer un succès, peut-être avec l'ID de l'annonce créée
    res.status(201).json({
      message: "Item mis en vente avec succès.",
      listingId: newListing._id,
    });
  } catch (error) {
    console.error(
      `Erreur lors de la mise en vente par ${lowerCaseSeller} pour ${lowerCaseItemId}:`,
      error
    );
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: `Données de vente invalides: ${error.message}` });
    }
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la mise en vente." });
  }
});

module.exports = router;
