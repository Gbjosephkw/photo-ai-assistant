const photoshop = require("photoshop");
const { action, app } = photoshop;
const { storage } = require("uxp");
const fs = storage.localFileSystem;

const IGNORED_EVENTS = new Set([
  "select", "selectNoLayers", "get", "multiGet", "null", "ping", "measure"
]);

const EXPORT_EVENTS = new Set([
  "exportDocument", "save", "saveAs", "flattenImage"
]);

// Enregistrement automatique et permanent : le photographe n'a rien à
// cliquer. Le seul déclencheur qui compte est l'export/la sauvegarde
// (EXPORT_EVENTS ci-dessous), qui envoie automatiquement CETTE photo au
// serveur et repart à zéro pour elle. Le bouton "Pause" reste disponible
// pour les cas où le photographe ne veut pas être enregistré (test,
// retouche non représentative), mais n'est jamais obligatoire.
//
// Un photographe qui traite un lot ouvre souvent plusieurs dizaines/
// centaines de photos d'un coup, leur applique un réglage de base commun
// (preset), puis affine chaque photo individuellement. Il faut donc suivre
// les événements PAR DOCUMENT (pas dans un seul tas global), sinon les
// actions de plusieurs photos ouvertes en même temps se mélangent.
let recording = true;
let sessionsByDocument = new Map(); // id de document Photoshop -> { events, documentName, batchId }
let currentBatchId = null;
let lastOpenAt = 0;
const BATCH_WINDOW_MS = 5000; // des documents ouverts à moins de 5s d'écart = même lot

let savedFolder = null;
let autonomousEnabled = false;
let pendingSuggestion = null;
let photosEnvoyees = 0;

const statusEl = document.getElementById("status");
const permissionEl = document.getElementById("permissionStatus");
const counterEl = document.getElementById("counter");
const logEl = document.getElementById("log");
const btnPause = document.getElementById("btnPause");
const btnSuggest = document.getElementById("btnSuggest");
const btnApplySuggestion = document.getElementById("btnApplySuggestion");
const modeSelect = document.getElementById("modeSelect");
const suggestionBox = document.getElementById("suggestionBox");
const updateBanner = document.getElementById("updateBanner");
const feedbackType = document.getElementById("feedbackType");
const feedbackMessage = document.getElementById("feedbackMessage");
const btnSendFeedback = document.getElementById("btnSendFeedback");
const feedbackStatus = document.getElementById("feedbackStatus");

function setStatus(text) {
  statusEl.textContent = "Statut : " + text;
}

function appendLog(line) {
  const p = document.createElement("div");
  p.textContent = line;
  logEl.prepend(p);
}

function updateCounter() {
  counterEl.textContent =
    photosEnvoyees + " photo(s) envoyée(s) — " + sessionsByDocument.size + " en cours de retouche";
}

// --- Enregistrement automatique ---------------------------------------------

function togglePause() {
  recording = !recording;
  if (recording) {
    setStatus("actif (automatique)");
    btnPause.textContent = "Mettre en pause";
    appendLog("--- Reprise de l'enregistrement ---");
  } else {
    setStatus("en pause");
    btnPause.textContent = "Reprendre l'enregistrement";
    appendLog("--- Enregistrement mis en pause (rien n'est capturé) ---");
  }
}

function newBatchId() {
  return "batch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function getActiveDocId() {
  return app.activeDocument ? app.activeDocument.id : null;
}

function ensureDocEntry(docId, docNameHint) {
  if (!sessionsByDocument.has(docId)) {
    sessionsByDocument.set(docId, {
      events: [],
      documentName: docNameHint || (app.activeDocument ? app.activeDocument.name : null),
      batchId: currentBatchId,
      lastEventAt: Date.now()
    });
  }
  return sessionsByDocument.get(docId);
}

// Au chargement du plugin, s'il y a déjà des photos ouvertes dans
// Photoshop (cas typique : le photographe a ouvert tout un lot avant de
// charger le plugin), on les rattache toutes au lot de départ. On ne peut
// pas récupérer leur historique de modifications d'avant le chargement du
// plugin (Photoshop ne l'expose pas de façon exploitable via l'API), donc
// seules les modifications faites APRÈS le chargement seront capturées
// pour ces documents-là.
function registerAlreadyOpenDocuments() {
  currentBatchId = newBatchId();
  if (!app.documents || app.documents.length === 0) return;
  for (const doc of app.documents) {
    ensureDocEntry(doc.id, doc.name);
  }
  appendLog(
    app.documents.length + " photo(s) déjà ouverte(s) détectée(s) au démarrage, rattachée(s) au lot en cours."
  );
  updateCounter();
}

async function flushDocument(docId) {
  const entry = sessionsByDocument.get(docId);
  sessionsByDocument.delete(docId);
  updateCounter();
  if (!entry || entry.events.length === 0) return;

  await saveSessionLocally(entry);
  await sendSessionToBackend(entry);
}

async function saveSessionLocally(entry) {
  try {
    if (!savedFolder) savedFolder = await fs.getFolder();
    const fileName = "session_" + Date.now() + ".json";
    const file = await savedFolder.createFile(fileName, { overwrite: true });
    const payload = {
      capturedAt: new Date().toISOString(),
      documentName: entry.documentName,
      batchId: entry.batchId,
      events: entry.events
    };
    await file.write(JSON.stringify(payload, null, 2));
  } catch (err) {
    appendLog("Erreur sauvegarde locale : " + err.message);
  }
}

async function sendSessionToBackend(entry) {
  try {
    const result = await submitSession({
      documentName: entry.documentName,
      batchId: entry.batchId,
      capturedAt: new Date().toISOString(),
      events: entry.events
    });
    photosEnvoyees++;
    updateCounter();
    appendLog(
      "Photo envoyée (" + (entry.documentName || "sans nom") + ", " +
      result.adjustmentsCount + " réglages reconnus)."
    );
  } catch (err) {
    appendLog("Envoi serveur échoué (la copie locale reste dispo) : " + err.message);
    await reportError("Échec d'envoi de session au serveur", err);
  }
}

action.addNotificationListener(["all"], (event, descriptor) => {
  if (!recording) return;
  if (IGNORED_EVENTS.has(event)) return;

  if (event === "open") {
    const now = Date.now();
    if (now - lastOpenAt > BATCH_WINDOW_MS) {
      currentBatchId = newBatchId();
      appendLog("Nouveau lot de photos détecté.");
    }
    lastOpenAt = now;
  }

  const docId = getActiveDocId();
  if (docId == null) return; // pas de document actif, rien à rattacher

  const entry = ensureDocEntry(docId);
  entry.events.push({ t: Date.now(), event, descriptor });
  entry.lastEventAt = Date.now();
  updateCounter();

  if (EXPORT_EVENTS.has(event)) {
    appendLog("Export/sauvegarde détecté — envoi de cette photo...");
    flushDocument(docId);
    return;
  }

  if (event === "close") {
    // Le photographe ferme la photo sans avoir explicitement exporté (ou
    // après l'avoir déjà fait) : on envoie ce qu'il y a, le serveur marque
    // "non validé" si aucun événement d'export n'apparaît dans la liste.
    flushDocument(docId);
  }
});

// Filet de sécurité : si un export groupé (plusieurs photos, un seul clic)
// ne se comporte pas comme prévu — par exemple un seul événement global au
// lieu d'un événement par photo — on évite de perdre des données en
// envoyant quand même une photo restée inactive trop longtemps. À vérifier
// et ajuster avec un vrai test chez le photographe (voir CLAUDE.md).
const IDLE_FLUSH_CHECK_MS = 60 * 1000;
const IDLE_FLUSH_AFTER_MS = 3 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [docId, entry] of sessionsByDocument.entries()) {
    if (now - entry.lastEventAt > IDLE_FLUSH_AFTER_MS) {
      appendLog(
        "Pas d'activité récente sur " + (entry.documentName || "une photo") + ", envoi de sécurité."
      );
      flushDocument(docId);
    }
  }
}, IDLE_FLUSH_CHECK_MS);

// --- Suggestion / mode autonome -------------------------------------------

async function requestSuggestion() {
  pendingSuggestion = null;
  btnApplySuggestion.hidden = true;
  suggestionBox.textContent = "Recherche d'une suggestion...";
  try {
    // Caractéristiques d'image : pas encore extraites côté plugin (ça
    // demande d'exporter un aperçu pixel et de l'envoyer au serveur, pas
    // encore câblé). Le serveur répond honnêtement "pas assez appris" tant
    // que ça n'est pas branché. Voir CLAUDE.md.
    const features = { documentName: app.activeDocument ? app.activeDocument.name : null };
    const result = await fetchSuggestion(features);

    if (!result.suggestion) {
      suggestionBox.textContent = result.reason || "Pas encore de suggestion disponible.";
      return;
    }

    pendingSuggestion = result.suggestion;
    suggestionBox.textContent =
      "Condition : " + result.condition + " (" + result.sampleCount + " exemples)\n" +
      JSON.stringify(result.suggestion, null, 2);

    const mode = modeSelect.value;
    if (mode === "suggest") {
      btnApplySuggestion.hidden = false;
    } else if (mode === "auto") {
      if (!autonomousEnabled) {
        appendLog("Mode autonome demandé mais non autorisé par le photographe pour l'instant.");
        return;
      }
      await applySuggestion(pendingSuggestion);
      appendLog("Suggestion appliquée automatiquement.");
    }
  } catch (err) {
    suggestionBox.textContent = "Erreur : " + err.message;
    await reportError("Échec de récupération de suggestion", err);
  }
}

btnApplySuggestion.addEventListener("click", async () => {
  if (!pendingSuggestion) return;
  try {
    await applySuggestion(pendingSuggestion);
    appendLog("Suggestion appliquée (validée manuellement).");
    btnApplySuggestion.hidden = true;
  } catch (err) {
    appendLog("Erreur en appliquant la suggestion : " + err.message);
    await reportError("Échec d'application de suggestion", err);
  }
});

async function refreshPermission() {
  try {
    const result = await fetchPermission();
    autonomousEnabled = !!result.autonomousEnabled;
    permissionEl.textContent = "Mode autonome : " + (autonomousEnabled ? "activé" : "désactivé");
  } catch (err) {
    permissionEl.textContent = "Mode autonome : impossible de vérifier (" + err.message + ")";
  }
}

// --- Signalement de bug / plainte / suggestion -----------------------------

btnSendFeedback.addEventListener("click", async () => {
  const message = feedbackMessage.value.trim();
  if (!message) {
    feedbackStatus.textContent = "Écris un message avant d'envoyer.";
    return;
  }
  try {
    await sendFeedback(feedbackType.value, message, {
      documentName: app.activeDocument ? app.activeDocument.name : null,
      mode: modeSelect.value
    });
    feedbackStatus.textContent = "Envoyé, merci.";
    feedbackMessage.value = "";
  } catch (err) {
    feedbackStatus.textContent = "Échec de l'envoi : " + err.message;
  }
});

// Capture automatique des erreurs du plugin lui-même et les envoie dans la
// même boîte de réception centrale (type "error"), pour qu'on les voie sans
// que le photographe ait besoin de les signaler à la main.
async function reportError(label, err) {
  try {
    await sendFeedback("error", label + " : " + (err && err.message ? err.message : String(err)), {
      stack: err && err.stack ? err.stack : null
    });
  } catch (_e) {
    // Si même le signalement d'erreur échoue (ex: pas de réseau), on ne
    // fait rien de plus : pas de boucle d'erreurs.
  }
}

window.addEventListener("error", (event) => {
  reportError("Erreur non interceptée dans le plugin", event.error || new Error(event.message));
});

// --- Vérification de version -----------------------------------------------

async function checkForUpdate() {
  try {
    const latest = await fetchLatestVersion();
    if (latest.version && latest.version !== PLUGIN_VERSION) {
      updateBanner.hidden = false;
      updateBanner.textContent =
        "Nouvelle version disponible : " + latest.version +
        (latest.releaseNotes ? " — " + latest.releaseNotes : "") +
        ". Demande le plugin mis à jour.";
    }
  } catch (_err) {
    // Pas grave si la vérification échoue (serveur pas encore démarré,
    // par exemple pendant le développement) : on n'affiche rien.
  }
}

// --- Câblage des boutons + démarrage ----------------------------------------

btnPause.addEventListener("click", togglePause);
btnSuggest.addEventListener("click", requestSuggestion);
modeSelect.addEventListener("change", refreshPermission);

// L'enregistrement démarre tout seul dès que le panneau est chargé, pas
// besoin d'action du photographe.
setStatus("actif (automatique)");
registerAlreadyOpenDocuments();
updateCounter();
appendLog("Enregistrement automatique actif — retouche normalement, chaque export est envoyé tout seul.");

checkForUpdate();
