// Entrypoint Vercel (fonction serverless) : réutilise l'app Express telle
// quelle, sans appeler listen() (Vercel gère ça lui-même).
module.exports = require("../src/app");
