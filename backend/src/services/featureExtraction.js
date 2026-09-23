// Extraction de caractéristiques d'image à partir d'un fichier photo.
// Version actuelle : statistiques de base via sharp (luminosité, dominante
// de couleur, contraste approximatif). La détection de visage/peau n'est
// PAS encore implémentée ici : c'est la pièce manquante la plus importante
// avant de pouvoir vraiment associer un réglage à "ce visage, cette peau".
// À brancher sur un vrai service de détection une fois qu'on a de vraies
// photos du photographe pilote à traiter (voir CLAUDE.md).

const sharp = require("sharp");

async function extractBasicFeatures(imagePathOrBuffer) {
  const image = sharp(imagePathOrBuffer);
  const stats = await image.stats();
  const meta = await image.metadata();

  const [r, g, b] = stats.channels;

  return {
    width: meta.width,
    height: meta.height,
    avgBrightness: (r.mean + g.mean + b.mean) / 3,
    avgColor: { r: r.mean, g: g.mean, b: b.mean },
    contrastEstimate: (r.stdev + g.stdev + b.stdev) / 3,
    // Estimation grossière et non calibrée de la température de couleur :
    // rouge dominant = plus chaud, bleu dominant = plus froid.
    warmthEstimate: r.mean - b.mean
  };
}

// TODO : détection de visage + zones de peau (pièce manquante, voir CLAUDE.md).
async function extractFaceAndSkinFeatures(_imagePathOrBuffer) {
  return {
    faceDetected: false,
    note: "Détection de visage non implémentée — à brancher sur un vrai service de vision."
  };
}

async function extractFeatures(imagePathOrBuffer) {
  const basic = await extractBasicFeatures(imagePathOrBuffer);
  const face = await extractFaceAndSkinFeatures(imagePathOrBuffer);
  return { ...basic, ...face };
}

module.exports = { extractFeatures };
