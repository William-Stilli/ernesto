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

router.get("/pending-deliveries", authenticateInternal, async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ message: "Paramètre username manquant." });
  }
  const lowerCaseUsername = username.toLowerCase();

  try {
    // Trouver l'utilisateur pour obtenir son ID
    const user = await User.findOne({ username: lowerCaseUsername }).select(
      "_id"
    );
    if (!user) {
      // Ne pas dire si l'user existe ou pas, juste qu'il n'y a rien à récupérer
      console.log(
        `[Pending Deliveries] Utilisateur ${lowerCaseUsername} non trouvé pour la réclamation.`
      );
      return res.json([]); // Renvoyer un tableau vide
    }

    // Trouver les livraisons en attente pour cet utilisateur
    const pending = await PendingDelivery.find({
      buyerUserId: user._id,
      status: "pending",
    }).select("itemId quantity name description nbtData _id"); // Renvoyer l'ID de livraison (_id)

    const formattedPending = pending.map((p) => ({
      deliveryId: p._id, // L'ID unique de cette livraison en attente
      itemId: p.itemId,
      quantity: p.quantity,
      name: p.name,
      description: p.description,
      // nbtData: p.nbtData
    }));

    console.log(
      `[Pending Deliveries] ${formattedPending.length} item(s) en attente trouvés pour ${lowerCaseUsername}`
    );
    res.json(formattedPending); // Renvoyer la liste
  } catch (error) {
    console.error(
      `Erreur lors de la récupération des livraisons pour ${lowerCaseUsername}:`,
      error
    );
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

// POST /api/internal/confirm-delivery
// Appelé par le mod/plugin serveur APRES avoir donné les items au joueur
router.post("/confirm-delivery", authenticateInternal, async (req, res) => {
  // Attends un tableau d'IDs de livraisons qui ont été données avec succès en jeu
  const { deliveryIds } = req.body;

  if (!deliveryIds || !Array.isArray(deliveryIds) || deliveryIds.length === 0) {
    return res
      .status(400)
      .json({ message: "Tableau deliveryIds manquant ou vide." });
  }

  // Vérifier que ce sont des ObjectIds valides (optionnel mais propre)
  const validObjectIds = deliveryIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (validObjectIds.length !== deliveryIds.length) {
    console.warn(
      "[Confirm Delivery] Certains IDs fournis n'étaient pas valides."
    );
  }
  if (validObjectIds.length === 0) {
    return res
      .status(400)
      .json({ message: "Aucun ID de livraison valide fourni." });
  }

  try {
    // Mettre à jour le statut des livraisons confirmées
    // On pourrait aussi les supprimer : await PendingDelivery.deleteMany(...)
    const updateResult = await PendingDelivery.updateMany(
      { _id: { $in: validObjectIds }, status: "pending" }, // Condition : seulement celles en attente
      { $set: { status: "delivered", deliveredAt: new Date() } }
    );

    console.log(
      `[Confirm Delivery] Confirmation reçue pour ${deliveryIds.length} IDs. Mis à jour: ${updateResult.modifiedCount}.`
    );

    if (updateResult.matchedCount !== validObjectIds.length) {
      console.warn(
        `[Confirm Delivery] Certains IDs (${
          validObjectIds.length - updateResult.matchedCount
        }) n'ont pas été trouvés ou n'étaient pas en statut 'pending'.`
      );
    }

    res.status(200).json({
      message: `${updateResult.modifiedCount} livraison(s) marquée(s) comme délivrée(s).`,
    });
  } catch (error) {
    console.error("Erreur lors de la confirmation de livraison:", error);
    res.status(500).json({ message: "Erreur serveur interne." });
  }
});

// --- NOUVELLE ROUTE pour créditer un joueur (appelée par le mod/plugin) ---
// POST /api/internal/credit-balance
router.post("/credit-balance", authenticateInternal, async (req, res) => {
  const { username, amount, reason } = req.body;

  // --- Validation ---
  if (!username || amount === undefined || amount === null) {
    return res
      .status(400)
      .json({ message: "Données manquantes (username, amount)." });
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    // On ne crédite que des montants positifs
    return res
      .status(400)
      .json({
        message:
          "Le montant à créditer doit être un nombre strictement positif.",
      });
  }
  const lowerCaseUsername = username.toLowerCase();

  try {
    // Trouver l'utilisateur et incrémenter son solde (atomique)
    const updatedUser = await User.findOneAndUpdate(
      { username: lowerCaseUsername },
      { $inc: { balance: numAmount } },
      { new: true } // Retourne le document mis à jour
    );

    if (!updatedUser) {
      console.warn(
        `[Credit Balance] Tentative de crédit pour utilisateur inconnu: ${lowerCaseUsername}`
      );
      return res
        .status(404)
        .json({ message: `Utilisateur non trouvé: ${username}` });
    }

    // Succès
    console.log(
      `[Credit Balance] Utilisateur ${lowerCaseUsername} crédité de ${numAmount}. Nouveau solde: ${
        updatedUser.balance
      }. Raison: ${reason || "Non spécifiée"}`
    );
    res.status(200).json({
      message: `Joueur crédité avec succès.`,
      newBalance: updatedUser.balance,
    });
  } catch (error) {
    console.error(`Erreur lors du crédit pour ${lowerCaseUsername}:`, error);
    res.status(500).json({ message: "Erreur serveur interne lors du crédit." });
  }
});

module.exports = router;
