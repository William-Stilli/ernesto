// routes/shop.js
const express = require("express");
const User = require("../models/User");
const { authenticateToken } = require("../middleware/auth");
const { sendRconCommand } = require("../utils/rconClient");

const router = express.Router();

// --- Simulation de la base de données des items ---
// Dans une vraie application, ceci viendrait de votre base de données
const shopItems = {
  diamond: { price: 50, description: "Un diamant brillant" },
  iron_ingot: { price: 5, description: "Un lingot de fer" },
  dirt: { price: 1, description: "Juste de la terre..." },
};
// --- Fin de la simulation ---

// GET /api/shop/items - Endpoint pour lister les items (pas besoin d'être logué)
router.get("/items", (req, res) => {
  res.json(shopItems);
});

// POST /api/shop/purchase
// Achète un item - Protégé par JWT
router.post("/purchase", authenticateToken, async (req, res) => {
  const { itemId, quantity = 1 } = req.body;
  const userId = req.user.id; // Récupéré depuis le JWT vérifié
  const username = req.user.username; // Récupéré depuis le JWT

  if (!itemId || !shopItems[itemId]) {
    return res.status(400).json({ message: "ID d'item invalide ou manquant." });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res
      .status(400)
      .json({ message: "La quantité doit être un entier positif." });
  }

  const item = shopItems[itemId];
  const totalPrice = item.price * quantity;

  try {
    // Utiliser une transaction pour garantir l'atomicité (si MongoDB >= 4.0 et replica set/Atlas)
    // Pour une instance standalone simple, on fait au mieux sans transaction explicite
    // Mais findOneAndUpdate est atomique sur un seul document.

    // 1. Trouver l'utilisateur et vérifier son solde
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé." });
    }

    if (user.balance < totalPrice) {
      console.log(
        `Achat échoué: Solde insuffisant pour ${username} (solde: ${user.balance}, coût: ${totalPrice})`
      );
      return res
        .status(400)
        .json({
          message: `Solde insuffisant. Vous avez ${user.balance}, besoin de ${totalPrice}.`,
        });
    }

    // 2. Essayer d'envoyer la commande RCON *avant* de déduire le solde (plus sûr)
    //    Adaptez l'ID de l'item si besoin (ex: 'minecraft:diamond')
    const minecraftItemId = `minecraft:${itemId}`; // Assurez-vous que c'est le bon format pour /give
    const rconCommand = `give ${username} ${minecraftItemId} ${quantity}`;
    const rconResult = await sendRconCommand(rconCommand);

    if (!rconResult.success) {
      // La commande RCON a échoué, ne pas déduire le solde
      console.error(
        `Achat échoué: Erreur RCON pour ${username} lors de l'achat de ${quantity}x ${itemId}. Erreur: ${rconResult.error}`
      );
      // Informer l'utilisateur d'une erreur serveur, potentiellement réessayer plus tard.
      return res
        .status(500)
        .json({
          message: `Erreur lors de la communication avec le serveur Minecraft. L'achat n'a pas été effectué. Détails: ${rconResult.error}`,
        });
    }

    // 3. Commande RCON réussie, déduire le solde (opération atomique)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: -totalPrice } }, // Décrémente le solde
      { new: true } // Retourne le document mis à jour
    );

    if (!updatedUser) {
      // Ne devrait pas arriver si l'utilisateur existait, mais sécurité
      console.error(
        `Achat échoué: Utilisateur ${username} non trouvé lors de la mise à jour du solde après RCON succès.`
      );
      // Que faire ici? L'item a été donné mais le solde pas débité -> Problème ! Logguer agressivement.
      // Idéalement, une transaction DB couvrirait RCON + Update. Sans ça, c'est un risque.
      return res
        .status(500)
        .json({
          message:
            "Erreur critique lors de la mise à jour du solde après l'envoi de l'item. Contactez un admin.",
        });
    }

    console.log(
      `Achat réussi pour ${username}: ${quantity}x ${itemId}. Nouveau solde: ${updatedUser.balance}`
    );
    res.json({
      success: true,
      message: `Achat réussi ! Vous avez reçu ${quantity}x ${
        item.description || itemId
      }.`,
      newBalance: updatedUser.balance,
    });
  } catch (error) {
    console.error(`Erreur lors de l'achat pour ${username}:`, error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de l'achat." });
  }
});

module.exports = router;
