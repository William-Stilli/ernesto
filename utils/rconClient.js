// utils/rconClient.js
const { Rcon } = require("rcon-client");
require("dotenv").config();

const rconConfig = {
  host: process.env.RCON_HOST,
  port: parseInt(process.env.RCON_PORT || "25575"),
  password: process.env.RCON_PASSWORD,
};

async function sendRconCommand(command) {
  let rcon = null;
  try {
    console.log(`[RCON] Connexion à ${rconConfig.host}:${rconConfig.port}...`);
    rcon = await Rcon.connect(rconConfig);
    console.log(`[RCON] Connecté. Envoi: ${command}`);
    const response = await rcon.send(command);
    console.log(`[RCON] Réponse: ${response}`);
    await rcon.end();
    console.log("[RCON] Déconnecté.");
    // Vérifier si la réponse indique une erreur commune (peut varier selon le serveur/commande)
    if (
      response.toLowerCase().includes("unknown command") ||
      response.toLowerCase().includes("error")
    ) {
      // Vous pouvez affiner cette détection d'erreur
      console.warn(`[RCON] La commande a peut-être échoué: ${response}`);
      // return { success: false, response, error: `Erreur serveur Minecraft: ${response}` };
    }
    return { success: true, response };
  } catch (error) {
    console.error(`[RCON] Erreur: ${error.message}`);
    if (rcon) {
      try {
        await rcon.end();
      } catch (e) {}
    }
    return { success: false, error: error.message };
  }
}

module.exports = { sendRconCommand };
