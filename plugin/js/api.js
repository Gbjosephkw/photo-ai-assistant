// Wrapper simple autour des appels au backend Photo Assistant. Toutes les
// fonctions lisent l'URL du serveur et l'identifiant du photographe
// directement dans les champs du panneau (pas de config séparée pour
// rester simple pendant la phase de test).

const PLUGIN_VERSION = "1.0.0"; // doit rester identique à manifest.json > version

function getBackendUrl() {
  return document.getElementById("backendUrl").value.trim().replace(/\/$/, "");
}

function getPhotographerId() {
  return document.getElementById("photographerId").value.trim();
}

async function submitSession(payload) {
  const url = getBackendUrl() + "/api/sessions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photographerId: getPhotographerId(), ...payload })
  });
  if (!res.ok) throw new Error("Envoi session échoué : " + res.status);
  return res.json();
}

async function fetchSuggestion(imageFeatures) {
  const url = getBackendUrl() + "/api/suggestions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photographerId: getPhotographerId(), imageFeatures })
  });
  if (!res.ok) throw new Error("Récupération suggestion échouée : " + res.status);
  return res.json();
}

async function fetchPermission() {
  const url = getBackendUrl() + "/api/permissions/" + encodeURIComponent(getPhotographerId());
  const res = await fetch(url);
  if (!res.ok) throw new Error("Lecture permission échouée : " + res.status);
  return res.json();
}

async function sendFeedback(type, message, context) {
  const url = getBackendUrl() + "/api/feedback";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photographerId: getPhotographerId(),
      type,
      message,
      context,
      pluginVersion: PLUGIN_VERSION
    })
  });
  if (!res.ok) throw new Error("Envoi du signalement échoué : " + res.status);
  return res.json();
}

async function fetchLatestVersion() {
  const url = getBackendUrl() + "/api/version/latest";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Vérification de version échouée : " + res.status);
  return res.json();
}
