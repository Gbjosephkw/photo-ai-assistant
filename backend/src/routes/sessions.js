const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");
const { parseSessionEvents, isValidationEvent } = require("../services/parser");

// Reçoit une session brute envoyée par le plugin Photoshop après un
// enregistrement (démarrer / retoucher / arrêter).
router.post("/", async (req, res) => {
  const { photographerId, documentName, capturedAt, events } = req.body;

  if (!photographerId) {
    return res.status(400).json({ error: "photographerId manquant" });
  }
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: "events manquant ou vide" });
  }

  const validated = events.some(isValidationEvent);
  const adjustments = parseSessionEvents(events);

  const { data, error } = await supabase
    .from("photo_sessions")
    .insert({
      photographer_id: photographerId,
      document_name: documentName || null,
      captured_at: capturedAt || new Date().toISOString(),
      raw_events: events,
      status: "parsed"
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const { error: editError } = await supabase.from("photo_edits").insert({
    session_id: data.id,
    photographer_id: photographerId,
    // Pas encore d'image_features ici : le plugin n'envoie pas (encore) un
    // aperçu de la photo au backend, seulement les événements Photoshop.
    // Voir CLAUDE.md, "reste à faire".
    image_features: null,
    adjustments,
    validated
  });

  if (editError) {
    return res.status(500).json({ error: editError.message });
  }

  res.json({ ok: true, sessionId: data.id, adjustmentsCount: adjustments.length, validated });
});

module.exports = router;
