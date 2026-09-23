// Transforme les événements batchPlay bruts capturés par le plugin en une
// liste de réglages "propres" : un événement par calque de réglage créé,
// avec son type et ses paramètres.
//
// Hypothèse à vérifier contre un vrai Photoshop (pas encore fait, voir
// CLAUDE.md) : un calque de réglage créé via l'UI produit un événement
// "make" dont le descriptor contient using.type._obj = le type de réglage
// ("exposure", "hueSaturation", "colorBalance", "brightnessContrast", ...).
// C'est le format documenté par Adobe, mais à confirmer événement par
// événement avec le plugin ScriptListener une fois qu'on a Photoshop sous
// la main.

const ADJUSTMENT_EVENTS = new Set(["make", "set"]);

function extractAdjustmentType(descriptor) {
  const using = descriptor && descriptor.using;
  const type = using && using.type;
  if (!type || !type._obj) return null;
  return type._obj;
}

function parseSessionEvents(events) {
  const adjustments = [];

  for (const entry of events) {
    if (!ADJUSTMENT_EVENTS.has(entry.event)) continue;
    const adjustmentType = extractAdjustmentType(entry.descriptor);
    if (!adjustmentType) continue;

    adjustments.push({
      t: entry.t,
      type: adjustmentType,
      params: entry.descriptor.using.type
    });
  }

  return adjustments;
}

function isValidationEvent(entry) {
  return ["exportDocument", "save", "saveAs", "flattenImage"].includes(entry.event);
}

// Lightroom ne donne pas un journal d'événements comme Photoshop : à
// l'export, on récupère directement l'état final des réglages de
// développement de la photo (photo:getDevelopSettings() côté plugin Lua).
// On le range dans la même forme [{ type, params }] que parseSessionEvents
// pour que learner.js (qui moyenne les champs numériques de params) marche
// sans changement pour les deux sources.
function parseLightroomSettings(developSettings) {
  if (!developSettings || typeof developSettings !== "object") return [];
  return [{ type: "lightroomDevelop", params: developSettings }];
}

module.exports = { parseSessionEvents, isValidationEvent, parseLightroomSettings };
