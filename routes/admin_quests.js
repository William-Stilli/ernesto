// routes/admin_quests.js
const express = require("express");
const router = express.Router();
const QuestDefinition = require("../models/QuestDefinition");
const PlayerQuest = require("../models/PlayerQuest");
const User = require("../models/User");
const ms = require("ms"); // Utilisé dans assign-to-all
const { authenticateToken, isAdmin } = require("../middleware/auth"); // <<< Importer les middlewares réels
const mongoose = require("mongoose"); // Utilisé pour ObjectId dans assign-to-all

// --- Appliquer les Middlewares d'Authentification et d'Autorisation ---
// 1. Vérifier si l'utilisateur est connecté (JWT valide)
// 2. Vérifier si l'utilisateur connecté a le rôle 'admin'
router.use(authenticateToken);
router.use(isAdmin);
// --- Fin Application Middlewares ---

// Le reste des routes CRUD et assign-to-all reste identique...

// POST /api/admin/quests - Créer une nouvelle définition de quête
router.post("/", async (req, res) => {
  try {
    const { questId } = req.body;
    if (!questId) {
      return res.status(400).json({ message: "Le champ questId est requis." });
    }
    const existingQuest = await QuestDefinition.findOne({ questId: questId });
    if (existingQuest) {
      return res.status(400).json({
        message: `Une définition de quête avec l'ID '${questId}' existe déjà.`,
      });
    }
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
    if (req.query.type) {
      if (["daily", "weekly", "monthly"].includes(req.query.type)) {
        filter.type = req.query.type;
      } else {
        console.warn(
          `[Admin Quests GET /] Type de filtre invalide ignoré: ${req.query.type}`
        );
      }
    }
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }

    const questDefs = await QuestDefinition.find(filter).sort({
      createdAt: -1,
    });
    console.log(
      `[Admin Quests] Listage de ${questDefs.length} définition(s) avec filtre:`,
      filter
    );
    res.status(200).json(questDefs);
  } catch (error) {
    console.error("Erreur lors du listage des définitions de quêtes:", error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors du listage." });
  }
});

// GET /api/admin/quests/:questId - Obtenir les détails d'une définition
router.get("/:questId", async (req, res) => {
  try {
    const { questId } = req.params;
    const questDef = await QuestDefinition.findOne({ questId: questId });

    if (!questDef) {
      console.log(`[Admin Quests] Définition non trouvée pour GET: ${questId}`);
      return res.status(404).json({
        message: `Définition de quête introuvable pour questId: ${questId}`,
      });
    }
    console.log(`[Admin Quests] Détails récupérés pour: ${questId}`);
    res.status(200).json(questDef);
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
    delete updateData.questId;
    delete updateData._id;
    delete updateData.createdAt;

    const updatedQuestDef = await QuestDefinition.findOneAndUpdate(
      { questId: questId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedQuestDef) {
      console.log(`[Admin Quests] Définition non trouvée pour PUT: ${questId}`);
      return res.status(404).json({
        message: `Définition de quête introuvable pour questId: ${questId}`,
      });
    }
    console.log(`[Admin Quests] Définition mise à jour: ${questId}`);
    res.status(200).json(updatedQuestDef);
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
      `[Admin Quests] Tentative de suppression de la définition ${questId}. ATTENTION: Ceci n'affecte pas les PlayerQuests existantes!`
    );

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

// POST /api/admin/quests/assign-to-all - Assigner une quête à tous (inchangé)
router.post("/assign-to-all", async (req, res) => {
  const { questId } = req.body;
  if (!questId) {
    return res
      .status(400)
      .json({
        message: "Le champ 'questId' est requis dans le corps de la requête.",
      });
  }

  let session; // Déclarer la session en dehors du try pour le finally
  try {
    session = await mongoose.startSession(); // Démarrer une session
    console.log(
      `[Assign Quest] Tentative d'assignation globale pour questId: ${questId}`
    );

    let assigned_count_result = 0;
    let skipped_count_result = 0;

    await session.withTransaction(async () => {
      // 1. Trouver la définition de quête active
      const questDef = await QuestDefinition.findOne({
        questId: questId,
        isActive: true,
      }).session(session);
      if (!questDef) {
        // Si la quête n'est pas trouvée, on ne peut rien faire, on sort de la transaction
        // L'erreur sera gérée après le withTransaction
        throw new Error(
          `Définition de quête active introuvable pour questId: ${questId}`
        );
      }
      console.log(
        `[Assign Quest] Définition trouvée: ${questDef.title} (ID: ${questDef._id})`
      );

      // 2. Trouver tous les utilisateurs
      const allUsers = await User.find({}, "_id").lean().session(session); // lean() OK ici car on ne modifie pas les users
      if (!allUsers || allUsers.length === 0) {
        console.log("[Assign Quest] Aucun utilisateur trouvé dans la base.");
        // Pas une erreur, on sort juste de la transaction
        return; // Quitte la fonction async de withTransaction
      }
      const userIds = allUsers.map((u) => u._id);
      console.log(`[Assign Quest] ${userIds.length} utilisateurs trouvés.`);

      // 3. Calculer la date d'expiration (si applicable)
      let expiresAt = null;
      const now = new Date();
      const assignedAt = now; // Utiliser la même date pour toutes les assignations

      // Utiliser les helpers UTC (s'ils existent, sinon les recréer/importer)
      const getUtcEndOfDay = (date = new Date()) => {
        /* ... implémentation ... */ const end = new Date(date);
        end.setUTCHours(23, 59, 59, 999);
        return end;
      };
      const getUtcEndOfWeek = (date = new Date()) => {
        /* ... implémentation ... */ const end = new Date(date);
        const d = end.getUTCDay();
        const diff = d === 0 ? 0 : 7 - d;
        end.setUTCDate(end.getUTCDate() + diff);
        end.setUTCHours(23, 59, 59, 999);
        return end;
      };
      const getUtcEndOfMonth = (date = new Date()) => {
        /* ... implémentation ... */ return new Date(
          Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            0,
            23,
            59,
            59,
            999
          )
        );
      };

      if (questDef.type === "daily") expiresAt = getUtcEndOfDay(now);
      else if (questDef.type === "weekly") expiresAt = getUtcEndOfWeek(now);
      else if (questDef.type === "monthly") expiresAt = getUtcEndOfMonth(now);

      console.log(
        `[Assign Quest] Type: ${questDef.type}, ExpiresAt: ${
          expiresAt ? expiresAt.toISOString() : "null"
        }`
      );

      // 4. Trouver les instances existantes NON RECLAMEES pour cette période
      const findExistingCriteria = {
        userId: { $in: userIds },
        questDefinitionId: questDef._id,
        status: { $nin: ["reward_claimed"] }, // Ne pas recréer si déjà complété/réclamé
      };
      // Ajouter la condition d'expiration seulement si elle existe
      if (expiresAt) {
        // Chercher les quêtes qui expirent à la même date ou plus tard (pour éviter doublons si run plusieurs fois)
        // Ou plus simplement, chercher celles qui expirent exactement à cette date ?
        // Si on assigne pour AUJOURD'HUI, on cherche celles qui expirent AUJOURD'HUI
        findExistingCriteria.expiresAt = expiresAt;
      } else {
        // Pour les quêtes sans expiration (si ça existe un jour), vérifier s'il y en a une active
        findExistingCriteria.expiresAt = null;
      }

      const existingQuests = await PlayerQuest.find(findExistingCriteria)
        .select("userId")
        .lean()
        .session(session);
      const usersWithExistingQuest = new Set(
        existingQuests.map((q) => q.userId.toString())
      );
      console.log(
        `[Assign Quest] ${usersWithExistingQuest.size} utilisateur(s) ont déjà une instance active/non réclamée pour cette période.`
      );

      // 5. Préparer les opérations bulk pour les utilisateurs manquants
      const bulkOps = [];
      for (const userId of userIds) {
        if (!usersWithExistingQuest.has(userId.toString())) {
          bulkOps.push({
            insertOne: {
              document: {
                userId: userId,
                questDefinitionId: questDef._id,
                status: "not_started",
                progress: { current: 0 },
                // La streak devrait être gérée par GET /me, initialiser à 0 ici
                completion_streak: questDef.type === "daily" ? 0 : undefined,
                assignedAt: assignedAt,
                expiresAt: expiresAt, // Peut être null
                // createdAt/updatedAt gérés par Mongoose si timestamps: true
              },
            },
          });
        }
      }

      skipped_count_result = usersWithExistingQuest.size; // Le nombre skippé est ceux qui l'avaient déjà

      // 6. Exécuter le bulkWrite si nécessaire
      if (bulkOps.length > 0) {
        console.log(
          `[Assign Quest] [TX] Assignation de '${questDef.questId}' à ${bulkOps.length} utilisateur(s)...`
        );
        const bulkResult = await PlayerQuest.bulkWrite(bulkOps, {
          session: session,
        });
        assigned_count_result = bulkResult.insertedCount || 0;
        console.log(
          `[Assign Quest] [TX] ${assigned_count_result} instance(s) de PlayerQuest créée(s).`
        );
        if (assigned_count_result !== bulkOps.length) {
          console.warn(
            `[Assign Quest] [TX] Problème lors du bulkWrite: ${bulkOps.length} opérations demandées, ${assigned_count_result} insérées.`
          );
          // La transaction devrait échouer si une insertion rate, mais ajoutons une vérification
          if (bulkResult.hasWriteErrors()) {
            throw new Error(
              `Erreur lors du bulkWrite: ${JSON.stringify(
                bulkResult.getWriteErrors()
              )}`
            );
          }
        }
      } else {
        console.log(
          `[Assign Quest] Aucun nouvel utilisateur à qui assigner '${questDef.questId}' pour cette période.`
        );
        assigned_count_result = 0; // Assurer que c'est bien 0
      }

      // Si on arrive ici, la transaction est réussie
    }); // Fin de session.withTransaction()

    // Si la transaction a réussi (pas d'erreur levée)
    res.status(200).json({
      message: `Assignation de la quête '${questId}' traitée.`,
      assigned_count: assigned_count_result,
      skipped_count: skipped_count_result, // utilisateurs.length - assigned_count_result serait faux si certains étaient skippés
    });
  } catch (error) {
    console.error(`Erreur lors de l'assignation globale de ${questId}:`, error);
    // Si l'erreur vient de la transaction (ex: questDef non trouvé), elle sera attrapée ici
    res.status(error.message.includes("introuvable") ? 404 : 500).json({
      message: error.message || "Erreur serveur interne lors de l'assignation.",
    });
  } finally {
    // Terminer la session MongoDB si elle a été démarrée
    if (session) {
      await session.endSession();
      console.log("[Assign Quest] Session MongoDB terminée.");
    }
  }
});

module.exports = router;
