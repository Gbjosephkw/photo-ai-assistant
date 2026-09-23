-- Photo Assistant — schéma Supabase/Postgres
-- À exécuter dans l'éditeur SQL du projet Supabase avant de démarrer le backend.

create extension if not exists "pgcrypto";

-- Informationnel seulement : le reste des tables identifie un photographe
-- par un simple identifiant texte (envoyé par le plugin), pas par une
-- clé étrangère stricte, pour rester simple tant qu'il n'y a qu'un seul
-- photographe pilote.
create table if not exists photographers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  created_at timestamptz default now()
);

create table if not exists permissions (
  photographer_id text primary key,
  autonomous_enabled boolean not null default false,
  updated_at timestamptz default now()
);

create table if not exists photo_sessions (
  id uuid primary key default gen_random_uuid(),
  photographer_id text not null,
  document_name text,
  -- Regroupe les photos ouvertes en même temps (même lot), pour distinguer
  -- plus tard le réglage de base commun au lot des retouches individuelles.
  batch_id text,
  -- 'photoshop' ou 'lightroom' : les deux plugins envoient un format
  -- différent (journal d'événements vs réglages finaux), utile pour filtrer.
  source text default 'photoshop',
  captured_at timestamptz,
  raw_events jsonb,
  status text default 'raw',
  created_at timestamptz default now()
);

create table if not exists photo_edits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references photo_sessions(id),
  photographer_id text not null,
  batch_id text,
  source text default 'photoshop',
  -- Caractéristiques de l'image (luminosité, teinte, visage/peau...).
  -- Reste NULL tant que le plugin n'envoie pas d'aperçu image au backend
  -- (voir CLAUDE.md, "reste à faire").
  image_features jsonb,
  -- Liste de réglages nettoyés : [{ "type": "exposure", "params": {...} }, ...]
  adjustments jsonb,
  -- true si un export/sauvegarde a été détecté dans la session d'origine
  -- (le photographe a validé le résultat).
  validated boolean default false,
  created_at timestamptz default now()
);

-- ALTER en plus des CREATE ci-dessus : permet de re-coller/exécuter tout ce
-- fichier sans erreur même si les tables existaient déjà avant l'ajout de
-- batch_id (CREATE TABLE IF NOT EXISTS ne modifie pas une table existante).
alter table photo_sessions add column if not exists batch_id text;
alter table photo_edits add column if not exists batch_id text;
alter table photo_sessions add column if not exists source text default 'photoshop';
alter table photo_edits add column if not exists source text default 'photoshop';

create index if not exists idx_photo_edits_photographer on photo_edits(photographer_id);
create index if not exists idx_photo_sessions_photographer on photo_sessions(photographer_id);
create index if not exists idx_photo_edits_batch on photo_edits(batch_id);

-- Boîte de réception centrale : tout ce qui remonte des plugins installés
-- chez les photographes testeurs (bug signalé, plainte, suggestion, ou
-- erreur capturée automatiquement par le plugin lui-même).
create table if not exists plugin_feedback (
  id uuid primary key default gen_random_uuid(),
  photographer_id text,
  type text not null check (type in ('bug', 'complaint', 'suggestion', 'error')),
  message text,
  context jsonb,
  plugin_version text,
  resolved boolean default false,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_plugin_feedback_resolved on plugin_feedback(resolved);

-- Historique des versions publiées du plugin, pour que chaque plugin
-- installé puisse se comparer à la dernière version connue et prévenir
-- le photographe qu'une mise à jour existe.
create table if not exists plugin_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  release_notes text,
  released_at timestamptz default now()
);
