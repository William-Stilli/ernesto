// routes/shop.js
const express = require("express");
const mongoose = require("mongoose"); // Nécessaire pour ObjectId et Session
const User = require("../models/User");
const ShopItem = require("../models/ShopItem");
const PendingDelivery = require("../models/PendingDelivery");
const { authenticateToken } = require("../middleware/auth");
const { sendRconCommand } = require("../utils/rconClient");

const router = express.Router();

// --- GET /items (inchangé, version correcte déjà fournie) ---
router.get("/items", async (req, res) => {
  try {
    const items = await ShopItem.find({ isEnabled: true })
      .select(
        "itemId name description price quantity sellerUsername createdAt adminSellPrice _id"
      )
      .sort({ createdAt: -1 })
      .lean();

    const formattedItems = items.map((item) => {
      let formatted = {
        listingId: item._id.toString(),
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        price: item.price,
        quantity: item.quantity,
        seller: item.sellerUsername || "AdminShop",
        listedAt: item.createdAt,
        adminSellPrice: null,
      };

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

// --- POST /purchase AVEC TRANSACTIONS pour P2P ---
router.post("/purchase", authenticateToken, async (req, res) => {
  const { listingId } = req.body;
  // Assumer req.user est valide grâce à authenticateToken
  const buyerUserId = req.user.id;
  const buyerUsername = req.user.username;

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res
      .status(400)
      .json({ message: "ID de l'offre (listingId) invalide ou manquant." });
  }

  // Initialiser la session en dehors du try pour le finally
  const session = await mongoose.startSession();
  let purchaseStatus = "pending"; // Statut pour gérer les étapes
  let finalBuyerBalance = null;
  let purchasedItemDetails = null;
  let listing; // Pour accès hors transaction si besoin

  try {
    // --- Démarrer la transaction ---
    // La fonction withTransaction gère automatiquement commit/abort
    await session.withTransaction(async () => {
      // 1. Trouver l'offre et l'acheteur (DANS la session)
      listing = await ShopItem.findById(listingId).session(session);
      const buyerUser = await User.findById(buyerUserId).session(session);

      // Vérifications initiales DANS la transaction
      if (!listing) throw new Error("Offre non trouvée.");
      if (!listing.isEnabled) throw new Error("Cette offre n'est plus active.");
      if (!buyerUser) throw new Error("Acheteur non trouvé."); // Théoriquement impossible
      if (listing.sellerUsername === buyerUsername) {
        throw new Error("Vous ne pouvez pas acheter votre propre offre.");
      }
      if (buyerUser.balance < listing.price) {
        throw new Error(
          `Solde insuffisant. Vous avez ${buyerUser.balance}, besoin de ${listing.price}.`
        );
      }

      // Stocker détails pour RCON/Pending (avant potentiel delete)
      purchasedItemDetails = {
        itemId: listing.itemId,
        quantity: listing.quantity,
        name: listing.name,
        description: listing.description,
      };

      // --- Logique différente si Achat P2P ou Admin ---
      if (listing.sellerUsername) {
        // --- ACHAT JOUEUR (Transactionnel) ---
        console.log(
          `[TX] Début achat P2P: ${buyerUsername} achète ${listing.quantity}x ${listing.itemId} de ${listing.sellerUsername} pour ${listing.price}`
        );

        // 2a. Trouver le vendeur (DANS la session)
        const sellerUser = await User.findOne({
          username: listing.sellerUsername,
        }).session(session);
        if (!sellerUser) {
          // Stoppe la transaction
          throw new Error(`Vendeur ${listing.sellerUsername} introuvable.`);
        }

        // 2b. Débiter l'acheteur (DANS la session)
        const buyerUpdateResult = await User.findByIdAndUpdate(
          buyerUserId,
          { $inc: { balance: -listing.price } },
          { new: true, session: session } // <- session
        );
        if (!buyerUpdateResult)
          throw new Error("Échec mise à jour solde acheteur.");
        finalBuyerBalance = buyerUpdateResult.balance;

        // 2c. Créditer le vendeur (DANS la session)
        const sellerUpdateResult = await User.findByIdAndUpdate(
          sellerUser._id,
          { $inc: { balance: listing.price } },
          { new: true, session: session } // <- session
        );
        if (!sellerUpdateResult)
          throw new Error("Échec mise à jour solde vendeur.");

        // 2d. Supprimer l'offre (DANS la session)
        const deleteResult = await ShopItem.findByIdAndDelete(listingId, {
          session: session, // <- session
        });
        if (!deleteResult) throw new Error("Échec suppression de l'offre.");

        console.log(`[TX] Achat P2P ${listingId} traité (DB OK).`);
      } else {
        // --- ACHAT ADMIN (Aussi dans la transaction pour cohérence) ---
        console.log(
          `[TX] Début achat Admin: ${buyerUsername} achète ${listing.quantity}x ${listing.itemId} pour ${listing.price}`
        );

        // 2a. Débiter l'acheteur (DANS la session)
        const buyerUpdateResult = await User.findByIdAndUpdate(
          buyerUserId,
          { $inc: { balance: -listing.price } },
          { new: true, session: session } // <- session
        );
        if (!buyerUpdateResult)
          throw new Error("Échec mise à jour solde acheteur (Admin).");
        finalBuyerBalance = buyerUpdateResult.balance;

        console.log(`[TX] Achat Admin ${listingId} traité (DB OK).`);
      }

      // Si on arrive ici, toutes les opérations DB de la transaction ont réussi
      purchaseStatus = "db_success";
    }); // --- Fin de session.withTransaction() ---

    // --- HORS TRANSACTION : Exécution RCON / Pending Delivery ---
    // Exécuter seulement si la transaction DB a réussi
    if (purchaseStatus === "db_success" && purchasedItemDetails) {
      console.log(
        `[Purchase] Transaction DB ${listingId} réussie. Tentative RCON...`
      );
      const minecraftItemId = `minecraft:${purchasedItemDetails.itemId}`;
      const rconCommand = `give ${buyerUsername} ${minecraftItemId} ${purchasedItemDetails.quantity}`;

      let rconResult;
      try {
        // Appel de la fonction RCON (qui gère sa propre connexion/erreur)
        rconResult = await sendRconCommand(rconCommand);
      } catch (rconError) {
        console.error(
          `[Purchase] Erreur critique appel RCON pour ${listingId}:`,
          rconError
        );
        rconResult = {
          success: false,
          error: rconError.message || "Erreur RCON interne",
        };
      }

      if (rconResult.success) {
        // RCON Succès -> Réponse succès final
        console.log(
          `[Purchase] Achat complet (DB+RCON) réussi pour ${listingId} par ${buyerUsername}.`
        );
        return res.json({
          success: true,
          status: "delivered",
          message: `Achat réussi ! Vous devriez avoir reçu ${
            purchasedItemDetails.quantity
          }x ${purchasedItemDetails.name || purchasedItemDetails.itemId}.`,
          newBalance: finalBuyerBalance,
        });
      } else {
        // RCON Echec -> Créer PendingDelivery (HORS transaction)
        console.warn(
          `[Purchase] Echec RCON pour ${listingId} après succès DB (${rconResult.error}). Mise en attente.`
        );
        const pending = new PendingDelivery({
          buyerUserId: buyerUserId,
          buyerUsername: buyerUsername,
          listingId: listing._id, // Garder référence à l'offre si P2P, sinon null/undefined pour admin ? Utilisons _id de listing récupéré.
          itemId: purchasedItemDetails.itemId,
          quantity: purchasedItemDetails.quantity,
          itemName: purchasedItemDetails.name,
          itemDescription: purchasedItemDetails.description,
          status: "pending",
          purchaseTransactionId: `purchase-${listingId}-${Date.now()}`,
        });
        await pending.save(); // Sauvegarde hors transaction

        return res.json({
          success: true,
          status: "pending_delivery",
          message: `Achat réussi ! La livraison en jeu a échoué, l'item a été mis de côté. Utilisez /redeem en jeu.`,
          newBalance: finalBuyerBalance,
        });
      }
    } else if (purchaseStatus === "pending") {
      // Ce cas ne devrait pas arriver si withTransaction lève une erreur, mais sécurité
      console.error(
        `[Purchase] Status 'pending' après withTransaction pour ${listingId}. L'erreur transaction aurait dû être attrapée.`
      );
      throw new Error(
        "La transaction base de données a échoué mais n'a pas levé d'erreur interceptée."
      );
    }
  } catch (error) {
    // Attrape les erreurs levées par withTransaction ou le code avant/après
    console.error(
      `Erreur globale lors de l'achat ${listingId} par ${buyerUsername}:`,
      error.message,
      error.stack // Log stack pour aider au debug
    );
    // Renvoyer une erreur 400 (Bad Request) pour les erreurs liées à l'achat
    // ou 500 pour des erreurs serveur inattendues. 400 est souvent approprié ici.
    return res.status(400).json({
      success: false,
      message: error.message || "Erreur lors de l'achat.",
    });
  } finally {
    // Toujours terminer la session MongoDB
    await session.endSession();
    console.log(
      `[Purchase] Session MongoDB terminée pour l'achat ${listingId}.`
    );
  }
});

module.exports = router;
