// server.js
require("dotenv").config();
const express = require("express");
const connectDB = require("./db");

// Importer les routeurs
const authRoutes = require("./routes/auth");
const shopRoutes = require("./routes/shop");
const internalRoutes = require("./routes/internal");
const userRoutes = require("./routes/users");
const questRoutes = require("./routes/quests"); // <<< IMPORTER routes/quests.js
const adminQuestRoutes = require("./routes/admin_quests"); // <<< IMPORTER routes/admin_quests.js

// Initialiser l'application Express
const app = express();

// Connexion à la base de données MongoDB
connectDB();

// Middlewares globaux
app.use(express.json());
// app.use(cors(...)); // Si besoin

// Définir les routes
app.use("/api/auth", authRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/internal", internalRoutes); // Contient maintenant /claim-all-rewards
app.use("/api/users", userRoutes);
app.use("/api/quests", questRoutes); // <<< MONTER /api/quests
app.use("/api/admin/quests", adminQuestRoutes); // <<< MONTER /api/admin/quests

// Route de test simple
app.get("/", (req, res) => {
  res.send("API Minecraft Shop + Quests fonctionnelle!"); // Message mis à jour
});

// Gestionnaire d'erreurs global (simple)
app.use((err, req, res, next) => {
  console.error("Erreur non gérée:", err.stack);
  res.status(500).json({ message: "Quelque chose s'est mal passé !" });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur API démarré sur le port ${PORT}`);
});
