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

// Ni Lightroom ni Camera Raw ne donnent un journal d'événements comme
// Photoshop : on récupère directement l'état final des réglages de
// développement de la photo (photo:getDevelopSettings() côté plugin Lua
// pour Lightroom ; attributs crs: lus dans le fichier .xmp annexe pour
// Camera Raw — même moteur de traitement RAW, même schéma de réglages).
// On le range dans la même forme [{ type, params }] que parseSessionEvents
// pour que learner.js (qui moyenne les champs numériques de params) marche
// sans changement, quelle que soit la source.
function parseLightroomSettings(developSettings) {
  if (!developSettings || typeof developSettings !== "object") return [];
  return [{ type: "developSettings", params: developSettings }];
}

module.exports = { parseSessionEvents, isValidationEvent, parseLightroomSettings };
