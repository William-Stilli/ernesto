// routes/admin_quests.js
const express = require("express");
const router = express.Router();
// Importer les modèles nécessaires quand on implémentera la logique
// const QuestDefinition = require('../models/QuestDefinition');

// --- Middleware Placeholder pour l'Authentification Admin ---
// IMPORTANT: Ceci est un placeholder. Il faudra implémenter une vraie
// vérification pour s'assurer que seul un administrateur peut accéder
// à ces routes (probablement via un rôle dans le token JWT ou un autre système).
const isAdmin = (req, res, next) => {
  console.warn(
    `[ADMIN AUTH STUB] Vérification Admin non implémentée pour ${req.method} ${req.originalUrl}. Accès autorisé pour le développement.`
  );
  // --- Logique future ---
  // Exemple: Vérifier un rôle admin dans le token JWT utilisateur
  // if (!req.user || req.user.role !== 'admin') {
  //    return res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
  // }
  next(); // Pour l'instant, on laisse passer tout le monde
};

// --- Routes CRUD pour les Définitions de Quêtes (STUBS) ---

// POST /api/admin/quests - Créer une nouvelle définition de quête
// Le corps de la requête (req.body) devrait contenir les données du schéma QuestDefinition
router.post("/", isAdmin, async (req, res) => {
  // Logique future: Créer un document QuestDefinition avec req.body
  console.log("[STUB] Appel à POST /api/admin/quests avec body:", req.body);
  res
    .status(501)
    .json({ message: "Endpoint POST /admin/quests non implémenté" });
});

// GET /api/admin/quests - Lister toutes les définitions de quêtes
router.get("/", isAdmin, async (req, res) => {
  // Logique future: Lister tous les documents QuestDefinition
  console.log("[STUB] Appel à GET /api/admin/quests");
  res
    .status(501)
    .json({ message: "Endpoint GET /admin/quests non implémenté" });
});

// GET /api/admin/quests/:questId - Obtenir les détails d'une définition par son ID textuel unique
router.get("/:questId", isAdmin, async (req, res) => {
  const { questId } = req.params;
  // Logique future: Trouver QuestDefinition.findOne({ questId: questId })
  console.log(`[STUB] Appel à GET /api/admin/quests/${questId}`);
  res
    .status(501)
    .json({ message: `Endpoint GET /admin/quests/${questId} non implémenté` });
});

// PUT /api/admin/quests/:questId - Mettre à jour une définition de quête
// Le corps de la requête (req.body) contient les champs à mettre à jour
router.put("/:questId", isAdmin, async (req, res) => {
  const { questId } = req.params;
  // Logique future: Trouver et mettre à jour QuestDefinition.findOneAndUpdate({ questId: questId }, req.body, ...)
  console.log(
    `[STUB] Appel à PUT /api/admin/quests/${questId} avec body:`,
    req.body
  );
  res
    .status(501)
    .json({ message: `Endpoint PUT /admin/quests/${questId} non implémenté` });
});

// DELETE /api/admin/quests/:questId - Supprimer une définition de quête
router.delete("/:questId", isAdmin, async (req, res) => {
  const { questId } = req.params;
  // Logique future: Supprimer QuestDefinition.findOneAndDelete({ questId: questId })
  // Attention: Gérer l'impact sur les PlayerQuest existantes liées !
  console.log(`[STUB] Appel à DELETE /api/admin/quests/${questId}`);
  res
    .status(501)
    .json({
      message: `Endpoint DELETE /admin/quests/${questId} non implémenté`,
    });
});

module.exports = router;
