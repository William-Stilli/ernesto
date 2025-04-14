// middleware/auth.js
const jwt = require("jsonwebtoken");
// Pas besoin d'importer User ici si on se base uniquement sur le rôle dans le token
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Vérifie l'Access Token (Bearer)
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    console.log("Auth Middleware: Access Token manquant");
    // 401 Unauthorized pour token manquant
    return res
      .status(401)
      .json({ message: "Token d'accès manquant ou invalide." });
  }

  jwt.verify(token, JWT_SECRET, (err, userPayload) => {
    // Renommé en userPayload pour clarté
    if (err) {
      console.error(
        "Auth Middleware: Erreur vérification Access Token:",
        err.message
      );
      if (err.name === "TokenExpiredError") {
        // 401 Unauthorized pour token expiré
        return res
          .status(401)
          .json({ error: "token_expired", message: "Token d'accès expiré." });
      } else {
        // 403 Forbidden pour token invalide (signature, etc.)
        return res.status(403).json({ message: "Token d'accès invalide." });
      }
    }
    // Stocker TOUT le payload décodé (qui inclut maintenant le rôle)
    req.user = userPayload;
    console.log(
      "Auth Middleware: Access Token vérifié pour",
      userPayload.username
    );
    next();
  });
}

// Middleware pour protéger l'endpoint interne (inchangé)
function authenticateInternal(req, res, next) {
  if (!INTERNAL_API_KEY) {
    console.error(
      "ERREUR CONFIG: INTERNAL_API_KEY n'est pas définie dans le fichier .env"
    );
    return res
      .status(500)
      .json({ message: "Erreur de configuration serveur." });
  }

  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    console.warn(
      `Internal Auth: Clé API ${apiKey ? "invalide" : "manquante"}.`
    );
    return res.status(403).json({ message: "Accès interdit." });
  }
  console.log("Internal Auth: Clé API vérifiée.");
  next();
}

// --- Middleware isAdmin (Implémentation réelle) ---
// IMPORTANT: Doit être utilisé APRÈS authenticateToken
function isAdmin(req, res, next) {
  // req.user est défini par authenticateToken et contient le payload du JWT
  if (req.user && req.user.role === "admin") {
    console.log(`Admin Access OK: Utilisateur ${req.user.username}`);
    next(); // Autorisé, continuer
  } else {
    const username = req.user ? req.user.username : "inconnu";
    const role = req.user ? req.user.role : "aucun";
    console.warn(
      `Admin Access DENIED: Tentative par ${username}. Rôle trouvé: ${role}`
    );
    // 403 Forbidden si pas admin
    return res
      .status(403)
      .json({ message: "Accès interdit. Privilèges administrateur requis." });
  }
}
// --- FIN isAdmin ---

// Exporter les trois fonctions
module.exports = { authenticateToken, authenticateInternal, isAdmin };
