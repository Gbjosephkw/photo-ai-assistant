// Apprentissage volontairement simple pour démarrer (pas de ML lourd) :
// on regroupe les réglages validés (photo exportée par le photographe) par
// "condition" (bucket grossier basé sur la luminosité/chaleur de l'image),
// et on moyenne les paramètres numériques de chaque type de réglage dans
// chaque groupe. Plus un groupe contient d'exemples validés, plus la
// suggestion associée est fiable (sampleCount = nombre d'exemples).
//
// À faire évoluer vers quelque chose de plus fin une fois qu'on a du vrai
// volume : plus de buckets, ou un vrai modèle de régression par type de
// réglage.

function bucketCondition(features) {
  const brightness = (features && features.avgBrightness) || 128;
  const warmth = (features && features.warmthEstimate) || 0;

  const lightBucket =
    brightness < 85 ? "sombre" : brightness < 170 ? "moyen" : "clair";
  const warmthBucket = warmth > 10 ? "chaud" : warmth < -10 ? "froid" : "neutre";

  return lightBucket + "_" + warmthBucket;
}

function averageParams(paramsList) {
  const keys = new Set();
  paramsList.forEach((p) => Object.keys(p || {}).forEach((k) => {
    if (typeof p[k] === "number") keys.add(k);
  }));

  const result = {};
  keys.forEach((k) => {
    const values = paramsList.map((p) => p[k]).filter((v) => typeof v === "number");
    if (values.length === 0) return;
    result[k] = values.reduce((a, b) => a + b, 0) / values.length;
  });
  return result;
}

// editsWithFeatures: [{ features, adjustments: [{type, params}] }]
function buildRules(editsWithFeatures) {
  const groups = {};

  for (const sample of editsWithFeatures) {
    const key = bucketCondition(sample.features);
    if (!groups[key]) groups[key] = [];
    groups[key].push(sample);
  }

  const rules = [];
  for (const [condition, samples] of Object.entries(groups)) {
    const byType = {};
    for (const sample of samples) {
      for (const adj of sample.adjustments || []) {
        if (!byType[adj.type]) byType[adj.type] = [];
        byType[adj.type].push(adj.params);
      }
    }

    const suggestedAdjustments = {};
    for (const [type, paramsList] of Object.entries(byType)) {
      suggestedAdjustments[type] = averageParams(paramsList);
    }

    rules.push({
      condition,
      suggestedAdjustments,
      sampleCount: samples.length
    });
  }

  return rules;
}

function pickRuleForFeatures(rules, features) {
  const key = bucketCondition(features);
  const exactMatch = rules.find((r) => r.condition === key);
  if (exactMatch) return exactMatch;
  // Pas de correspondance exacte : on prend la règle avec le plus
  // d'exemples plutôt que rien, mais la route /suggestions doit signaler
  // au photographe que c'est une estimation moins fiable.
  const sorted = [...rules].sort((a, b) => b.sampleCount - a.sampleCount);
  return sorted[0] || null;
}

module.exports = { bucketCondition, buildRules, pickRuleForFeatures };
