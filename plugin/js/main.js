const photoshop = require("photoshop");
const { action, app } = photoshop;
const { storage } = require("uxp");
const fs = storage.localFileSystem;

// Événements bruités à ignorer (lecture d'état, pas des vraies modifications)
const IGNORED_EVENTS = new Set([
  "select", "selectNoLayers", "get", "multiGet", "null", "ping", "measure"
]);

// Événements qui signalent que le photographe considère la photo terminée
const EXPORT_EVENTS = new Set([
  "exportDocument", "save", "saveAs", "flattenImage"
]);

let recording = false;
let currentSession = [];
let savedFolder = null;

const statusEl = document.getElementById("status");
const counterEl = document.getElementById("counter");
const logEl = document.getElementById("log");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");

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
  appendLog("--- Enregistrement arrêté, sauvegarde... ---");
  await saveSession();
}

async function saveSession() {
  if (currentSession.length === 0) {
    appendLog("Rien à sauvegarder.");
    return;
  }
  try {
    if (!savedFolder) {
      // Première sauvegarde : demande à l'utilisateur de choisir un dossier.
      // UXP se souvient de ce dossier pour les prochaines sauvegardes.
      savedFolder = await fs.getFolder();
    }
    const fileName = "session_" + Date.now() + ".json";
    const file = await savedFolder.createFile(fileName, { overwrite: true });
    const payload = {
      capturedAt: new Date().toISOString(),
      documentName: app.activeDocument ? app.activeDocument.name : null,
      events: currentSession
    };
    await file.write(JSON.stringify(payload, null, 2));
    appendLog("Session sauvegardée : " + fileName + " (" + currentSession.length + " actions)");
  } catch (err) {
    appendLog("Erreur de sauvegarde : " + err.message);
  }
}

// Écoute TOUTES les actions Photoshop (batchPlay) pendant l'enregistrement.
// On capture tout brut ici ; le filtrage/l'analyse se fera dans une étape
// séparée (traitement du fichier JSON), pas en temps réel dans le plugin.
action.addNotificationListener(["all"], (event, descriptor) => {
  if (!recording) return;
  if (IGNORED_EVENTS.has(event)) return;

  currentSession.push({
    t: Date.now(),
    event,
    descriptor
  });
  updateCounter();

  if (EXPORT_EVENTS.has(event)) {
    appendLog("Export/sauvegarde détecté (" + event + ") — photo considérée comme validée.");
  }
});

btnStart.addEventListener("click", startRecording);
btnStop.addEventListener("click", stopRecording);
