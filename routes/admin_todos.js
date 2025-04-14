// routes/admin_todos.js
const express = require("express");
const router = express.Router();
const Todo = require("../models/Todo");
const mongoose = require("mongoose");
const { authenticateToken, isAdmin } = require("../middleware/auth"); // <<< Importer les middlewares réels

// --- Appliquer les Middlewares d'Authentification et d'Autorisation ---
// 1. Vérifier si l'utilisateur est connecté (JWT valide)
// 2. Vérifier si l'utilisateur connecté a le rôle 'admin'
router.use(authenticateToken);
router.use(isAdmin);
// --- Fin Application Middlewares ---

// Le reste des routes CRUD reste identique...

// GET /api/admin/todos - Lister toutes les tâches
router.get("/", async (req, res) => {
  try {
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

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({
      message: 'Le champ "text" est requis et ne peut pas être vide.',
    });
  }

  try {
    const newTodo = new Todo({
      text: text.trim(),
    });
    await newTodo.save();
    console.log("[Admin Todos] Nouvelle tâche créée:", newTodo._id);
    res.status(201).json(newTodo);
  } catch (error) {
    console.error("Erreur lors de la création de la todo:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: `Erreur de validation: ${error.message}` });
    }
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la création." });
  }
});

// PATCH /api/admin/todos/:id - Mettre à jour une tâche
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { text, isCompleted } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: `ID de tâche invalide: ${id}` });
  }

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

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      message: "Aucun champ à mettre à jour fourni (text ou isCompleted).",
    });
  }

  try {
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
    res.status(200).json(updatedTodo);
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
    const result = await Todo.findByIdAndDelete(id);

    if (!result) {
      return res
        .status(404)
        .json({ message: `Tâche introuvable avec l'ID: ${id}` });
    }

    console.log("[Admin Todos] Tâche supprimée:", id);
    res.status(200).json({ message: `Tâche ${id} supprimée avec succès.` });
  } catch (error) {
    console.error(`Erreur lors de la suppression de la todo ${id}:`, error);
    res
      .status(500)
      .json({ message: "Erreur serveur interne lors de la suppression." });
  }
});

module.exports = router;
