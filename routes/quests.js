// routes/quests.js
const express = require("express");
const mongoose = require("mongoose"); // Importé pour ObjectId et potentiellement session
const { authenticateToken } = require("../middleware/auth");
const PlayerQuest = require("../models/PlayerQuest");
const QuestDefinition = require("../models/QuestDefinition");

const router = express.Router();

// --- Fonctions Helper pour calculer les dates de fin de période (en UTC) ---
// Note: La gestion des fuseaux horaires et des changements d'heure peut être complexe.
//       Utiliser UTC pour les expirations est généralement plus simple côté serveur.

function getUtcEndOfDay(date = new Date()) {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function getUtcEndOfWeek(date = new Date()) {
  // Considère que la semaine se termine le dimanche soir UTC
  const end = new Date(date);
  const dayOfWeek = end.getUTCDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  const diff = dayOfWeek === 0 ? 0 : 7 - dayOfWeek; // Jours restants jusqu'à dimanche
  end.setUTCDate(end.getUTCDate() + diff);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function getUtcEndOfMonth(date = new Date()) {
  // Fin du mois courant UTC
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return end;
}

// --- GET /api/quests/me ---
// Récupère les quêtes de l'utilisateur, CRÉE les instances manquantes pour la période courante.
router.get("/me", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const now = new Date(); // Heure actuelle

  try {
    // --- Vérification et Création des Quêtes Manquantes ---

    // 1. Obtenir toutes les définitions de quêtes actives
    const activeDefs = await QuestDefinition.find({ isActive: true }).lean(); // lean() pour performance
    if (!activeDefs || activeDefs.length === 0) {
      return res.json([]); // Aucune quête définie globalement
    }

    // 2. Calculer les dates d'expiration pour chaque type pour la période courante
    const currentExpiries = {
      daily: getUtcEndOfDay(now),
      weekly: getUtcEndOfWeek(now),
      monthly: getUtcEndOfMonth(now),
    };
    const yesterdayExpiry = getUtcEndOfDay(
      new Date(now.getTime() - 24 * 3600 * 1000)
    );

    // 3. Trouver les PlayerQuest de l'utilisateur qui correspondent aux périodes actuelles OU à hier (pour les streaks)
    const relevantQuestDefinitionIds = activeDefs.map((def) => def._id);
    const potentialExpiries = Object.values(currentExpiries).filter(
      (d) => d !== null
    );
    potentialExpiries.push(yesterdayExpiry); // Ajouter l'expiration d'hier

    const recentPlayerQuests = await PlayerQuest.find({
      userId: userId,
      questDefinitionId: { $in: relevantQuestDefinitionIds },
      expiresAt: { $in: potentialExpiries }, // Quêtes finissant aujourd'hui, cette semaine, ce mois OU hier
    }).lean(); // lean() pour performance

    // Organiser pour accès facile
    const existingQuestsMap = new Map(); // Clé: "questDefId-expiryTimestamp"
    const previousDayDailiesMap = new Map(); // Clé: questDefId (string) -> PlayerQuest d'hier

    recentPlayerQuests.forEach((pq) => {
      const expiryTimestamp = pq.expiresAt ? pq.expiresAt.getTime() : "null";
      const key = `${pq.questDefinitionId.toString()}-${expiryTimestamp}`;
      existingQuestsMap.set(key, pq);

      // Si c'est une quête d'hier
      if (
        pq.expiresAt &&
        pq.expiresAt.getTime() === yesterdayExpiry.getTime()
      ) {
        previousDayDailiesMap.set(pq.questDefinitionId.toString(), pq);
      }
    });

    // 4. Déterminer quelles quêtes doivent être créées
    const bulkCreateOps = [];
    const assignedAt = now;

    for (const definition of activeDefs) {
      const definitionId = definition._id;
      const definitionIdString = definitionId.toString();
      const currentExpiry = currentExpiries[definition.type];

      if (!currentExpiry) continue; // Ne pas créer de quête si le type n'a pas d'expiration définie ici

      const expiryTimestamp = currentExpiry.getTime();
      const mapKey = `${definitionIdString}-${expiryTimestamp}`;

      // Vérifier si une instance pour cette définition ET cette date d'expiration existe déjà
      if (!existingQuestsMap.has(mapKey)) {
        console.log(
          `[Quests /me] Création nécessaire pour User ${userId}, QuestDef ${
            definition.questId
          } (Période finissant le ${currentExpiry.toISOString()})`
        );

        // Calcul de la streak pour les journalières
        let streak = 0;
        if (definition.type === "daily") {
          const previousQuest = previousDayDailiesMap.get(definitionIdString);
          if (
            previousQuest &&
            ["completed", "reward_claimed"].includes(previousQuest.status)
          ) {
            streak = (previousQuest.completion_streak || 0) + 1;
            console.log(
              `[Quests /me] Streak incrémentée à ${streak} pour ${definition.questId} / User ${userId}`
            );
          } else if (previousQuest) {
            console.log(
              `[Quests /me] Streak réinitialisée (quête d'hier non complétée/réclamée) pour ${definition.questId} / User ${userId}`
            );
          } else {
            console.log(
              `[Quests /me] Streak initialisée (pas de quête hier) pour ${definition.questId} / User ${userId}`
            );
          }
        }

        bulkCreateOps.push({
          insertOne: {
            document: {
              userId: new mongoose.Types.ObjectId(userId),
              questDefinitionId: definitionId,
              status: "not_started",
              progress: { current: 0 },
              completion_streak: definition.type === "daily" ? streak : 0,
              assignedAt: assignedAt,
              expiresAt: currentExpiry,
              createdAt: assignedAt,
              updatedAt: assignedAt,
            },
          },
        });
      }
    }

    // 5. Exécuter les créations si nécessaire
    if (bulkCreateOps.length > 0) {
      console.log(
        `[Quests /me] Exécution de ${bulkCreateOps.length} création(s) de PlayerQuest pour User ${userId}`
      );
      await PlayerQuest.bulkWrite(bulkCreateOps);
      console.log(`[Quests /me] Création(s) terminée(s).`);
    }

    // --- Récupération Finale et Formatage ---

    // 6. Récupérer TOUTES les PlayerQuest (y compris anciennes/réclamées)
    //    et peupler les définitions associées
    const finalPlayerQuests = await PlayerQuest.find({ userId: userId })
      .populate("questDefinitionId") // On a besoin des détails pour formater
      .sort({ expiresAt: -1, status: 1, createdAt: -1 }); // Trier par expiration récente, puis statut ?

    // 7. Formater la réponse
    const formattedQuests = finalPlayerQuests
      .map((pq) => {
        if (!pq.questDefinitionId || typeof pq.questDefinitionId !== "object") {
          console.warn(
            `[Quests /me] Formatage: QuestDefinition manquante pour PlayerQuest ${pq._id}. User: ${userId}`
          );
          return null;
        }
        const definition = pq.questDefinitionId;
        return {
          id: definition.questId,
          title: definition.title,
          description: definition.description,
          type: definition.type,
          status: pq.status,
          progress: {
            current: pq.progress.current,
            target: definition.target,
          },
          rewards: definition.rewards,
          expiry_date: pq.expiresAt ? pq.expiresAt.toISOString() : null,
          completion_streak:
            definition.type === "daily" ? pq.completion_streak : null,
        };
      })
      .filter((q) => q !== null);

    res.json(formattedQuests);
  } catch (error) {
    console.error(
      `Erreur lors de la récupération/création des quêtes pour l'utilisateur ${userId}:`,
      error
    );
    res
      .status(500)
      .json({
        message: "Erreur serveur interne lors de la récupération des quêtes.",
      });
  }
});

module.exports = router;
