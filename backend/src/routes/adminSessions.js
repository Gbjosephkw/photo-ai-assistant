const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");
const { requireAdmin } = require("../middleware/adminAuth");

// Liste les retouches reçues (photo_edits), les plus récentes en premier.
// Pour la page admin : vue d'ensemble de qui a envoyé quoi.
router.get("/", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("photo_edits")
    .select("id, photographer_id, batch_id, source, validated, adjustments, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
