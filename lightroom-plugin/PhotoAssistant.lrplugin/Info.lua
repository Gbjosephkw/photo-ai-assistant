return {
  LrSdkVersion = 10.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = 'com.jarvis.photoassistant.lightroom',
  LrPluginName = "Photo Assistant",

  -- Extension "Export Filter" : apparaît comme un filtre optionnel dans la
  -- section "Filtres" de N'IMPORTE QUEL export Lightroom (pas une
  -- destination à part, donc ça ne change rien à la façon dont le
  -- photographe exporte déjà). Une fois ajouté UNE FOIS à son préréglage
  -- d'export habituel, ça tourne automatiquement à chaque export, sans
  -- clic supplémentaire.
  LrExportFilterProvider = {
    title = "Photo Assistant (apprentissage)",
    file = 'PhotoAssistantFilter.lua',
    id = 'com.jarvis.photoassistant.filter',
  },

  -- Écran de configuration dans Fichier > Plug-in Manager : chaque
  -- photographe y renseigne son prénom une seule fois (voir
  -- PhotoAssistantInfoProvider.lua). Permet de distribuer UN SEUL zip
  -- identique à plusieurs photographes sans rien personnaliser à la main.
  LrPluginInfoProvider = 'PhotoAssistantInfoProvider.lua',

  VERSION = { major = 1, minor = 0, revision = 0, build = 0 },
}
