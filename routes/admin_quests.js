// routes/admin_quests.js
const express = require("express");
const router = express.Router();
const QuestDefinition = require("../models/QuestDefinition"); // <<< Assure-toi que c'est importé
const PlayerQuest = require("../models/PlayerQuest"); // <<< Garder les imports existants
const User = require("../models/User"); // <<< Garder les imports existants
const ms = require("ms"); // <<< Garder les imports existants

// --- Middleware Placeholder pour l'Authentification Admin ---
const isAdmin = (req, res, next) => {
  console.warn(
    `[ADMIN AUTH STUB] Vérification Admin non implémentée pour ${req.method} ${req.originalUrl}. Accès autorisé pour le développement.`
  );
  next();
};

// --- Routes CRUD pour les QuestDefinition ---

// POST /api/admin/quests - Créer une nouvelle définition de quête
// *** Remplace le stub précédent par cette logique ***
router.post("/", isAdmin, async (req, res) => {
  try {
    // Récupérer les données du corps de la requête
    const { questId, title, description, type, target, rewards, isActive } =
      req.body;

    // --- Validation Explicite Minimale ---
    // Mongoose validera plus en détail (type, enum, min...), mais on vérifie les champs clés.
    if (!questId || !title || !description || !type || !target || !rewards) {
      return res
        .status(400)
        .json({
          message:
            "Champs requis manquants (questId, title, description, type, target, rewards).",
        });
    }
    // TODO: Ajouter une validation plus fine pour la structure de 'rewards' ici ?

    // --- Vérifier l'unicité du questId ---
    const existingQuest = await QuestDefinition.findOne({ questId: questId });
    if (existingQuest) {
      return res
        .status(400)
        .json({
          message: `Une définition de quête avec l'ID '${questId}' existe déjà.`,
        });
    }

    // --- Créer le nouveau document QuestDefinition ---
    const newQuestDef = new QuestDefinition({
      questId: questId,
      title: title,
      description: description,
      type: type, // Sera validé par l'enum du schéma
      target: target, // Sera validé par le min du schéma
      rewards: rewards, // Sera validé par le sous-schéma
      isActive: isActive !== undefined ? isActive : true, // Valeur par défaut si non fourni
    });

    // --- Sauvegarder en base de données ---
    // .save() exécute les validations définies dans le schéma Mongoose
    await newQuestDef.save();

    console.log(
      `[Admin Quests] Nouvelle définition de quête créée : ${newQuestDef.questId}`
    );
    // Renvoyer le document créé avec le statut 201 Created
    res.status(201).json(newQuestDef);
  } catch (error) {
    console.error(
      "Erreur lors de la création de la définition de quête:",
      error
    );
    if (error.name === "ValidationError") {
      // Si Mongoose renvoie une erreur de validation
      return res
        .status(400)
        .json({ message: `Données de quête invalides: ${error.message}` });
    }
    // Autre erreur serveur
    res
      .status(500)
      .json({
        message: "Erreur serveur interne lors de la création de la quête.",
      });
  }
});

// GET /api/admin/quests - Lister toutes les définitions de quêtes (STUB - à implémenter)
router.get("/", isAdmin, async (req, res) => {
  console.log("[STUB] Appel à GET /api/admin/quests");
  res
    .status(501)
    .json({ message: "Endpoint GET /admin/quests non implémenté" });
});

// GET /api/admin/quests/:questId - Obtenir les détails d'une définition (STUB - à implémenter)
router.get("/:questId", isAdmin, async (req, res) => {
  const { questId } = req.params;
  console.log(`[STUB] Appel à GET /api/admin/quests/${questId}`);
  res
    .status(501)
    .json({ message: `Endpoint GET /admin/quests/${questId} non implémenté` });
});

// PUT /api/admin/quests/:questId - Mettre à jour une définition de quête (STUB - à implémenter)
router.put("/:questId", isAdmin, async (req, res) => {
  const { questId } = req.params;
  console.log(
    `[STUB] Appel à PUT /api/admin/quests/${questId} avec body:`,
    req.body
  );
  res
    .status(501)
    .json({ message: `Endpoint PUT /admin/quests/${questId} non implémenté` });
});

// DELETE /api/admin/quests/:questId - Supprimer une définition de quête (STUB - à implémenter)
router.delete("/:questId", isAdmin, async (req, res) => {
  const { questId } = req.params;
  console.log(`[STUB] Appel à DELETE /api/admin/quests/${questId}`);
  res
    .status(501)
    .json({
      message: `Endpoint DELETE /admin/quests/${questId} non implémenté`,
    });
});

// --- Route POST /assign-to-all (implémentée précédemment) ---
router.post("/assign-to-all", isAdmin, async (req, res) => {
  // ... (code de la fonction assign-to-all tel que fourni précédemment) ...
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
    } // Changed 404 to 200 as it's not an error state for assignment itself
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
    let assignmentCount = 0;
    for (const userId of userIds) {
      if (!usersWithExistingQuest.has(userId.toString())) {
        assignmentCount++; // Correctly increment assignmentCount here
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
    let assigned_count_result = 0; // Use a separate variable for result
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
