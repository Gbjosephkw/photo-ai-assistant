const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");

// Point d'entrée unique où arrive TOUT ce qui vient des plugins installés
// chez les photographes testeurs : bug signalé manuellement, plainte,
// suggestion, ou erreur capturée automatiquement par le plugin. C'est la
// "boîte de réception centrale" : on la consulte, on corrige le code du
// plugin/backend chez nous, puis on redistribue la version corrigée.
router.post("/", async (req, res) => {
  const { photographerId, type, message, context, pluginVersion } = req.body;

  if (!type || !["bug", "complaint", "suggestion", "error"].includes(type)) {
    return res.status(400).json({ error: "type invalide (bug | complaint | suggestion | error)" });
  }

  const { data, error } = await supabase
    .from("plugin_feedback")
    .insert({
      photographer_id: photographerId || null,
      type,
      message: message || null,
      context: context || null,
      plugin_version: pluginVersion || null
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, id: data.id });
});

// Liste le contenu de la boîte de réception (pour un tableau de bord futur ;
// pour l'instant, consultable directement via Supabase ou cette route).
router.get("/", async (req, res) => {
  const { photographerId, type, resolved } = req.query;

  let query = supabase.from("plugin_feedback").select("*").order("created_at", { ascending: false });
  if (photographerId) query = query.eq("photographer_id", photographerId);
  if (type) query = query.eq("type", type);
  if (resolved !== undefined) query = query.eq("resolved", resolved === "true");

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from("plugin_feedback")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
