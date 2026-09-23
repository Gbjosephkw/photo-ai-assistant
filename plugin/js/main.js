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

let recording = false;
let currentSession = [];
let savedFolder = null;
let autonomousEnabled = false;
let pendingSuggestion = null;

const statusEl = document.getElementById("status");
const permissionEl = document.getElementById("permissionStatus");
const counterEl = document.getElementById("counter");
const logEl = document.getElementById("log");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
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
  counterEl.textContent = currentSession.length + " actions capturées";
}

// --- Enregistrement -------------------------------------------------------

function startRecording() {
  recording = true;
  currentSession = [];
  updateCounter();
  setStatus("enregistrement en cours");
  appendLog("--- Nouvel enregistrement démarré ---");
}

async function stopRecording() {
  recording = false;
  setStatus("arrêté");
  appendLog("--- Enregistrement arrêté ---");
  await saveSessionLocally();
  await sendSessionToBackend();
}

async function saveSessionLocally() {
  if (currentSession.length === 0) return;
  try {
    if (!savedFolder) savedFolder = await fs.getFolder();
    const fileName = "session_" + Date.now() + ".json";
    const file = await savedFolder.createFile(fileName, { overwrite: true });
    const payload = {
      capturedAt: new Date().toISOString(),
      documentName: app.activeDocument ? app.activeDocument.name : null,
      events: currentSession
    };
    await file.write(JSON.stringify(payload, null, 2));
    appendLog("Copie locale sauvegardée : " + fileName);
  } catch (err) {
    appendLog("Erreur sauvegarde locale : " + err.message);
  }
}

async function sendSessionToBackend() {
  if (currentSession.length === 0) return;
  try {
    const result = await submitSession({
      documentName: app.activeDocument ? app.activeDocument.name : null,
      capturedAt: new Date().toISOString(),
      events: currentSession
    });
    appendLog(
      "Session envoyée au serveur (" + currentSession.length + " actions, " +
      result.adjustmentsCount + " réglages reconnus" +
      (result.validated ? ", export détecté)" : ", pas d'export détecté)")
    );
  } catch (err) {
    appendLog("Envoi serveur échoué (la copie locale reste dispo) : " + err.message);
    await reportError("Échec d'envoi de session au serveur", err);
  }
}

action.addNotificationListener(["all"], (event, descriptor) => {
  if (!recording) return;
  if (IGNORED_EVENTS.has(event)) return;
  currentSession.push({ t: Date.now(), event, descriptor });
  updateCounter();
  if (EXPORT_EVENTS.has(event)) {
    appendLog("Export/sauvegarde détecté (" + event + ") — photo considérée comme validée.");
  }
});

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

btnStart.addEventListener("click", startRecording);
btnStop.addEventListener("click", stopRecording);
btnSuggest.addEventListener("click", requestSuggestion);
modeSelect.addEventListener("change", refreshPermission);

checkForUpdate();
