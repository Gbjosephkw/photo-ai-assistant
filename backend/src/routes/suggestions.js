const express = require("express");
const router = express.Router();
const { supabase } = require("../db/supabaseClient");
const { buildRules, pickRuleForFeatures } = require("../services/learner");

// Reconstruit les règles à la volée à partir des edits validés en base.
// Simple pour démarrer ; à remplacer par un modèle pré-calculé
// (table learned_rules, pas encore créée) une fois le volume de données
// plus important, pour ne pas tout recalculer à chaque appel.
router.post("/", async (req, res) => {
  const { photographerId, imageFeatures } = req.body;
  if (!photographerId) {
    return res.status(400).json({ error: "photographerId manquant" });
  }

  const { data: edits, error } = await supabase
    .from("photo_edits")
    .select("adjustments, image_features")
    .eq("photographer_id", photographerId)
    .eq("validated", true)
    .not("image_features", "is", null);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!edits || edits.length === 0) {
    return res.json({
      suggestion: null,
      reason: "Aucun exemple validé avec caractéristiques d'image pour ce photographe pour l'instant."
    });
  }

  const editsWithFeatures = edits.map((e) => ({
    features: e.image_features,
    adjustments: e.adjustments || []
  }));

  const rules = buildRules(editsWithFeatures);
  const rule = pickRuleForFeatures(rules, imageFeatures || {});

  if (!rule) {
    return res.json({ suggestion: null, reason: "Pas de règle disponible." });
  }

  res.json({
    suggestion: rule.suggestedAdjustments,
    condition: rule.condition,
    sampleCount: rule.sampleCount
  });
});

module.exports = router;
