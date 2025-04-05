// server.js
require("dotenv").config(); // Charger les variables d'environnement en premier
const express = require("express");
const connectDB = require("./db");

// Importer les routeurs
const authRoutes = require("./routes/auth");
const shopRoutes = require("./routes/shop");
const internalRoutes = require("./routes/internal");

// Initialiser l'application Express
const app = express();

// Connexion à la base de données MongoDB
connectDB();

// Middlewares globaux
app.use(express.json()); // Pour parser les requêtes JSON entrantes

// --- CORS ---
// Si votre Interface Shop est sur un domaine/port différent de l'API,
// vous aurez besoin de configurer CORS.
// npm install cors
// const cors = require('cors');
// app.use(cors()); // Configuration simple (autorise tout)
// Pour plus de sécurité:
// app.use(cors({ origin: 'http://votre-domaine-shop.com' }));

// Définir les routes
app.use("/api/auth", authRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/internal", internalRoutes); // Routes pour le plugin MC

// Route de test simple
app.get("/", (req, res) => {
  res.send("API Minecraft Shop fonctionnelle!");
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
