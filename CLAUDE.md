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

## Modèle de fonctionnement choisi par Joseph : "mise à jour téléphone"

Joseph n'a pas Photoshop et ne développera pas chez un photographe en direct.
Le modèle retenu : tout est conçu et corrigé à un seul endroit (chez nous), les
photographes testeurs font remonter bugs/plaintes/erreurs dans une boîte de
réception centrale (le backend), on analyse et corrige de notre côté, puis on
redistribue le plugin corrigé.

**Limite honnête à connaître** : tant que le plugin est chargé "en local" chez
le photographe (via UXP Developer Tool, pas publié sur la marketplace Adobe),
on ne peut pas pousser une mise à jour silencieusement sur sa machine comme le
ferait un vrai téléphone. Le plugin vérifie la dernière version publiée au
démarrage et affiche un bandeau si une mise à jour existe, mais il faut
ensuite renvoyer le dossier du plugin corrigé au photographe pour qu'il le
recharge. Le vrai déploiement automatique et silencieux ne devient possible
qu'en publiant le plugin sur la marketplace Adobe (Creative Cloud gère alors
la distribution comme le fait un store d'applications) — objectif réaliste
une fois le produit stabilisé avec les premiers testeurs, pas dès maintenant.

## Architecture (3 briques + 2 briques de fonctionnement produit)

1. **Capture** (`plugin/`) — plugin Photoshop (UXP) qui enregistre chaque
   action Photoshop pendant une session de retouche, détecte l'export/la
   sauvegarde comme signal de validation, et envoie la session au backend.
2. **Apprentissage** (`backend/src/services/parser.js`, `learner.js`) — le
   backend nettoie les événements bruts en réglages exploitables, puis
   construit des règles simples (moyenne des réglages par groupe de
   conditions d'image) à partir des sessions validées.
3. **Exécution progressive** (`plugin/js/apply.js` + mode dans le panneau) —
   Désactivé / Suggestion (le photographe valide) / Autonome (seulement si
   la permission est activée côté backend). Toujours en pilotant Photoshop
   via batchPlay, jamais un rendu maison.
4. **Boîte de réception centrale** (`backend/src/routes/feedback.js`) — bugs
   signalés à la main, plaintes, suggestions, et erreurs du plugin capturées
   automatiquement, tous envoyés au même endroit pour qu'on les traite.
5. **Vérification de version** (`backend/src/routes/version.js`) — le plugin
   compare sa version à la dernière publiée et prévient le photographe.

## État actuel : conçu et codé dans son ensemble, RIEN n'est testé en réel

Ce Mac n'a pas Photoshop installé, il n'y a pas de vrai photographe pilote
connecté pour l'instant, et il n'y a pas de projet Supabase déployé. Tout ce
qui suit est un premier jet complet, cohérent, syntaxiquement vérifié
(`node -c` sur tous les fichiers JS), mais **jamais exécuté en conditions
réelles**.

### `plugin/` (Photoshop UXP)

- `manifest.json` : déclaration du plugin (panneau, permissions réseau et
  fichiers). Schéma à confirmer au premier chargement réel via UXP
  Developer Tool.
- `index.html` / `css/style.css` : panneau avec identifiant photographe, URL
  du serveur, démarrer/arrêter l'enregistrement, sélecteur de mode, bouton
  de suggestion, zone de signalement de bug, bandeau de mise à jour.
- `js/main.js` : orchestration complète (enregistrement, envoi au backend,
  suggestion, mode autonome, signalement, vérification de version, capture
  automatique des erreurs du plugin).
- `js/api.js` : tous les appels réseau vers le backend.
- `js/apply.js` : applique réellement des réglages Photoshop (exposition,
  teinte/saturation, balance des couleurs) via batchPlay. **Les noms exacts
  des champs de descriptor sont ceux documentés par Adobe mais n'ont pas été
  vérifiés contre un vrai Photoshop** — la bonne pratique est d'enregistrer
  l'action manuellement avec le plugin ScriptListener d'Adobe et de comparer.

### `backend/` (Node.js/Express + Supabase)

- `src/server.js` : API avec les routes sessions, suggestions, permissions,
  photographers, feedback, version.
- `src/services/parser.js` : transforme les événements bruts en réglages
  propres. Hypothèse sur le format des descriptors Photoshop, à valider.
- `src/services/featureExtraction.js` : statistiques d'image de base
  (luminosité, dominante de couleur, contraste) via `sharp`. **La détection
  de visage/peau n'est PAS implémentée**, c'est un stub qui renvoie
  `faceDetected: false` — pièce manquante la plus importante avant de
  vraiment pouvoir associer un réglage à "ce visage, cette peau".
- `src/services/learner.js` : apprentissage simple par moyenne de groupe
  (pas de ML lourd), suffisant pour démarrer avec peu de données.
- `src/db/schema.sql` : schéma complet à exécuter dans Supabase avant de
  démarrer (photographers, permissions, photo_sessions, photo_edits,
  plugin_feedback, plugin_versions).
- `.env.example` : à copier en `.env` avec un vrai projet Supabase.

### Trou connu dans la chaîne (à combler ensuite)

Le plugin n'envoie pour l'instant que les événements Photoshop, pas un aperçu
de l'image elle-même. Donc `image_features` reste `NULL` en base, et
`/api/suggestions` répondra toujours "pas assez d'exemples" tant que ce
maillon n'est pas branché : il faut ajouter au plugin un export d'aperçu de
l'image (avant retouche) envoyé au backend, qui appellera alors
`featureExtraction.js` dessus.

## Comment démarrer une vraie phase de test

Le backend est préparé pour être déployé sur **Vercel** (`backend/vercel.json`
+ `backend/api/index.js`) et stocker dans **Supabase**, les deux outils déjà
utilisés pour ViralRemix, pour éviter de créer de nouveaux comptes/outils.

Étapes côté Joseph (nécessitent ses propres comptes, ne peuvent pas être
faites à sa place) :

1. Créer un nouveau projet Supabase (ou un nouveau schéma dans un projet
   existant), exécuter `backend/src/db/schema.sql` dans l'éditeur SQL.
2. Créer un nouveau projet Vercel pointant sur `backend/` (racine du projet =
   `backend/`), renseigner les variables d'environnement `SUPABASE_URL` et
   `SUPABASE_SERVICE_ROLE_KEY` dans les réglages Vercel (voir `.env.example`).
   Déployer. Noter l'URL obtenue (ex. `https://photo-assistant-xxx.vercel.app`).
3. Ouvrir `plugin/index.html`, remplacer `URL_BACKEND_A_REMPLACER` (valeur par
   défaut du champ "Serveur") par cette vraie URL, pour que le photographe
   n'ait rien à configurer lui-même.
4. Compresser le dossier `plugin/` en `.zip` et l'envoyer au photographe
   (WhatsApp, Telegram, email... aucune contrainte, ce sont juste des
   fichiers texte, pas un exécutable).

Étapes côté photographe :

1. Installer Adobe Creative Cloud Desktop si pas déjà fait, puis dedans
   installer "UXP Developer Tool" (gratuit, dans la liste des apps Adobe).
2. Dézipper le dossier `plugin/` reçu quelque part sur son ordinateur (ne
   plus le déplacer après, sinon il faut recharger le plugin).
3. Ouvrir Photoshop, ouvrir UXP Developer Tool, "Add Plugin" → sélectionner
   `manifest.json` dans le dossier dézippé, puis "Load".
4. Le panneau "Photo Assistant" apparaît dans Photoshop (Fenêtre > Extensions
   ou Plugins selon la version). Il renseigne juste son prénom dans le champ
   "Photographe", l'URL est déjà pré-remplie.
5. Démarrer l'enregistrement avant une retouche, l'arrêter une fois la photo
   exportée. Répéter sur plusieurs photos.

**Premiers tests réels** : corriger ce qui casse (il y aura sûrement des
corrections, ce premier jet n'a jamais tourné dans un vrai Photoshop). Les
bugs remontent automatiquement ou via le bouton "Signaler un problème" dans
la table `plugin_feedback` de Supabase.

Une fois la capture fiable : brancher l'export d'aperçu image → feature
extraction, pour que les suggestions deviennent réellement possibles (voir
"Trou connu dans la chaîne" ci-dessus).

## Reste à faire (au-delà du test initial)

- Confirmer avec le photographe pilote s'il travaille sur Photoshop,
  Lightroom, ou les deux (Lightroom = SDK différent, en Lua).
- Détection de visage/peau réelle (service de vision à choisir).
- Export d'aperçu image côté plugin, branché sur `featureExtraction.js`.
- Table `learned_rules` pré-calculée si le volume de données grossit (pour
  ne pas recalculer les règles à chaque appel de `/api/suggestions`).
- Interface simple pour consulter `plugin_feedback` (pour l'instant
  consultable via l'API ou directement dans Supabase).
- Publication sur la marketplace Adobe une fois stabilisé, pour un vrai
  déploiement automatique des mises à jour.
