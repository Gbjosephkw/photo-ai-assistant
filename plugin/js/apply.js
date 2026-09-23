// Applique réellement des réglages dans Photoshop via l'API batchPlay,
// à partir d'une suggestion renvoyée par le backend.
//
// PAS ENCORE VALIDÉ EN CONDITIONS RÉELLES (pas de Photoshop disponible
// pour tester ce premier jet, voir CLAUDE.md). Les noms de champs des
// descriptors (_obj: "exposure", "hueSaturation", "colorBalance") sont
// ceux documentés par Adobe pour ces réglages, mais la bonne pratique
// pour les fiabiliser est d'enregistrer manuellement l'action dans un
// vrai Photoshop avec le plugin ScriptListener et de comparer le
// descriptor obtenu à celui écrit ici, puis corriger si besoin.

const { action, core } = require("photoshop");

async function applyExposure(params) {
  await core.executeAsModal(async () => {
    await action.batchPlay(
      [
        {
          _obj: "make",
          _target: [{ _ref: "adjustmentLayer" }],
          using: {
            _obj: "adjustmentLayer",
            type: {
              _obj: "exposure",
              exposure: params.exposure || 0,
              offset: params.offset || 0,
              gammaCorrection: params.gammaCorrection != null ? params.gammaCorrection : 1
            }
          }
        }
      ],
      {}
    );
  }, { commandName: "Photo Assistant - Exposition" });
}

async function applyHueSaturation(params) {
  await core.executeAsModal(async () => {
    await action.batchPlay(
      [
        {
          _obj: "make",
          _target: [{ _ref: "adjustmentLayer" }],
          using: {
            _obj: "adjustmentLayer",
            type: {
              _obj: "hueSaturation",
              hue: params.hue || 0,
              saturation: params.saturation || 0,
              lightness: params.lightness || 0
            }
          }
        }
      ],
      {}
    );
  }, { commandName: "Photo Assistant - Teinte/Saturation" });
}

async function applyColorBalance(params) {
  await core.executeAsModal(async () => {
    await action.batchPlay(
      [
        {
          _obj: "make",
          _target: [{ _ref: "adjustmentLayer" }],
          using: {
            _obj: "adjustmentLayer",
            type: {
              _obj: "colorBalance",
              shadowLevels: params.shadowLevels || [0, 0, 0],
              midtoneLevels: params.midtoneLevels || [0, 0, 0],
              highlightLevels: params.highlightLevels || [0, 0, 0],
              preserveLuminosity: true
            }
          }
        }
      ],
      {}
    );
  }, { commandName: "Photo Assistant - Balance des couleurs" });
}

// suggestion attendu, ex :
// { exposure: {exposure: 0.2}, hueSaturation: {saturation: 5}, colorBalance: {midtoneLevels:[0,0,10]} }
async function applySuggestion(suggestion) {
  if (suggestion.exposure) await applyExposure(suggestion.exposure);
  if (suggestion.hueSaturation) await applyHueSaturation(suggestion.hueSaturation);
  if (suggestion.colorBalance) await applyColorBalance(suggestion.colorBalance);
}
