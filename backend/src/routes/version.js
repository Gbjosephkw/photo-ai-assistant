const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");
const { requireAdmin } = require("../middleware/adminAuth");

// Sert le modèle "mise à jour téléphone" : le plugin, au démarrage,
// compare sa propre version (manifest.json) à la dernière version publiée
// ici, et prévient le photographe si une mise à jour existe.
//
// IMPORTANT — limite actuelle à connaître : tant que le plugin est
// installé "en local" (chargé via UXP Developer Tool chez le photographe,
// pas publié sur la marketplace Adobe), on ne peut pas pousser la mise à
// jour automatiquement sur sa machine. Ce endpoint permet juste d'afficher
// "une mise à jour est disponible" dans le panneau ; il faut ensuite
// renvoyer le dossier du plugin corrigé au photographe pour qu'il le
// recharge. Le vrai déploiement silencieux type "mise à jour téléphone"
// ne devient possible que si on publie le plugin sur la marketplace Adobe
// (Creative Cloud gère alors la distribution automatiquement).
router.get("/latest", async (_req, res) => {
  const { data, error } = await supabase
    .from("plugin_versions")
    .select("*")
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  if (!data) {
    return res.json({ version: null, releaseNotes: null });
  }

  res.json({ version: data.version, releaseNotes: data.release_notes, releasedAt: data.released_at });
});

// Enregistre une nouvelle version publiée (à appeler depuis chez nous
// quand on corrige quelque chose et qu'on renvoie le plugin mis à jour).
router.post("/", requireAdmin, async (req, res) => {
  const { version, releaseNotes } = req.body;
  if (!version) return res.status(400).json({ error: "version manquant" });

  const { data, error } = await supabase
    .from("plugin_versions")
    .insert({ version, release_notes: releaseNotes || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
