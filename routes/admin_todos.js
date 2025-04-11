// routes/admin_todos.js
const express = require("express");
const router = express.Router();
const Todo = require("../models/Todo"); // <<< Importer le modèle Todo
const mongoose = require("mongoose"); // Importé pour ObjectId

// --- Middleware Placeholder pour l'Authentification Admin ---
// IMPORTANT: Ceci est un placeholder. À remplacer par une vraie vérification admin.
const isAdmin = (req, res, next) => {
  console.warn(
    `[ADMIN AUTH STUB] Vérification Admin non implémentée pour ${req.method} ${req.originalUrl}. Accès autorisé pour le développement.`
  );
  next();
};

// Appliquer le middleware admin à toutes les routes de ce fichier
router.use(isAdmin);

// --- Routes CRUD pour la Todo List Admin ---

// GET /api/admin/todos - Lister toutes les tâches
router.get("/", async (req, res) => {
  try {
    // Trier par date de création, les plus récentes en premier
    const todos = await Todo.find().sort({ createdAt: -1 });
    res.status(200).json(todos);
  } catch (error) {
    console.error("Erreur lors du listage des todos:", error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors du listage des todos." });
  }
});

// POST /api/admin/todos - Créer une nouvelle tâche
router.post("/", async (req, res) => {
  const { text } = req.body;

  // Validation simple
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({
      message: 'Le champ "text" est requis et ne peut pas être vide.',
    });
  }

  try {
    const newTodo = new Todo({
      text: text.trim(),
      // isCompleted sera false par défaut
    });
    await newTodo.save();
    console.log("[Admin Todos] Nouvelle tâche créée:", newTodo._id);
    // Renvoyer la tâche créée avec le statut 201
    res.status(201).json(newTodo);
  } catch (error) {
    console.error("Erreur lors de la création de la todo:", error);
    if (error.name === "ValidationError") {
      // Devrait être attrapé par la validation Mongoose aussi
      return res
        .status(400)
        .json({ message: `Erreur de validation: ${error.message}` });
    }
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la création." });
  }
});

// PATCH /api/admin/todos/:id - Mettre à jour une tâche (texte ou statut complété)
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { text, isCompleted } = req.body;

  // Vérifier si l'ID est un ObjectId MongoDB valide
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: `ID de tâche invalide: ${id}` });
  }

  // Construire l'objet de mise à jour
  const updateData = {};
  if (text !== undefined) {
    if (typeof text !== "string" || text.trim().length === 0) {
      return res
        .status(400)
        .json({ message: 'Le champ "text" ne peut pas être vide si fourni.' });
    }
    updateData.text = text.trim();
  }
  if (isCompleted !== undefined) {
    if (typeof isCompleted !== "boolean") {
      return res
        .status(400)
        .json({ message: 'Le champ "isCompleted" doit être un booléen.' });
    }
    updateData.isCompleted = isCompleted;
  }

  // S'assurer qu'il y a quelque chose à mettre à jour
  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      message: "Aucun champ à mettre à jour fourni (text ou isCompleted).",
    });
  }

  try {
    // Trouver par ID et mettre à jour
    // { new: true } -> renvoie le document APRES la mise à jour
    // { runValidators: true } -> force Mongoose à relancer les validations (ex: sur le type de isCompleted)
    const updatedTodo = await Todo.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedTodo) {
      return res
        .status(404)
        .json({ message: `Tâche introuvable avec l'ID: ${id}` });
    }

    console.log("[Admin Todos] Tâche mise à jour:", updatedTodo._id);
    res.status(200).json(updatedTodo); // Renvoyer la tâche mise à jour
  } catch (error) {
    console.error(`Erreur lors de la mise à jour de la todo ${id}:`, error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: `Erreur de validation: ${error.message}` });
    }
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la mise à jour." });
  }
});

// DELETE /api/admin/todos/:id - Supprimer une tâche
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: `ID de tâche invalide: ${id}` });
  }

  try {
    // Trouver par ID et supprimer
    const result = await Todo.findByIdAndDelete(id);

    if (!result) {
      return res
        .status(404)
        .json({ message: `Tâche introuvable avec l'ID: ${id}` });
    }

    console.log("[Admin Todos] Tâche supprimée:", id);
    res.status(200).json({ message: `Tâche ${id} supprimée avec succès.` });
    // Ou renvoyer 204 No Content sans corps:
    // res.status(204).send();
  } catch (error) {
    console.error(`Erreur lors de la suppression de la todo ${id}:`, error);
    console.log(error);

    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la suppression." });
  }
});

module.exports = router;
