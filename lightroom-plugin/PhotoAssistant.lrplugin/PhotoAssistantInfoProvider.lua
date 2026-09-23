-- Ajoute un écran de configuration au plugin dans Fichier > Plug-in Manager
-- (Gestionnaire de modules externes) > Photo Assistant. C'est ici que
-- chaque photographe renseigne UNE FOIS son prénom : pas besoin que Joseph
-- personnalise le zip avant de l'envoyer à quelqu'un de nouveau.
--
-- Comme le reste du plugin Lightroom, PREMIER JET non testé en réel.

local LrView = import 'LrView'
local LrPrefs = import 'LrPrefs'

local prefs = LrPrefs.prefsForPlugin()

local infoProvider = {}

function infoProvider.sectionsForTopOfDialog(f, propertyTable)
  propertyTable.photographerId = prefs.photographerId or ""
  propertyTable.backendUrl = prefs.backendUrl or "https://photo-ai-assistant.vercel.app"

  propertyTable:addObserver('photographerId', function(_, _, value)
    prefs.photographerId = value
  end)
  propertyTable:addObserver('backendUrl', function(_, _, value)
    prefs.backendUrl = value
  end)

  return {
    {
      title = "Photo Assistant",
      f:row {
        f:static_text { title = "Ton prénom / identifiant :", width = 160 },
        f:edit_field { value = LrView.bind 'photographerId', width_in_chars = 20 },
      },
      f:row {
        f:static_text { title = "Serveur :", width = 160 },
        f:edit_field { value = LrView.bind 'backendUrl', width_in_chars = 35 },
      },
      f:row {
        f:static_text {
          title = "Renseigne ton prénom une seule fois ici. Ensuite, dans ta boîte de "
            .. "dialogue d'export habituelle, section \"Filtres d'export\", ajoute "
            .. "\"Photo Assistant (apprentissage)\" à ton préréglage. Rien d'autre à faire, "
            .. "chaque export enverra automatiquement tes photos.",
          width_in_chars = 55,
          height_in_lines = 4,
        },
      },
    },
  }
end

return infoProvider
