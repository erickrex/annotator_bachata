-- AdaptiveLabel — core tables (Task 3)
--
-- Run AFTER db/000_extensions.sql (needs the `vector` extension and
-- gen_random_uuid() from pgcrypto). Creates the schema/config + media/clip
-- core of the data model (design.md → "Data Models").
--
-- Implements Requirements 7.2 (Aurora as primary backend), 5.1 (vector column
-- on clips), and 1.7 (immutable schema versions via unique(project_id, version)).
--
-- Idempotent: every object uses `if not exists` so the file can be re-applied.

-- Projects: one row per labeling workspace (e.g. bachata, sign language).
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Label schemas: immutable, versioned configuration for a project. Editing a
-- schema always inserts a new (project_id, version); existing versions are
-- never mutated (Requirement 1.7).
create table if not exists label_schemas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  version integer not null,
  name text not null,
  timeline_mode text not null,
  status text not null default 'active',     -- draft|active|retired
  generation_prompt text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (project_id, version)               -- versions are immutable
);

-- Label fields: the field definitions belonging to a schema version.
create table if not exists label_fields (
  id uuid primary key default gen_random_uuid(),
  schema_id uuid not null references label_schemas(id),
  key text not null,
  label text not null,
  help text,
  field_type text not null,
  required boolean not null default false,
  options_json jsonb not null default '[]',
  min numeric,
  max numeric,
  field_group text,
  order_index integer not null default 0,
  unique (schema_id, key)
);

-- Media assets: the underlying source media a clip is cut from.
create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  filename text not null,
  storage_key text not null,
  duration_seconds numeric,
  fps numeric,
  width integer,
  height integer,
  metadata_json jsonb not null default '{}'
);

-- Clips: the labelable units. `metadata_json` holds the seeded beat grid or
-- gloss segments; `search_text` is the offline-built text representation used
-- to compute `embedding` (vector(1536)) for pgvector similarity (Req 5.1/5.2).
create table if not exists clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  media_asset_id uuid references media_assets(id),
  clip_index integer not null,
  title text,
  domain text not null,
  start_frame integer,
  end_frame integer,
  start_seconds numeric,
  end_seconds numeric,
  metadata_json jsonb not null default '{}', -- seeded beat grid or gloss segments
  search_text text,
  embedding vector(1536)
);
