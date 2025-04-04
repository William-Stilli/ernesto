const express = require('express');
const app = express();
const port = 4500;

// Définit la route pour la racine ('/')
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Démarre le serveur et le met en écoute sur le port spécifié
app.listen(port, () => {
    console.log(`Serveur démarré et à l'écoute sur http://localhost:${port}`);
}); // <--- LIGNE AJOUTÉE IMPORTANTE