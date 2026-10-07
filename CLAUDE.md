# Photo Assistant — contexte du projet

## Le produit

Assistant IA qui apprend la façon dont un photographe retouche ses photos (teint,
grain, cadre, lumière, couleur, température) en observant son travail réel dans
son logiciel habituel, puis qui peut, une fois autorisé, reproduire ces réglages
lui-même dans ce même logiciel. Ce n'est pas un éditeur de photos concurrent : on
pilote l'outil que le photographe utilise déjà.

Produit à vendre (pas un projet perso). Deux photographes contactés par
Joseph, **les deux utilisent Lightroom** (23/09/2026) — d'où l'existence de
`lightroom-plugin/` en plus de `plugin/` (Photoshop). Troisième brique
ajoutée le 07/10/2026, `camera-raw-watcher/` : un photographe en test ouvre
ses RAW directement dans Photoshop via Camera Raw (pas Lightroom), et ses
vrais réglages (exposition, contraste, balance des blancs...) sont gravés
dans les pixels une fois "Ouvrir" cliqué — invisibles pour le plugin
Photoshop, qui n'observe que les calques de réglage. Toutes les briques
envoient vers le même backend.

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

1. **Capture** (`plugin/`) — plugin Photoshop (UXP) qui enregistre en
   permanence et automatiquement dès son chargement (aucun clic requis). Un
   bouton "Pause" optionnel existe pour les cas où le photographe ne veut
   pas être enregistré (test, retouche non représentative), mais n'est
   jamais nécessaire pour l'usage normal — décision prise après que Joseph
   a signalé que demander un clic par photo serait trop fastidieux pour un
   photographe qui en traite des centaines par événement.

   **Suivi par photo, pas par session globale** : un photographe ouvre
   souvent tout un lot de photos d'un coup, leur applique un réglage de
   base commun (preset), puis affine chaque photo individuellement, avant
   d'exporter éventuellement tout le lot en une seule fois. Le plugin
   maintient donc un buffer d'événements PAR DOCUMENT Photoshop (`Map` par
   id de document, pas un seul tas global), avec un `batchId` commun aux
   photos ouvertes à moins de 5 secondes d'écart. Chaque document est
   envoyé au backend individuellement dès que SON export/sauvegarde/
   fermeture est détecté(e), avec ce `batchId` attaché — ce qui permettra
   plus tard (pas encore fait, voir "Reste à faire") de distinguer dans
   `learner.js` le réglage de base partagé par tout le lot des retouches
   propres à chaque photo. Un filet de sécurité (`setInterval`, toutes les
   minutes) envoie aussi une photo restée inactive plus de 3 minutes, au
   cas où un export groupé en un clic ne déclenche pas un événement par
   photo comme on le suppose — **hypothèse non vérifiée, à confirmer en
   premier avec un vrai Photoshop**, voir "Reste à faire".
1bis. **Capture Lightroom** (`lightroom-plugin/PhotoAssistant.lrplugin/`) —
   plugin Lightroom Classic (SDK Lua), déclaré comme "Export Filter"
   (`LrExportFilterProvider`). Contrairement à Photoshop, pas besoin de
   suivre un flux d'événements : à chaque export, on récupère directement
   `photo:getDevelopSettings()`, l'état final complet des réglages de la
   photo, pour chaque photo exportée. Un seul appel Lightroom fournit déjà
   tout le lot exporté ensemble, donc le regroupement par `batchId` est
   fiable nativement ici (pas l'heuristique à 5 secondes utilisée côté
   Photoshop). **Un seul zip sert pour tous les photographes** (comme le
   plugin Photoshop) : l'identifiant du photographe n'est plus en dur dans
   le code, il est saisi une fois par chacun dans Fichier > Plug-in Manager
   > "Photo Assistant" (écran ajouté par `PhotoAssistantInfoProvider.lua`,
   déclaré via `LrPluginInfoProvider` dans `Info.lua`, stocké dans les
   préférences du plugin avec `LrPrefs`). Installation ensuite en une fois :
   le photographe ajoute le filtre à son préréglage d'export habituel
   (boîte de dialogue d'export, section Filtres) — ensuite ça tourne
   automatiquement à chaque export, aucun clic de plus.
   **Encore moins vérifié que le plugin Photoshop** : le SDK Lightroom Lua
   est une surface moins documentée dans mes connaissances, donc plus de
   risque d'erreur de nom de fonction/champ (`postProcessRenderedPhotos`,
   `LrTasks.pcall`, etc.) à corriger au premier vrai chargement.
1ter. **Surveillance Camera Raw** (`camera-raw-watcher/watch.js`) — pas un
   plugin, un script Node.js autonome (aucune dépendance externe, juste
   `fs`/`path`/`fetch` natifs) que le photographe lance à côté de
   Photoshop. Découvert nécessaire le 07/10/2026 : un photographe ouvre
   ses RAW directement dans Photoshop via Camera Raw (pas Lightroom), et
   une fois "Ouvrir" cliqué, ses réglages (exposition, contraste, balance
   des blancs...) sont gravés dans les pixels d'un calque simple — le
   plugin Photoshop (qui n'observe que les calques de réglage) ne voit
   rien. Camera Raw partage le même moteur RAW que Lightroom et écrit (si
   configuré ainsi, voir plus bas) les mêmes réglages en attributs XML
   `crs:NomDuReglage="valeur"` dans un fichier `.xmp` à côté de la photo.
   Le script scanne un dossier en boucle (toutes les 4s), détecte les
   fichiers `.xmp` nouveaux/modifiés, attend 2s qu'ils soient stables,
   extrait tous les attributs `crs:` génériquement par expression
   régulière, et envoie au même `/api/sessions` que les autres sources
   avec `source: "camera-raw"` (backend traite "lightroom" et
   "camera-raw" de façon identique, voir `DEVELOP_SETTINGS_SOURCES` dans
   `sessions.js`). Les photos modifiées à moins de 8s d'écart sont
   regroupées dans le même `batchId`.
   **Dépendance stricte à vérifier avec le photographe avant tout test** :
   Camera Raw doit être réglé sur "Enregistrer les réglages d'image dans
   > Fichiers .xmp annexes" (pas "Base de données Camera Raw") dans ses
   préférences — sinon aucun fichier `.xmp` n'est jamais écrit et le
   script ne voit rien passer. Voir `camera-raw-watcher/LISEZ-MOI.txt`.
   **Testé en local avant livraison** : extraction XMP validée avec des
   valeurs réelles observées chez le photographe (Exposition +0,90,
   Contraste +31, etc., capture d'écran du 07/10/2026), et flux complet
   bout en bout vérifié contre un serveur local puis contre le vrai
   backend Vercel déployé (un essai a d'abord échoué avec "events
   manquant ou vide" parce que le changement backend n'avait pas encore
   été poussé — corrigé, puis re-testé avec succès). **Jamais testé avec
   un vrai Camera Raw/XMP généré en conditions réelles** — seulement avec
   un fichier `.xmp` construit à la main à partir des valeurs vues sur la
   capture d'écran du photographe, pas un vrai fichier Camera Raw.
   **Friction connue, différente des plugins** : contrairement à
   Photoshop/Lightroom qui s'intègrent dans l'application, ce script
   nécessite Node.js installé sur la machine du photographe (pas toujours
   le cas) et doit être lancé manuellement avant chaque session de travail
   (double-clic sur `demarrer.bat`/`demarrer-mac.command`), avec un
   dossier à surveiller à reconfigurer à chaque nouveau shoot dans
   `config.json` — pas encore automatisé.
2. **Apprentissage** (`backend/src/services/parser.js`, `learner.js`) — le
   backend nettoie les données brutes des trois sources (événements
   Photoshop, réglages finaux Lightroom, ou réglages Camera Raw lus en XMP)
   en réglages exploitables dans le
   même format `[{ type, params }]`, puis construit des règles simples
   (moyenne des réglages par groupe de conditions d'image) à partir des
   sessions validées.
3. **Exécution progressive** (`plugin/js/apply.js` + mode dans le panneau) —
   Désactivé / Suggestion (le photographe valide) / Autonome (seulement si
   la permission est activée côté backend). Toujours en pilotant Photoshop
   via batchPlay, jamais un rendu maison. **Pour l'instant seulement côté
   Photoshop** — appliquer une suggestion dans Lightroom nécessiterait un
   mécanisme différent (pas encore construit), voir "Reste à faire".
4. **Boîte de réception centrale** (`backend/src/routes/feedback.js`) — bugs
   signalés à la main, plaintes, suggestions, et erreurs du plugin capturées
   automatiquement, tous envoyés au même endroit pour qu'on les traite.
5. **Vérification de version** (`backend/src/routes/version.js`) — le plugin
   compare sa version à la dernière publiée et prévient le photographe.
6. **Signal de connexion** (`backend/src/routes/checkin.js`, table
   `plugin_checkins`) — envoyé dès que le photographe renseigne son prénom
   (Photoshop : au chargement du panneau si déjà rempli, et à chaque
   modification du champ ; Lightroom : dès la saisie dans le Plug-in
   Manager), sans attendre un premier export réel. Permet de savoir qui
   s'est installé/connecté avant même le premier test complet — demande
   explicite de Joseph (23/09/2026).
7. **Page admin** (`backend/public/admin.html`, servie sur
   `https://photo-ai-assistant.vercel.app/admin.html`) — vue d'ensemble :
   connexions récentes, retouches reçues (avec lot/source/validée), boîte
   de réception (avec bouton "marquer résolu"), activation du mode
   autonome par photographe, publication d'une nouvelle version de plugin.
   Protégée par un code d'accès unique (variable d'environnement Vercel
   `ADMIN_TOKEN`, à définir — voir `.env.example`), saisi une fois dans le
   navigateur et gardé en `localStorage`. Ce n'est pas un vrai système de
   comptes, juste une protection simple adaptée à un seul admin (Joseph).
   Testé en local avec un serveur Node temporaire avant déploiement
   (page servie, 401 sans code, passe avec le bon code) — jamais testé sur
   le vrai déploiement Vercel au moment de l'écriture de cette note.

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
  du serveur (pré-remplie avec le backend déployé), statut d'enregistrement
  automatique + bouton pause optionnel, sélecteur de mode, bouton de
  suggestion, zone de signalement de bug, bandeau de mise à jour.
- `js/main.js` : orchestration complète (enregistrement automatique par
  document/lot, envoi au backend, suggestion, mode autonome, signalement,
  vérification de version, capture automatique des erreurs du plugin).
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

## Déploiement : FAIT le 23/09/2026

Backend déployé sur Vercel, connecté à un projet Supabase, les deux vérifiés
en direct (`/health` répond `{"ok":true}`, `/api/permissions/...` confirme
que Supabase répond bien). URL stable de production :
**`https://photo-ai-assistant.vercel.app`** (déjà pré-remplie dans
`plugin/index.html`, le photographe n'a rien à configurer).

Dépôt GitHub : `github.com/Gbjosephkw/photo-ai-assistant`, connecté à Vercel
(chaque push sur `main` redéploie automatiquement le dossier `backend/`).
Protection d'accès Vercel ("Vercel Authentication") désactivée pour ce
projet, sinon l'API n'était joignable que par Joseph connecté à son compte
Vercel — sans ça le plugin ne pouvait rien envoyer.

Étapes côté photographe pour installer le plugin :

1. Installer Adobe Creative Cloud Desktop si pas déjà fait, puis dedans
   installer "UXP Developer Tool" (gratuit, dans la liste des apps Adobe).
2. Dézipper le dossier `plugin/` reçu quelque part sur son ordinateur (ne
   plus le déplacer après, sinon il faut recharger le plugin).
3. Ouvrir Photoshop, ouvrir UXP Developer Tool, "Add Plugin" → sélectionner
   `manifest.json` dans le dossier dézippé, puis "Load".
4. Le panneau "Photo Assistant" apparaît dans Photoshop (Fenêtre > Extensions
   ou Plugins selon la version). Il renseigne juste son prénom dans le champ
   "Photographe" — l'enregistrement démarre tout seul, rien d'autre à faire.

**Premiers tests réels** : corriger ce qui casse (il y aura sûrement des
corrections, ce code n'a jamais tourné dans un vrai Photoshop). Les bugs
remontent automatiquement ou via le bouton "Signaler un problème" dans la
table `plugin_feedback` de Supabase.

### Installation du plugin Lightroom chez le photographe

1. Fichier > Plug-in Manager (Gestionnaire de modules externes) > "Ajouter"
   → sélectionner le dossier `PhotoAssistant.lrplugin`.
2. Toujours dans le Plug-in Manager, sélectionner "Photo Assistant" dans la
   liste à gauche → un écran de configuration apparaît → il renseigne son
   prénom (l'URL du serveur est déjà pré-remplie). Cette étape ne se fait
   qu'une seule fois.
3. Ouvrir la boîte de dialogue d'export habituelle (celle que le
   photographe utilise déjà pour exporter son travail), section "Filtres
   d'export" (Export Filters) en bas à gauche de la fenêtre → "Photo
   Assistant (apprentissage)" doit apparaître dans la liste des filtres
   disponibles, l'ajouter.
4. Sauvegarder ce préréglage d'export (s'il ne le fait pas déjà à chaque
   export). Une fois fait, **aucune autre action requise** : chaque futur
   export avec ce préréglage envoie automatiquement les photos exportées
   au backend.

## Reste à faire — par ordre de priorité pour le premier vrai test

1. **Charger réellement les deux plugins chez les deux photographes qui ont
   déjà confirmé utiliser Lightroom (23/09/2026)** et corriger ce qui casse
   — aucun des deux plugins n'a jamais tourné dans un vrai Photoshop ou
   Lightroom, le plugin Lightroom en particulier repose sur un SDK Lua
   moins bien connu, donc plus susceptible d'erreurs de nom de fonction/champ
   à corriger au premier chargement (`postProcessRenderedPhotos`,
   `LrTasks.pcall`, `photo:getDevelopSettings()`...).
2. **Vérifier si l'un des deux photographes utilise aussi Photoshop** en
   plus de Lightroom pour de la retouche plus fine (visage, peau) — auquel
   cas les deux plugins seraient utiles pour lui ; sinon le plugin Photoshop
   n'aura peut-être pas d'utilité pour ces deux premiers testeurs
   spécifiquement, mais reste utile pour d'éventuels futurs clients
   Photoshop-only.
3. **Vérifier comment un export groupé Photoshop se comporte réellement**
   (question résolue nativement côté Lightroom, voir ci-dessus) : notre
   capture par document suppose qu'exporter plusieurs photos d'un coup
   déclenche quand même un événement Photoshop par photo. Si un seul
   événement global est déclenché sans distinction par photo, il faudra
   adapter `plugin/js/main.js`. Le filet de sécurité par inactivité (3 min)
   limite les dégâts en attendant, mais ne remplace pas une vérification
   réelle.
4. Détection de visage/peau réelle (service de vision à choisir) — utile
   pour les deux sources.
5. Export d'aperçu image côté plugin Photoshop, branché sur
   `featureExtraction.js` (Lightroom fournit déjà les réglages complets
   sans avoir besoin d'un aperçu pixel séparé pour ça).
6. Exploiter `batch_id` dans `learner.js` : séparer, au sein d'un même lot,
   les réglages identiques sur toutes les photos (= le preset de base) des
   réglages propres à chaque photo (= la retouche individuelle du
   photographe) — c'est cette seconde partie qui est la plus intéressante à
   apprendre, et c'est maintenant fiable côté Lightroom (regroupement natif
   par export) même si encore approximatif côté Photoshop (heuristique 5s).
7. Mode suggestion/autonome pour Lightroom (pas encore construit, seul
   `plugin/js/apply.js` côté Photoshop existe pour l'instant).
8. Table `learned_rules` pré-calculée si le volume de données grossit (pour
   ne pas recalculer les règles à chaque appel de `/api/suggestions`).
9. Interface simple pour consulter `plugin_feedback` (pour l'instant
   consultable via l'API ou directement dans Supabase).
10. Publication sur la marketplace Adobe une fois stabilisé, pour un vrai
    déploiement automatique des mises à jour.
