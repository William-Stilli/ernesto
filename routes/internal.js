// routes/internal.js
const express = require("express");
const mongoose = require("mongoose"); // Nécessaire pour vérifier les ObjectId potentiellement
const TemporaryCode = require("../models/TemporaryCode");
const User = require("../models/User");
const ShopItem = require("../models/ShopItem");
const PlayerQuest = require("../models/PlayerQuest"); // <<< Importer PlayerQuest
const QuestDefinition = require("../models/QuestDefinition"); // <<< Importer QuestDefinition
const PendingDelivery = require("../models/PendingDelivery"); // <<< Importer PendingDelivery
const { authenticateInternal } = require("../middleware/auth");
const { sendRconCommand } = require("../utils/rconClient"); // <<< Importer sendRconCommand

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
    return res.status(400).json({
      message: "Le montant à créditer doit être un nombre strictement positif.",
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

// POST /api/internal/claim-all-rewards
router.post("/claim-all-rewards", authenticateInternal, async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ message: "Username manquant." });
  }
  const lowerCaseUsername = username.toLowerCase();

  // Utiliser une session pour regrouper les mises à jour DB si possible
  const dbSession = await mongoose.startSession();
  let rewardsSummary = {
    money: 0,
    xp: 0,
    items: [],
    errors: [],
    successes: [],
  };
  let questIdsToUpdate = [];
  let finalBalance = null;

  try {
    await dbSession.withTransaction(async () => {
      // 1. Trouver l'utilisateur
      const user = await User.findOne({ username: lowerCaseUsername }).session(
        dbSession
      );
      if (!user) {
        // Pas besoin de transaction si l'user n'existe pas
        // await dbSession.abortTransaction(); // Inutile avec withTransaction qui rollback
        throw new Error(`Utilisateur ${username} non trouvé.`);
      }
      finalBalance = user.balance; // Solde initial

      // 2. Trouver les quêtes complétées et non réclamées, peupler la définition
      const completedQuests = await PlayerQuest.find({
        userId: user._id,
        status: "completed",
      })
        .populate("questDefinitionId")
        .session(dbSession);

      if (completedQuests.length === 0) {
        // await dbSession.abortTransaction(); // Inutile
        // Pas une erreur, juste rien à réclamer
        purchaseStatus = "no_quests"; // Pour indiquer qu'il ne faut rien faire après
        return; // Sortir de withTransaction
      }

      console.log(
        `[Claim Rewards] ${completedQuests.length} quête(s) complétée(s) trouvée(s) pour ${username}`
      );
      questIdsToUpdate = completedQuests.map((q) => q._id); // IDs des PlayerQuest à mettre à jour

      // 3. Agréger les récompenses et préparer les mises à jour DB
      let totalMoneyReward = 0;
      let totalXpReward = 0;
      let itemsToGive = {}; // { 'minecraft:diamond': 5, 'minecraft:iron_ingot': 10 }

      for (const quest of completedQuests) {
        if (
          !quest.questDefinitionId ||
          typeof quest.questDefinitionId !== "object"
        ) {
          console.warn(
            `[Claim Rewards] Définition manquante pour PlayerQuest ${quest._id}, récompenses ignorées.`
          );
          continue; // Ignorer cette quête si la définition manque
        }
        const definition = quest.questDefinitionId;
        for (const reward of definition.rewards) {
          switch (reward.type) {
            case "money":
              totalMoneyReward += reward.amount || 0;
              break;
            case "xp":
              totalXpReward += reward.amount || 0;
              break;
            case "item":
              if (reward.itemId) {
                const currentQty = itemsToGive[reward.itemId] || 0;
                itemsToGive[reward.itemId] =
                  currentQty + (reward.quantity || 1);
              }
              break;
          }
        }
        // Ajouter les récompenses au résumé pour la réponse finale
        rewardsSummary.successes.push(
          `Récompenses pour '${definition.title}' agrégées.`
        );
      }

      // 4. Appliquer les mises à jour DB (Argent + Statut Quêtes) atomiquement
      if (totalMoneyReward > 0) {
        user.balance += totalMoneyReward; // Met à jour l'objet en mémoire
      }
      // Sauver l'utilisateur (met à jour le solde)
      await user.save({ session: dbSession });
      finalBalance = user.balance; // Nouveau solde après ajout argent

      // Marquer toutes les quêtes traitées comme réclamées
      if (questIdsToUpdate.length > 0) {
        await PlayerQuest.updateMany(
          { _id: { $in: questIdsToUpdate } },
          { $set: { status: "reward_claimed", claimedAt: new Date() } }
        ).session(dbSession);
      }

      rewardsSummary.money = totalMoneyReward;
      rewardsSummary.xp = totalXpReward;
      rewardsSummary.items = Object.entries(itemsToGive).map(([id, qty]) => ({
        itemId: id,
        quantity: qty,
      }));

      console.log(
        `[Claim Rewards] Transaction DB pour ${username} OK. Argent: ${totalMoneyReward}, XP: ${totalXpReward}, Items: ${JSON.stringify(
          rewardsSummary.items
        )}`
      );
      // Si on arrive ici sans erreur, la transaction sera committée
      purchaseStatus = "db_success";
    }); // Fin de session.withTransaction()

    // --- Hors Transaction : Exécution RCON si DB OK ---
    if (purchaseStatus === "db_success") {
      console.log(`[Claim Rewards] Exécution RCON pour ${username}...`);
      let rconErrors = [];

      // Exécuter la commande XP (si > 0)
      if (rewardsSummary.xp > 0) {
        const xpCommand = `xp add ${username} ${rewardsSummary.xp} levels`; // ou 'points' selon le besoin
        const xpResult = await sendRconCommand(xpCommand);
        if (!xpResult.success) {
          console.error(
            `[Claim Rewards] Echec RCON XP pour ${username}: ${xpResult.error}`
          );
          rconErrors.push(`XP (${rewardsSummary.xp}) : ${xpResult.error}`);
          // QUE FAIRE? Pour l'instant on loggue et continue
        } else {
          rewardsSummary.successes.push(`XP (${rewardsSummary.xp}) donné.`);
        }
      }

      // Exécuter les commandes Give pour chaque item
      for (const item of rewardsSummary.items) {
        // S'assurer que l'ID est bien formaté (ex: minecraft:diamond)
        const fullItemId = item.itemId.includes(":")
          ? item.itemId
          : `minecraft:${item.itemId}`;
        const giveCommand = `give ${username} ${fullItemId} ${item.quantity}`;
        const giveResult = await sendRconCommand(giveCommand);
        if (!giveResult.success) {
          console.error(
            `[Claim Rewards] Echec RCON Give ${item.quantity}x ${item.itemId} pour ${username}: ${giveResult.error}`
          );
          rconErrors.push(
            `${item.quantity}x ${item.itemId}: ${giveResult.error}`
          );
          // Créer une livraison en attente pour cet item spécifique
          try {
            const pending = new PendingDelivery({
              buyerUserId: user._id, // Utiliser l'ID user trouvé au début (nécessite de le sortir de la transaction)
              buyerUsername: lowerCaseUsername,
              itemId: item.itemId,
              quantity: item.quantity,
              itemName: item.itemId, // Utiliser l'ID comme nom par défaut ici
              status: "pending",
              purchaseTransactionId: `claim-${Date.now()}`, // ID de référence
            });
            await pending.save();
            rewardsSummary.successes.push(
              `${item.quantity}x ${item.itemId} mis en attente (échec RCON).`
            );
          } catch (pendingError) {
            console.error(
              `[Claim Rewards] ERREUR CRITIQUE lors de la création PendingDelivery pour ${item.itemId}: ${pendingError}`
            );
            // Logguer ++
          }
        } else {
          rewardsSummary.successes.push(
            `${item.quantity}x ${item.itemId} donné.`
          );
        }
      }

      rewardsSummary.errors = rconErrors;

      // Renvoyer le résumé complet
      return res.status(200).json({
        message: `Réclamations traitées. ${
          rconErrors.length > 0
            ? "Certaines récompenses n'ont pu être données via RCON et ont été mises en attente (/redeem)."
            : ""
        }`,
        summary: rewardsSummary,
        newBalance: finalBalance,
      });
    } else if (purchaseStatus === "no_quests") {
      return res
        .status(200)
        .json({
          message: "Aucune quête terminée à réclamer.",
          summary: rewardsSummary,
          newBalance: finalBalance,
        });
    } else {
      // La transaction DB a échoué, l'erreur a déjà été levée
      // Normalement on n'arrive pas ici avec withTransaction
      throw new Error("La transaction de réclamation a échoué.");
    }
  } catch (error) {
    console.error(
      `Erreur globale lors de la réclamation pour ${lowerCaseUsername}:`,
      error.message
    );
    res
      .status(400)
      .json({
        message:
          error.message || "Erreur lors de la réclamation des récompenses.",
      });
  } finally {
    await dbSession.endSession();
    console.log(
      `[Claim Rewards] Session MongoDB terminée pour ${lowerCaseUsername}`
    );
  }
});

module.exports = router;
