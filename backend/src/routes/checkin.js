const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");
const { requireAdmin } = require("../middleware/adminAuth");

// Signal "quelqu'un a ouvert/configuré le plugin", envoyé dès le chargement
// (Photoshop) ou dès que le photographe renseigne son prénom (Lightroom),
// sans attendre qu'il ait réellement exporté une photo. Permet de savoir
// qui s'est connecté, même avant le premier vrai test.
router.post("/", async (req, res) => {
  const { photographerId, source, pluginVersion } = req.body;
  if (!photographerId) {
    return res.status(400).json({ error: "photographerId manquant" });
  }

  const { error } = await supabase.from("plugin_checkins").insert({
    photographer_id: photographerId,
    source: source || "photoshop",
    plugin_version: pluginVersion || null
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Liste les connexions récentes (page admin).
router.get("/", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("plugin_checkins")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
