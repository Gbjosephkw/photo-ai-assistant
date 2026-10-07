// Photo Assistant — surveillance Camera Raw.
//
// Surveille un dossier pour les fichiers .xmp annexes que Camera Raw (ou
// Bridge) écrit automatiquement quand on règle une photo RAW, et envoie
// ces réglages au même backend que les plugins Photoshop et Lightroom.
// Nécessaire parce que des réglages faits uniquement dans Camera Raw
// (exposition, contraste, balance des blancs...) ne passent jamais par un
// calque de réglage Photoshop classique — le plugin Photoshop ne les voit
// pas du tout (voir CLAUDE.md).
//
// PREMIER JET, JAMAIS TESTÉ EN CONDITIONS RÉELLES (pas de Camera Raw
// disponible ici pour vérifier). Suppose que Camera Raw est réglé pour
// écrire des fichiers .xmp à côté des photos (Préférences Camera Raw >
// "Enregistrer les réglages d'image dans" > "Fichiers .xmp annexes", PAS
// "Base de données Camera Raw"). Sans ce réglage, aucun fichier .xmp
// n'est écrit et ce script ne verra jamais rien passer — voir LISEZ-MOI.txt.
//
// Nécessite Node.js installé sur la machine (contrairement aux plugins
// Photoshop/Lightroom qui s'intègrent directement dans l'application).

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
const POLL_INTERVAL_MS = 4000;
const SETTLE_DELAY_MS = 2000; // attendre que le fichier soit stable avant de le lire
const BATCH_WINDOW_MS = 8000; // fichiers modifiés à moins de 8s d'écart = même lot

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(
    "Fichier config.json manquant. Copie config.example.json en config.json et renseigne tes informations (voir LISEZ-MOI.txt)."
  );
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const { photographerId, backendUrl, watchFolder } = config;

if (!photographerId || photographerId === "PHOTOGRAPHE_A_REMPLACER") {
  console.error("photographerId non configuré dans config.json.");
  process.exit(1);
}
if (!watchFolder || !fs.existsSync(watchFolder)) {
  console.error("Dossier introuvable (watchFolder dans config.json) : " + watchFolder);
  process.exit(1);
}

console.log("Photo Assistant — surveillance Camera Raw");
console.log("Dossier surveillé : " + watchFolder);
console.log("Photographe : " + photographerId);
console.log("Serveur : " + backendUrl);
console.log("(laisse cette fenêtre ouverte pendant que tu travailles, tu peux la réduire)");
console.log("");

const knownMtimes = new Map(); // chemin -> mtimeMs déjà envoyé
const pending = new Map(); // chemin -> { mtime, firstSeenAt }
let currentBatchId = null;
let lastBatchAt = 0;

function newBatchId() {
  return "batch_cr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function findXmpFiles(dir, results) {
  results = results || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findXmpFiles(full, results);
    } else if (entry.isFile() && full.toLowerCase().endsWith(".xmp")) {
      results.push(full);
    }
  }
  return results;
}

// Les fichiers .xmp écrits par Camera Raw contiennent les réglages comme
// attributs XML du type crs:NomDuReglage="valeur" sur la balise
// rdf:Description (ex. crs:Exposure2012="0.90", crs:Contrast2012="31",
// crs:Temperature="4950"...). On les extrait tous génériquement plutôt que
// de lister chaque nom à l'avance, pour ne rien rater si Adobe en ajoute.
function parseXmpCrsSettings(xmlText) {
  const settings = {};
  const regex = /crs:([A-Za-z0-9]+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    const key = match[1];
    const raw = match[2];
    const num = Number(raw);
    settings[key] = raw !== "" && !Number.isNaN(num) ? num : raw;
  }
  return settings;
}

async function sendToBackend(filePath, developSettings, batchId) {
  const documentName = path.basename(filePath);
  try {
    const res = await fetch(backendUrl + "/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photographerId,
        documentName,
        batchId,
        capturedAt: new Date().toISOString(),
        source: "camera-raw",
        developSettings
      })
    });
    if (res.ok) {
      console.log("Envoyé : " + documentName);
    } else {
      console.log("Échec envoi (" + res.status + ") : " + documentName);
    }
  } catch (err) {
    console.log("Erreur réseau pour " + documentName + " : " + err.message);
  }
}

function processFile(filePath) {
  let xmlText;
  try {
    xmlText = fs.readFileSync(filePath, "utf8");
  } catch (_e) {
    return;
  }
  const settings = parseXmpCrsSettings(xmlText);
  if (Object.keys(settings).length === 0) return;

  const now = Date.now();
  if (now - lastBatchAt > BATCH_WINDOW_MS) {
    currentBatchId = newBatchId();
  }
  lastBatchAt = now;

  sendToBackend(filePath, settings, currentBatchId);
}

function poll() {
  const xmpFiles = findXmpFiles(watchFolder, []);
  const now = Date.now();

  for (const filePath of xmpFiles) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (_e) {
      continue;
    }
    const mtime = stat.mtimeMs;

    if (knownMtimes.get(filePath) === mtime) continue; // déjà envoyé, inchangé

    const existing = pending.get(filePath);
    if (!existing || existing.mtime !== mtime) {
      pending.set(filePath, { mtime, firstSeenAt: now });
      continue; // on confirme que le fichier est stable au prochain passage
    }

    if (now - existing.firstSeenAt >= SETTLE_DELAY_MS) {
      knownMtimes.set(filePath, mtime);
      pending.delete(filePath);
      processFile(filePath);
    }
  }
}

setInterval(poll, POLL_INTERVAL_MS);
poll();
