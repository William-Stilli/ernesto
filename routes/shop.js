// routes/shop.js

const express = require("express");
// Importer mongoose SEULEMENT si on l'utilise ailleurs (ex: pour ObjectId.isValid)
const mongoose = require("mongoose");
const User = require("../models/User");
const ShopItem = require("../models/ShopItem");
const PendingDelivery = require("../models/PendingDelivery");
const { authenticateToken } = require("../middleware/auth");
const { sendRconCommand } = require("../utils/rconClient");

const router = express.Router();

// --- GET /items reste inchangé ---
// routes/shop.js (Route GET /items corrigée)

router.get("/items", async (req, res) => {
  try {
    const items = await ShopItem.find({ isEnabled: true })
      // Ajoute adminSellPrice à la sélection
      .select(
        "itemId name description price quantity sellerUsername createdAt adminSellPrice _id"
      )
      .sort({ createdAt: -1 })
      .lean(); // Utiliser lean() pour des objets JS simples peut être bien ici

    const formattedItems = items.map((item) => {
      // Objet de base
      let formatted = {
        listingId: item._id.toString(), // Convertir ObjectId en string
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        price: item.price, // Prix d'achat par le joueur
        quantity: item.quantity,
        seller: item.sellerUsername || "AdminShop",
        listedAt: item.createdAt,
        adminSellPrice: null, // Initialiser à null par défaut
      };

      // Ajouter adminSellPrice seulement si c'est un item Admin et qu'il a une valeur
      if (
        !item.sellerUsername &&
        typeof item.adminSellPrice === "number" &&
        item.adminSellPrice >= 0
      ) {
        formatted.adminSellPrice = item.adminSellPrice;
      }

      return formatted;
    });

    res.json(formattedItems);
  } catch (error) {
    console.error("Erreur lors de la récupération des items:", error);
    res
      .status(500)
      .json({ message: "Erreur serveur lors de la récupération des items." });
  }
});

// --- POST /purchase VERSION SANS TRANSACTIONS ---
router.post("/purchase", authenticateToken, async (req, res) => {
  const { listingId } = req.body;
  const buyerUserId = req.user.id;
  const buyerUsername = req.user.username;

  // Toujours utile de valider l'ID même sans transaction
  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res
      .status(400)
      .json({ message: "ID de l'offre (listingId) invalide ou manquant." });
  }

  // PAS DE SESSION / TRANSACTION ICI

  try {
    // 1. Trouver l'offre et l'acheteur (SANS session)
    // Utiliser lean() peut être plus performant si on ne modifie pas directement les docs Mongoose
    const listing = await ShopItem.findById(listingId).lean(); // Utiliser lean()
    const buyerUser = await User.findById(buyerUserId).lean(); // Utiliser lean()

    // Mêmes vérifications initiales
    if (!listing) throw new Error("Offre non trouvée.");
    if (!listing.isEnabled) throw new Error("Cette offre n'est plus active.");
    if (!buyerUser) throw new Error("Acheteur non trouvé.");
    if (listing.sellerUsername === buyerUsername)
      throw new Error("Vous ne pouvez pas acheter votre propre offre.");
    if (buyerUser.balance < listing.price) {
      throw new Error(
        `Solde insuffisant. Vous avez ${buyerUser.balance}, besoin de ${listing.price}.`
      );
    }

    let rconSuccess = false;
    let finalBuyerBalance = null;
    let purchaseProcessed = false; // Flag pour savoir si on a modifié la DB

    // Stocker les détails pour RCON / PendingDelivery
    const purchasedItemDetails = {
      itemId: listing.itemId,
      quantity: listing.quantity,
      name: listing.name,
      description: listing.description,
    };

    if (listing.sellerUsername) {
      // --- ACHAT JOUEUR (non atomique) ---
      console.log(
        `Début achat joueur (SANS TX): ${buyerUsername} achète ${listing.quantity}x ${listing.itemId} de ${listing.sellerUsername} pour ${listing.price}`
      );
      const sellerUser = await User.findOne({
        username: listing.sellerUsername,
      }).lean(); // Utiliser lean()
      if (!sellerUser)
        throw new Error(`Vendeur ${listing.sellerUsername} introuvable.`);

      // !! Risque ici : si l'une des opérations échoue, l'autre n'est pas annulée !!
      // 2a. Débiter l'acheteur
      const buyerUpdateResult = await User.findByIdAndUpdate(
        buyerUserId,
        { $inc: { balance: -listing.price } },
        { new: true } // Retourne le doc mis à jour
      );
      if (!buyerUpdateResult)
        throw new Error("Échec de la mise à jour du solde acheteur.");
      finalBuyerBalance = buyerUpdateResult.balance; // Stocker le nouveau solde

      // 2b. Créditer le vendeur
      const sellerUpdateResult = await User.findByIdAndUpdate(sellerUser._id, {
        $inc: { balance: listing.price },
      });
      if (!sellerUpdateResult) {
        // Essayer de rollback le débit acheteur (best effort)
        console.error(
          `ERREUR CRITIQUE: Echec crédit vendeur ${listing.sellerUsername} après débit acheteur ${buyerUsername}. Tentative de rollback acheteur.`
        );
        await User.findByIdAndUpdate(buyerUserId, {
          $inc: { balance: listing.price },
        }); // Re-créditer
        throw new Error(
          `Échec de la mise à jour du solde vendeur. Achat annulé.`
        );
      }

      // 2c. Supprimer l'offre (seulement après succès débit/crédit)
      await ShopItem.findByIdAndDelete(listingId);
      purchaseProcessed = true;
      console.log(
        `Achat joueur ${listingId} traité (DB modifiée, offre supprimée).`
      );
    } else {
      // --- ACHAT ADMIN (relativement sûr avec $inc) ---
      console.log(
        `Début achat admin (SANS TX): ${buyerUsername} achète ${listing.quantity}x ${listing.itemId} pour ${listing.price}`
      );

      // 2a. Débiter l'acheteur (atomique sur ce seul document)
      const buyerUpdateResult = await User.findByIdAndUpdate(
        buyerUserId,
        { $inc: { balance: -listing.price } },
        { new: true }
      );
      if (!buyerUpdateResult)
        throw new Error("Échec de la mise à jour du solde acheteur (Admin).");
      finalBuyerBalance = buyerUpdateResult.balance;
      purchaseProcessed = true;
      console.log(`Achat admin ${listingId} traité (DB modifiée).`);
    }

    // --- Si la partie DB a réussi, tenter RCON ---
    if (purchaseProcessed) {
      const minecraftItemId = `minecraft:${purchasedItemDetails.itemId}`;
      const rconCommand = `give ${buyerUsername} ${minecraftItemId} ${purchasedItemDetails.quantity}`;
      const rconResult = await sendRconCommand(rconCommand); // Utilise la version qui NE GERE PAS la queue
      rconSuccess = rconResult.success;

      if (!rconSuccess) {
        // RCON Echec -> Mettre en attente
        console.warn(
          `Echec RCON pour ${listingId} après succès DB (${rconResult.error}). Mise en attente de la livraison.`
        );
        const pending = new PendingDelivery({
          buyerUserId: buyerUserId,
          buyerUsername: buyerUsername,
          listingId: listingId,
          itemId: purchasedItemDetails.itemId,
          quantity: purchasedItemDetails.quantity,
          itemName: purchasedItemDetails.name,
          itemDescription: purchasedItemDetails.description,
          status: "pending",
          purchaseTransactionId: listingId, // Utiliser listingId comme référence
        });
        await pending.save(); // Sauvegarde HORS transaction

        res.json({
          // Renvoyer succès mais statut pending
          success: true,
          status: "pending_delivery",
          message: `Achat réussi ! Votre item a été mis de côté et sera disponible via /redeem en jeu.`,
          newBalance: finalBuyerBalance,
        });
      } else {
        // RCON Succès -> Livraison OK
        console.log(
          `Achat complet (DB+RCON) réussi pour ${listingId} par ${buyerUsername}`
        );
        res.json({
          success: true,
          status: "delivered",
          message: `Achat réussi ! Vous devriez avoir reçu ${
            purchasedItemDetails.quantity
          }x ${purchasedItemDetails.name || purchasedItemDetails.itemId}.`,
          newBalance: finalBuyerBalance,
        });
      }
    } else {
      // Ne devrait pas arriver si la logique est correcte
      throw new Error(
        "La modification de la base de données n'a pas été marquée comme traitée."
      );
    }
  } catch (error) {
    console.error(
      `Erreur globale lors de l'achat (SANS TX) de ${listingId} par ${buyerUsername}:`,
      error.message
    );
    res
      .status(400)
      .json({ message: error.message || "Erreur lors de l'achat." });
  }
  // PAS DE session.endSession() ici
});

module.exports = router;
