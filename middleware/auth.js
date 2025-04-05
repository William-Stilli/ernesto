// middleware/auth.js
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (token == null) {
    console.log("Auth Middleware: Token manquant");
    return res.status(401).json({ message: "Token manquant ou invalide." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error(
        "Auth Middleware: Erreur de vérification JWT:",
        err.message
      );
      return res.status(403).json({ message: "Token invalide ou expiré." });
    }
    // Important: Attachez les données décodées du JWT à req.user
    req.user = user;
    console.log("Auth Middleware: Token vérifié pour", user.username);
    next();
  });
}

// Middleware pour protéger l'endpoint interne appelé par le plugin Minecraft
function authenticateInternal(req, res, next) {
  const apiKey = req.headers["x-api-key"]; // Utiliser un en-tête personnalisé

  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    console.warn("Internal Auth: Clé API manquante ou invalide.");
    return res.status(403).json({ message: "Accès interdit." });
  }
  console.log("Internal Auth: Clé API vérifiée.");
  next();
}

module.exports = { authenticateToken, authenticateInternal };
