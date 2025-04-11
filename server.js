// server.js
require("dotenv").config();
const express = require("express");
const connectDB = require("./db");

// Importer les routeurs
const authRoutes = require("./routes/auth");
const shopRoutes = require("./routes/shop");
const internalRoutes = require("./routes/internal");
const userRoutes = require("./routes/users");
const questRoutes = require("./routes/quests");
const adminQuestRoutes = require("./routes/admin_quests");
const adminTodoRoutes = require("./routes/admin_todos"); // <<< AJOUT: Importer le routeur pour les todos admin
const cors = require("cors");

// Initialiser l'application Express
const app = express();

// Connexion à la base de données MongoDB
connectDB();

// Middlewares globaux
app.use(express.json());

// Configuration CORS (existante, fournie par l'utilisateur - ajout de credentials)
const corsOptions = {
  origin: "http://localhost:3001", // Assurez-vous que cette origine est correcte
  optionsSuccessStatus: 200,
  credentials: true, // <<< AJOUT IMPORTANT: Nécessaire pour les tokens Bearer cross-origin
};

app.use(cors(corsOptions)); // Appliquer CORS

// Définir les routes
app.use("/api/auth", authRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/internal", internalRoutes);
app.use("/api/users", userRoutes);
app.use("/api/quests", questRoutes);
app.use("/api/admin/quests", adminQuestRoutes);
app.use("/api/admin/todos", adminTodoRoutes); // <<< AJOUT: Monter les routes pour les todos admin

// Route de test simple
app.get("/", (req, res) => {
  res.send("API Minecraft Shop + Quests + Todos fonctionnelle!"); // Message mis à jour
});

// Gestionnaire d'erreurs global (simple - légèrement amélioré pour CORS)
app.use((err, req, res, next) => {
  // Gestion spécifique de l'erreur CORS si elle est levée par le middleware cors
  if (err.message === "Origine non autorisée par CORS" && !res.headersSent) {
    console.warn(`Blocage CORS pour origine: ${req.header("Origin")}`);
    return res.status(403).json({ message: "Accès non autorisé (CORS)" });
  }
  // Continuer pour les autres erreurs ou si les headers sont déjà envoyés
  if (res.headersSent) {
    return next(err);
  }
  console.error("Erreur non gérée:", err.stack);
  res.status(500).json({ message: "Quelque chose s'est mal passé !" });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur API démarré sur le port ${PORT}`);
});
