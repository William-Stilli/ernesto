// middleware/auth.js
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY; // Assurez-vous que cette clé est dans votre .env

// Vérifie l'Access Token (Bearer) - Fonction existante, correcte
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    console.log("Auth Middleware: Access Token manquant");
    return res
      .status(401)
      .json({ message: "Token d'accès manquant ou invalide." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error(
        "Auth Middleware: Erreur vérification Access Token:",
        err.message
      );
      if (err.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ error: "token_expired", message: "Token d'accès expiré." });
      } else {
        return res.status(403).json({ message: "Token d'accès invalide." });
      }
    }
    req.user = user;
    console.log("Auth Middleware: Access Token vérifié pour", user.username);
    next();
  });
}

// >>> Fonction manquante à ajouter <<<
// Middleware pour protéger l'endpoint interne appelé par le plugin Minecraft
function authenticateInternal(req, res, next) {
  // Vérifier si la clé API est définie dans l'environnement
  if (!INTERNAL_API_KEY) {
    console.error(
      "ERREUR CONFIG: INTERNAL_API_KEY n'est pas définie dans le fichier .env"
    );
    return res
      .status(500)
      .json({ message: "Erreur de configuration serveur." });
  }

  const apiKey = req.headers["x-api-key"]; // Utiliser un en-tête personnalisé

  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    console.warn(
      `Internal Auth: Clé API ${apiKey ? "invalide" : "manquante"}.`
    );
    return res.status(403).json({ message: "Accès interdit." }); // 403 Forbidden est plus approprié que 401 ici
  }
  console.log("Internal Auth: Clé API vérifiée.");
  next(); // Clé OK, passer à la suite (le handler async de la route)
}
// >>> Fin de la fonction manquante <<<

// Assurez-vous que les deux fonctions sont exportées :
module.exports = { authenticateToken, authenticateInternal }; // <<< Dé-commentez authenticateInternal
