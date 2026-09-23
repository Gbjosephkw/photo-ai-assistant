# Photo Assistant — contexte du projet

## Le produit

Assistant IA qui apprend la façon dont un photographe retouche ses photos (teint,
grain, cadre, lumière, couleur, température) en observant son travail réel dans
son logiciel habituel, puis qui peut, une fois autorisé, reproduire ces réglages
lui-même dans ce même logiciel. Ce n'est pas un éditeur de photos concurrent : on
pilote l'outil que le photographe utilise déjà (Photoshop via son API de script
UXP, potentiellement Lightroom plus tard).

Produit à vendre (pas un projet perso). Premier cas d'usage envisagé : un
photographe externe, pas encore confirmé/contacté à ce stade.

## Architecture prévue (3 briques)

1. **Capture** — un plugin dans le logiciel du photographe qui enregistre chaque
   réglage appliqué (valeurs exactes) + les caractéristiques de la photo avant/après.
   Quand le photographe exporte/sauvegarde, ça signale que la photo est validée.
2. **Apprentissage** — les paires (caractéristiques image → séquence de réglages)
   construisent un modèle personnel par photographe. Règles/clusters simples au
   départ, modèle plus poussé si le volume de données le justifie.
3. **Exécution progressive** — suggestion (préremplir, le photographe valide/corrige)
   → application en un clic → autonome uniquement si le photographe l'autorise
   explicitement, toujours en pilotant le vrai logiciel (pas de rendu maison).

## État actuel

**Squelette du plugin Photoshop (`plugin/`)** : un plugin UXP minimal qui
enregistre TOUTES les actions Photoshop (batchPlay) pendant une session,
détecte les événements d'export/sauvegarde comme marqueur de validation, et
sauvegarde chaque session dans un fichier JSON local (`session_<timestamp>.json`)
dans un dossier choisi par l'utilisateur au premier enregistrement.

Le filtrage et l'analyse des événements capturés (isoler les vrais réglages
utiles, extraire les caractéristiques de l'image) ne sont **pas encore faits** :
le plugin capture tout brut pour l'instant, le traitement viendra dans une étape
séparée.

**Non testé en conditions réelles** : ce Mac n'a pas Photoshop installé, donc ce
premier jet n'a pas pu être chargé/validé dans Photoshop. Le schéma exact du
`manifest.json` et les noms d'événements (`exportDocument`, `save`, etc.) sont à
confirmer/corriger la première fois qu'on le charge réellement.

## Comment charger le plugin (une fois qu'on a un Mac avec Photoshop + Creative Cloud)

1. Installer "UXP Developer Tool" (UDT) depuis Creative Cloud Desktop.
2. Dans UDT, "Add Plugin" → sélectionner `plugin/manifest.json`.
3. "Load" le plugin dans Photoshop (Photoshop doit être ouvert).
4. Le panneau "Photoshop Assistant" apparaît dans Photoshop (Fenêtre → Extensions).

## Reste à faire

- Confirmer avec le photographe pilote s'il travaille sur Photoshop, Lightroom,
  ou les deux (impacte le choix du SDK : UXP pour Photoshop, SDK Lua pour Lightroom).
- Charger et déboguer le plugin dans un vrai Photoshop (corriger le manifest et
  les événements capturés selon ce qui se passe réellement).
- Étape de traitement : regrouper les événements par photo, isoler les vrais
  réglages (ignorer le bruit), extraire les caractéristiques de l'image
  (détection visage/peau, histogramme, température de couleur).
- Backend de stockage du dataset d'apprentissage par photographe (probablement
  Supabase, comme ViralRemix).
- Logique d'apprentissage (règles/clusters au départ).
- Mode suggestion dans le panneau (proposer des valeurs avant que le
  photographe les applique).
