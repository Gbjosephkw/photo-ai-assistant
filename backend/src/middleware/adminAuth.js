// Protège les routes admin (liste des connexions, des retouches, des
// signalements, activation du mode autonome) avec un simple code d'accès
// partagé, envoyé par le navigateur dans l'en-tête x-admin-token. Ce n'est
// pas un vrai système de comptes utilisateurs (pas nécessaire pour un seul
// admin, Joseph), juste de quoi éviter que ces données soient ouvertes à
// n'importe qui sur le web.
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return res.status(500).json({
      error: "ADMIN_TOKEN n'est pas configuré côté serveur (variable d'environnement manquante)."
    });
  }

  const provided = req.headers["x-admin-token"];
  if (provided !== expected) {
    return res.status(401).json({ error: "Code d'accès admin invalide ou manquant." });
  }

  next();
}

module.exports = { requireAdmin };
