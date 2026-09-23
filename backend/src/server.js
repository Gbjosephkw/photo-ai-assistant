// Point d'entrée pour faire tourner le backend en local ou sur un serveur
// classique (VPS, Render...) où le process reste actif en permanence.
// Pour un déploiement Vercel, voir api/index.js à la racine de backend/,
// qui réutilise la même app Express sans appeler listen().
const app = require("./app");

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log("Photo Assistant backend en écoute sur le port " + port);
});
