// routes/shop.js
const express = require("express");
const User = require("../models/User");
const ShopItem = require("../models/ShopItem"); // <<< Importer le nouveau modèle
const { authenticateToken } = require("../middleware/auth");
const { sendRconCommand } = require("../utils/rconClient");
const mongoose = require("mongoose");

const router = express.Router();

// GET /api/shop/items - Renvoie maintenant TOUTES les offres actives (Admin + Joueurs)
router.get("/items", async (req, res) => {
  try {
    // Récupérer tous les items où isEnabled est true
    const items = await ShopItem.find({ isEnabled: true })
      // Sélectionner les champs utiles pour l'interface Shop
      // _id est maintenant l'identifiant unique de l'OFFRE
      .select(
        "itemId name description price quantity sellerUsername createdAt _id"
      )
      .sort({ createdAt: -1 }); // Trier par date de création, les plus récentes d'abord ?

    // On peut mapper pour clarifier Admin vs Player si besoin pour le front-end
    const formattedItems = items.map((item) => ({
      listingId: item._id, // Utiliser _id comme identifiant unique de l'offre
      itemId: item.itemId,
      name: item.name,
      description: item.description,
      price: item.price,
      quantity: item.quantity,
      seller: item.sellerUsername || "AdminShop", // Indiquer 'AdminShop' si sellerUsername est null/vide
      listedAt: item.createdAt,
    }));

    res.json(formattedItems); // Renvoyer les items formatés
  } catch (error) {
    console.error("Erreur lors de la récupération des items:", error);
    res
      .status(500)
      .json({ message: "Erreur serveur lors de la récupération des items." });
  }
});

router.post("/purchase", authenticateToken, async (req, res) => {
  const { listingId } = req.body;
  const buyerUserId = req.user.id;
  const buyerUsername = req.user.username;

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    // Garder mongoose ici pour ObjectId.isValid
    return res
      .status(400)
      .json({ message: "ID de l'offre (listingId) invalide ou manquant." });
  }

  // PAS DE SESSION / TRANSACTION ICI

  try {
    // 1. Trouver l'offre et l'acheteur (SANS session)
    const listing = await ShopItem.findById(listingId);
    const buyerUser = await User.findById(buyerUserId);

    // Mêmes vérifications qu'avant
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
    let finalBuyerBalance = buyerUser.balance; // Init avec balance actuelle

    if (listing.sellerUsername) {
      // --- ACHAT JOUEUR (non atomique) ---
      console.log(
        `Début achat joueur (SANS TX): ${buyerUsername} achète ${listing.quantity}x ${listing.itemId} de ${listing.sellerUsername} pour ${listing.price}`
      );
      const sellerUser = await User.findOne({
        username: listing.sellerUsername,
      });
      if (!sellerUser)
        throw new Error(`Vendeur ${listing.sellerUsername} introuvable.`);

      // !! Risque ici : si l'une des opérations échoue, l'autre n'est pas annulée !!
      // 2a. Débiter l'acheteur
      const updatedBuyer = await User.findByIdAndUpdate(
        buyerUserId,
        { $inc: { balance: -listing.price } },
        { new: true } // Retourne le doc mis à jour
      );
      if (!updatedBuyer)
        throw new Error("Échec de la mise à jour du solde acheteur.");
      finalBuyerBalance = updatedBuyer.balance; // Stocker le nouveau solde

      // 2b. Créditer le vendeur
      await User.findByIdAndUpdate(sellerUser._id, {
        $inc: { balance: listing.price },
      });
      // On ne vérifie même pas le succès ici pour simplifier, mais on pourrait

      // 3. Tenter RCON (après modifs DB)
      const minecraftItemId = `minecraft:${listing.itemId}`;
      const rconCommand = `give ${buyerUsername} ${minecraftItemId} ${listing.quantity}`;
      const rconResult = await sendRconCommand(rconCommand);
      rconSuccess = rconResult.success;
      if (!rconSuccess)
        console.error(
          `Erreur RCON (Achat Joueur) pour ${listingId}: ${rconResult.error}`
        );

      // 4. Supprimer l'offre (même si RCON échoue pour l'instant)
      await ShopItem.findByIdAndDelete(listingId);
      console.log(
        `Achat joueur ${listingId} traité (DB modifiée, offre supprimée). Statut RCON: ${rconSuccess}`
      );
    } else {
      // --- ACHAT ADMIN (relativement sûr avec $inc) ---
      console.log(
        `Début achat admin (SANS TX): ${buyerUsername} achète ${listing.quantity}x ${listing.itemId} pour ${listing.price}`
      );

      // 2a. Débiter l'acheteur (atomique sur ce seul document)
      const updatedBuyer = await User.findByIdAndUpdate(
        buyerUserId,
        { $inc: { balance: -listing.price } },
        { new: true }
      );
      if (!updatedBuyer)
        throw new Error("Échec de la mise à jour du solde acheteur (Admin).");
      finalBuyerBalance = updatedBuyer.balance;

      // 3. Tenter RCON
      const minecraftItemId = `minecraft:${listing.itemId}`;
      const rconCommand = `give ${buyerUsername} ${minecraftItemId} ${listing.quantity}`;
      const rconResult = await sendRconCommand(rconCommand);
      rconSuccess = rconResult.success;
      if (!rconSuccess)
        console.error(
          `Erreur RCON (Achat Admin) pour ${listingId}: ${rconResult.error}`
        );

      console.log(
        `Achat admin ${listingId} traité (DB modifiée). Statut RCON: ${rconSuccess}`
      );
      // Pas de suppression de l'offre admin
    }

    // --- Réponse finale ---
    if (!rconSuccess) {
      // Renvoyer succès partiel avec avertissement si RCON a échoué
      return res.status(200).json({
        success: true, // La partie financière est OK (ou au mieux sans TX)
        warning:
          "L'achat a été enregistré et votre solde mis à jour, mais une erreur est survenue lors de la livraison de l'item en jeu. Contactez un administrateur.",
        listingId: listingId,
        newBalance: finalBuyerBalance,
      });
    } else {
      // Succès complet
      res.json({
        success: true,
        message: `Achat réussi ! Vous devriez recevoir ${listing.quantity}x ${
          listing.name || listing.itemId
        }.`,
        newBalance: finalBuyerBalance,
      });
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
});

module.exports = router;
