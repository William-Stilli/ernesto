// server.js
require("dotenv").config();
const express = require("express");
const connectDB = require("./db");

// Importer les routeurs
const authRoutes = require("./routes/auth");
const shopRoutes = require("./routes/shop");
const internalRoutes = require("./routes/internal");
const userRoutes = require("./routes/users"); // <<< AJOUTER CET IMPORT

const corsOptions = {
  origin: "http://localhost:3001", // Remplacez par l'URL de votre frontend
  optionsSuccessStatus: 200, // Certains navigateurs anciens (IE11, divers SmartTVs) bloquent sur 204
};

app.use(cors(corsOptions)); // Utiliser CORS avec les options définies

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
app.use("/api/internal", internalRoutes);
app.use("/api/users", userRoutes); // <<< AJOUTER CETTE LIGNE pour monter les routes utilisateur

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
