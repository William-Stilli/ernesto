// routes/admin_quests.js (Version Complète avec CRUD implémenté)

const express = require("express");
const router = express.Router();
const QuestDefinition = require("../models/QuestDefinition"); // Modèle pour les définitions
const PlayerQuest = require("../models/PlayerQuest"); // Pour la route /assign-to-all
const User = require("../models/User"); // Pour la route /assign-to-all
const ms = require("ms"); // Pour la route /assign-to-all
// const mongoose = require('mongoose'); // Pas nécessaire ici si on n'utilise pas ObjectId directement

// --- Middleware Placeholder pour l'Authentification Admin ---
// IMPORTANT: Ceci est un placeholder. Il faudra implémenter une vraie
// vérification pour s'assurer que seul un administrateur peut accéder
// à ces routes (probablement via un rôle dans le token JWT ou un autre système).
const isAdmin = (req, res, next) => {
  console.warn(
    `[ADMIN AUTH STUB] Vérification Admin non implémentée pour ${req.method} ${req.originalUrl}. Accès autorisé pour le développement.`
  );
  next(); // Pour l'instant, on laisse passer tout le monde
};

// Appliquer le middleware admin à toutes les routes de ce fichier
router.use(isAdmin);

// --- Routes CRUD pour les Définitions de Quêtes ---

// POST /api/admin/quests - Créer une nouvelle définition de quête
router.post("/", async (req, res) => {
  try {
    const { questId } = req.body;
    // Validation minimale (le reste est géré par Mongoose)
    if (!questId) {
      return res.status(400).json({ message: "Le champ questId est requis." });
    }
    // Vérifier si questId existe déjà
    const existingQuest = await QuestDefinition.findOne({ questId: questId });
    if (existingQuest) {
      return res.status(400).json({
        message: `Une définition de quête avec l'ID '${questId}' existe déjà.`,
      });
    }
    // Créer et sauvegarder
    const newQuestDef = new QuestDefinition(req.body);
    await newQuestDef.save();
    console.log(
      `[Admin Quests] Nouvelle définition créée : ${newQuestDef.questId}`
    );
    res.status(201).json(newQuestDef);
  } catch (error) {
    console.error(
      "Erreur lors de la création de la définition de quête:",
      error
    );
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: `Données de quête invalides: ${error.message}` });
    }
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la création." });
  }
});

// GET /api/admin/quests - Lister toutes les définitions de quêtes
router.get("/", async (req, res) => {
  try {
    const filter = {};
    // Filtrer par type
    if (req.query.type) {
      if (["daily", "weekly", "monthly"].includes(req.query.type)) {
        filter.type = req.query.type;
      } else {
        console.warn(
          `[Admin Quests GET /] Type de filtre invalide ignoré: ${req.query.type}`
        );
      }
    }
    // Filtrer par statut actif/inactif
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }

    // Récupérer les définitions
    const questDefs = await QuestDefinition.find(filter).sort({
      createdAt: -1,
    }); // Tri par date de création
    console.log(
      `[Admin Quests] Listage de ${questDefs.length} définition(s) avec filtre:`,
      filter
    );
    res.status(200).json(questDefs); // Renvoyer le tableau (peut être vide)
  } catch (error) {
    console.error("Erreur lors du listage des définitions de quêtes:", error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors du listage." });
  }
});

// GET /api/admin/quests/:questId - Obtenir les détails d'une définition par son ID textuel unique
router.get("/:questId", async (req, res) => {
  try {
    const { questId } = req.params;
    // Trouver par questId
    const questDef = await QuestDefinition.findOne({ questId: questId });

    if (!questDef) {
      console.log(`[Admin Quests] Définition non trouvée pour GET: ${questId}`);
      return res.status(404).json({
        message: `Définition de quête introuvable pour questId: ${questId}`,
      });
    }
    console.log(`[Admin Quests] Détails récupérés pour: ${questId}`);
    res.status(200).json(questDef); // Renvoyer la définition trouvée
  } catch (error) {
    console.error(
      `Erreur lors de la récupération de la définition ${req.params.questId}:`,
      error
    );
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la récupération." });
  }
});

// PUT /api/admin/quests/:questId - Mettre à jour une définition de quête
router.put("/:questId", async (req, res) => {
  try {
    const { questId } = req.params;
    const updateData = { ...req.body };
    // Sécurités : ne pas permettre de modifier questId ou _id via cette route
    delete updateData.questId;
    delete updateData._id;
    delete updateData.createdAt; // Empêcher modif createdAt

    // Trouver par questId et mettre à jour
    const updatedQuestDef = await QuestDefinition.findOneAndUpdate(
      { questId: questId }, // Critère de recherche
      updateData, // Données de mise à jour
      {
        new: true, // Retourne le document mis à jour
        runValidators: true, // Relance les validations du schéma
      }
    );

    if (!updatedQuestDef) {
      console.log(`[Admin Quests] Définition non trouvée pour PUT: ${questId}`);
      return res.status(404).json({
        message: `Définition de quête introuvable pour questId: ${questId}`,
      });
    }
    console.log(`[Admin Quests] Définition mise à jour: ${questId}`);
    res.status(200).json(updatedQuestDef); // Renvoyer la définition mise à jour
  } catch (error) {
    console.error(
      `Erreur lors de la mise à jour de la définition ${req.params.questId}:`,
      error
    );
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: `Données de mise à jour invalides: ${error.message}`,
      });
    }
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la mise à jour." });
  }
});

// DELETE /api/admin/quests/:questId - Supprimer une définition de quête
router.delete("/:questId", async (req, res) => {
  try {
    const { questId } = req.params;
    console.warn(
      `[Admin Quests] Tentative de suppression de la définition ${questId}. ATTENTION: Ceci n'affecte pas les PlayerQuests existantes qui y font référence!`
    );

    // Trouver par questId et supprimer
    const result = await QuestDefinition.findOneAndDelete({ questId: questId });

    if (!result) {
      console.log(
        `[Admin Quests] Définition non trouvée pour DELETE: ${questId}`
      );
      return res.status(404).json({
        message: `Définition de quête introuvable pour questId: ${questId}`,
      });
    }
    console.log(`[Admin Quests] Définition supprimée: ${questId}.`);
    res.status(200).json({
      message: `Définition de quête ${questId} supprimée avec succès.`,
    });
    // Alternative: res.status(204).send();
  } catch (error) {
    console.error(
      `Erreur lors de la suppression de la définition ${req.params.questId}:`,
      error
    );
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la suppression." });
  }
});

// --- Route POST /assign-to-all (implémentée précédemment) ---
router.post("/assign-to-all", async (req, res) => {
  // ... (code complet de assign-to-all tel que fourni précédemment) ...
  const { questId } = req.body;
  if (!questId) {
    return res
      .status(400)
      .json({ message: "Le champ 'questId' est requis..." });
  }
  try {
    const questDef = await QuestDefinition.findOne({
      questId: questId,
      isActive: true,
    });
    if (!questDef) {
      return res
        .status(404)
        .json({ message: `Définition de quête active introuvable...` });
    }
    const allUsers = await User.find({}, "_id").lean();
    if (!allUsers || allUsers.length === 0) {
      return res
        .status(200)
        .json({
          message: "Aucun utilisateur trouvé...",
          assigned_count: 0,
          skipped_count: 0,
        });
    }
    const userIds = allUsers.map((u) => u._id);
    let expiresAt = null;
    const now = new Date();
    if (questDef.type === "daily") {
      expiresAt = new Date(now);
      expiresAt.setUTCHours(23, 59, 59, 999);
    } else if (questDef.type === "weekly") {
      expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + (7 - expiresAt.getDay()));
      expiresAt.setUTCHours(23, 59, 59, 999);
    } else if (questDef.type === "monthly") {
      expiresAt = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          0,
          23,
          59,
          59,
          999
        )
      );
    }
    const bulkOps = [];
    const assignedAt = new Date();
    const existingQuests = await PlayerQuest.find({
      userId: { $in: userIds },
      questDefinitionId: questDef._id,
      status: { $ne: "reward_claimed" },
      expiresAt: expiresAt ? { $gte: assignedAt } : null,
    })
      .select("userId")
      .lean();
    const usersWithExistingQuest = new Set(
      existingQuests.map((q) => q.userId.toString())
    );
    let assigned_count_result = 0; // Use a separate variable for result
    for (const userId of userIds) {
      if (!usersWithExistingQuest.has(userId.toString())) {
        // assignmentCount++; // Pas besoin de le compter ici
        bulkOps.push({
          insertOne: {
            document: {
              userId: userId,
              questDefinitionId: questDef._id,
              status: "not_started",
              progress: { current: 0 },
              completion_streak: questDef.type === "daily" ? 0 : undefined,
              assignedAt: assignedAt,
              expiresAt: expiresAt,
              createdAt: assignedAt,
              updatedAt: assignedAt,
            },
          },
        });
      }
    }
    if (bulkOps.length > 0) {
      console.log(
        `[Assign Quest] Assignation de la quête '${questDef.questId}' à ${bulkOps.length} utilisateur(s)...`
      );
      const bulkResult = await PlayerQuest.bulkWrite(bulkOps);
      assigned_count_result = bulkResult.insertedCount || 0;
      console.log(
        `[Assign Quest] ${assigned_count_result} instance(s) de PlayerQuest créée(s).`
      );
    } else {
      console.log(
        `[Assign Quest] Aucun utilisateur à qui assigner la nouvelle instance de '${questDef.questId}'.`
      );
    }
    res
      .status(200)
      .json({
        message: `Assignation de la quête '${questDef.questId}' traitée.`,
        assigned_count: assigned_count_result,
        skipped_count: userIds.length - assigned_count_result,
      });
  } catch (error) {
    console.error(`Erreur assignation globale ${questId}:`, error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de l'assignation." });
  }
});

module.exports = router;
