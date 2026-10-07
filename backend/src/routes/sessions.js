const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");
const { parseSessionEvents, isValidationEvent, parseLightroomSettings } = require("../services/parser");

// Reçoit une photo capturée par un des plugins (Photoshop, Lightroom) ou
// par le watcher Camera Raw, envoyée automatiquement dès que cette photo
// est exportée/sauvegardée/fermée (ou, pour Camera Raw, dès que son
// fichier .xmp annexe est détecté). batchId regroupe les photos traitées
// ensemble (même lot), pour pouvoir plus tard distinguer le réglage de
// base appliqué à tout le lot des retouches individuelles propres à
// chaque photo.
//
// source distingue le format reçu :
// - "photoshop" (ou absent, pour compatibilité) : `events`, un journal brut
//   d'actions Photoshop (batchPlay).
// - "lightroom" / "camera-raw" : `developSettings`, l'état final des
//   réglages de développement de la photo (ni Lightroom ni Camera Raw ne
//   fournissent de journal d'événements comme Photoshop — les deux
//   partagent le même moteur de traitement RAW et le même schéma de
//   réglages, donc le même format de données ici).
const DEVELOP_SETTINGS_SOURCES = new Set(["lightroom", "camera-raw"]);

router.post("/", async (req, res) => {
  const { photographerId, documentName, batchId, capturedAt, source, events, developSettings } = req.body;

  if (!photographerId) {
    return res.status(400).json({ error: "photographerId manquant" });
  }

  let adjustments;
  let validated;
  let rawPayload;

  if (DEVELOP_SETTINGS_SOURCES.has(source)) {
    if (!developSettings || typeof developSettings !== "object") {
      return res.status(400).json({ error: "developSettings manquant" });
    }
    adjustments = parseLightroomSettings(developSettings);
    // Un export/fichier .xmp détecté est toujours le signal de fin pour
    // cette photo (pas d'équivalent ambigu à "save" en cours de route
    // comme Photoshop).
    validated = true;
    rawPayload = developSettings;
  } else {
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "events manquant ou vide" });
    }
    validated = events.some(isValidationEvent);
    adjustments = parseSessionEvents(events);
    rawPayload = events;
  }

  const { data, error } = await supabase
    .from("photo_sessions")
    .insert({
      photographer_id: photographerId,
      document_name: documentName || null,
      batch_id: batchId || null,
      source: source || "photoshop",
      captured_at: capturedAt || new Date().toISOString(),
      raw_events: rawPayload,
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
    batch_id: batchId || null,
    source: source || "photoshop",
    // Pas encore d'image_features ici : ni le plugin Photoshop ni le
    // plugin Lightroom n'envoient (encore) un aperçu pixel de la photo au
    // backend. Voir CLAUDE.md, "reste à faire".
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
