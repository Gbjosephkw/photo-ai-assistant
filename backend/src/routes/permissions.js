const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");

router.get("/:photographerId", async (req, res) => {
  const { photographerId } = req.params;
  const { data, error } = await supabase
    .from("permissions")
    .select("autonomous_enabled")
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ autonomousEnabled: !!(data && data.autonomous_enabled) });
});

// Le photographe (ou nous, en son nom, sur sa demande explicite) active ou
// désactive le mode autonome. Ne doit jamais être appelé automatiquement
// par l'assistant lui-même, seulement suite à une action humaine.
router.post("/:photographerId", async (req, res) => {
  const { photographerId } = req.params;
  const { autonomousEnabled } = req.body;

  const { error } = await supabase
    .from("permissions")
    .upsert({
      photographer_id: photographerId,
      autonomous_enabled: !!autonomousEnabled,
      updated_at: new Date().toISOString()
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, autonomousEnabled: !!autonomousEnabled });
});

module.exports = router;
