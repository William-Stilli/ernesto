// routes/quests.js
const express = require("express");
const { authenticateToken } = require("../middleware/auth"); // Middleware d'authentification JWT
const PlayerQuest = require("../models/PlayerQuest"); // Modèle pour la progression des quêtes du joueur
// Note: On importe QuestDefinition ici car on va utiliser .populate() pour lier les données
const QuestDefinition = require("../models/QuestDefinition");

const router = express.Router();

// --- GET /api/quests/me ---
// Objectif: Récupérer la liste de toutes les quêtes (actives, complétées, réclamées, expirées)
//           associées à l'utilisateur actuellement authentifié.
router.get("/me", authenticateToken, async (req, res) => {
  const userId = req.user.id; // Récupéré depuis le payload du JWT Access Token vérifié

  try {
    // 1. Récupérer toutes les entrées PlayerQuest pour cet utilisateur.
    // 2. Utiliser .populate() pour automatiquement charger les détails
    //    de la QuestDefinition associée à chaque PlayerQuest.
    const playerQuests = await PlayerQuest.find({ userId: userId })
      .populate({
        path: "questDefinitionId", // Le nom du champ dans PlayerQuest qui contient l'ObjectId
        model: "QuestDefinition", // Le nom du modèle Mongoose à utiliser pour peupler
        // Optionnel : Sélectionner seulement certains champs de QuestDefinition
        // select: 'questId title description type target rewards'
      })
      .sort({ expiresAt: 1, createdAt: -1 }); // Trier par date d'expiration (les plus proches en premier?), puis par date de création

    // 3. Formater la réponse pour correspondre exactement à la structure 'Quest'
    //    définie dans le Cahier des Charges, en combinant les informations
    //    de PlayerQuest et de la QuestDefinition peuplée.
    const formattedQuests = playerQuests
      .map((pq) => {
        // Sécurité : Vérifier si la population a bien fonctionné
        if (!pq.questDefinitionId || typeof pq.questDefinitionId !== "object") {
          console.error(
            `Données de QuestDefinition manquantes pour PlayerQuest ID: ${pq._id}. Peut indiquer une référence rompue.`
          );
          return null; // Ignorer cette quête si la définition manque
        }

        const definition = pq.questDefinitionId; // Raccourci vers les données peuplées

        return {
          id: definition.questId, // Utiliser l'ID textuel de la définition (ex: 'daily_kill_zombies')
          title: definition.title,
          description: definition.description,
          type: definition.type,
          status: pq.status, // Statut actuel du joueur pour cette quête
          progress: {
            current: pq.progress.current, // Progression actuelle du joueur
            target: definition.target, // Objectif venant de la définition
          },
          rewards: definition.rewards, // Récompenses venant de la définition
          // Utiliser la date d'expiration spécifique à cette instance de PlayerQuest
          expiry_date: pq.expiresAt ? pq.expiresAt.toISOString() : null,
          // Ne renvoyer la streak que si c'est une quête journalière
          completion_streak:
            definition.type === "daily" ? pq.completion_streak : null,
          // On pourrait ajouter d'autres champs de pq si besoin (completedAt, claimedAt...)
        };
      })
      .filter((q) => q !== null); // Enlever les quêtes dont la définition n'a pas pu être chargée

    // 4. Renvoyer le tableau formaté
    res.json(formattedQuests);
  } catch (error) {
    console.error(
      `Erreur lors de la récupération des quêtes pour l'utilisateur ${userId}:`,
      error
    );
    res
      .status(500)
      .json({
        message: "Erreur serveur interne lors de la récupération des quêtes.",
      });
  }
});

// --- D'autres routes publiques liées aux quêtes pourraient être ajoutées ici ---
// --- (Par exemple, GET /api/quests/definitions pour lister les définitions publiques ?) ---

module.exports = router;
