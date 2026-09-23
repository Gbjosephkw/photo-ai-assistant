-- Photo Assistant — filtre d'export Lightroom Classic.
--
-- PREMIER JET, JAMAIS CHARGÉ DANS UN VRAI LIGHTROOM (pas de Lightroom
-- disponible pour tester). Le SDK Lightroom Classic (API Lua) est une
-- surface moins documentée dans mes connaissances que l'API Photoshop, donc
-- ce fichier est encore plus susceptible d'avoir besoin d'ajustements au
-- premier vrai chargement que le plugin Photoshop. À tester en priorité
-- via Fichier > Plug-in Manager > Ajouter, avec un export réel.
--
-- Principe : à chaque export (n'importe quelle destination, dès que ce
-- filtre est ajouté au préréglage d'export du photographe), on récupère
-- les réglages de développement finaux de chaque photo exportée
-- (photo:getDevelopSettings(), un instantané complet : exposition,
-- contraste, hautes/basses lumières, teinte, saturation, etc.) et on les
-- envoie au même backend que le plugin Photoshop.
--
-- Configuration : identifiant du photographe et URL du serveur lus depuis
-- les préférences globales du plugin (voir PhotoAssistantInfoProvider.lua),
-- que chaque photographe renseigne UNE FOIS lui-même dans Fichier >
-- Plug-in Manager > Photo Assistant. Un seul zip de ce plugin sert pour
-- tout le monde, personne n'a besoin de modifier le code avant de
-- l'envoyer à un nouveau photographe.

local LrTasks = import 'LrTasks'
local LrHttp = import 'LrHttp'
local LrPrefs = import 'LrPrefs'
local json = require 'json'

local prefs = LrPrefs.prefsForPlugin()

local exportFilter = {}

exportFilter.exportFilterAttributes = { thisPlugin = true }

-- Un seul batchId par export lancé (regroupe toutes les photos exportées
-- ensemble en un clic) : contrairement à Photoshop, Lightroom nous donne
-- déjà tout le lot en un seul appel, pas besoin d'heuristique de fenêtre
-- de temps.
local function newBatchId()
  return "batch_lr_" .. tostring(os.time()) .. "_" .. tostring(math.random(100000, 999999))
end

function exportFilter.postProcessRenderedPhotos(functionContext, filterContext)
  local photographerId = prefs.photographerId
  local backendUrl = prefs.backendUrl

  if backendUrl == nil or backendUrl == "" then
    backendUrl = "https://photo-ai-assistant.vercel.app"
  end

  if photographerId == nil or photographerId == "" then
    -- Pas encore configuré (Fichier > Plug-in Manager > Photo Assistant) :
    -- on ne bloque pas l'export du photographe, on n'envoie simplement rien.
    return
  end

  local batchId = newBatchId()

  for _, rendition in filterContext:renditions() do
    local photo = rendition.photo

    LrTasks.startAsyncTask(function()
      local ok, developSettings = LrTasks.pcall(function()
        return photo:getDevelopSettings()
      end)

      if not ok or developSettings == nil then
        return
      end

      local okName, documentName = LrTasks.pcall(function()
        return photo:getFormattedMetadata('fileName')
      end)
      if not okName then documentName = nil end

      local payload = {
        photographerId = photographerId,
        documentName = documentName,
        batchId = batchId,
        capturedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        source = "lightroom",
        developSettings = developSettings,
      }

      local body = json.encode(payload)

      LrTasks.pcall(function()
        LrHttp.post(
          backendUrl .. "/api/sessions",
          body,
          { { field = "Content-Type", value = "application/json" } }
        )
      end)
    end)
  end
end

return exportFilter
