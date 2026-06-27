-- AdaptiveLabel — workflow tables (Task 3)
--
-- Run AFTER db/001_core_tables.sql. Creates the annotation workflow core:
-- labeling tasks (queue items) and the annotations captured against them.
--
-- Implements Requirements 4.4/4.5 (annotations persisted with source, schema
-- version, status, and field-keyed values) and 7.2.
--
-- Idempotent: re-applying is safe.

-- Labeling tasks: a clip queued for labeling under a specific schema version.
create table if not exists labeling_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  clip_id uuid not null references clips(id),
  schema_id uuid not null references label_schemas(id),
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

-- Annotations: the captured label values for a task. `source` distinguishes
-- human submissions from AI drafts (Tier 2). `values_json` is keyed by the
-- field `key`s of the referenced schema version (Requirement 4.5).
create table if not exists annotations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references labeling_tasks(id),
  schema_id uuid not null references label_schemas(id),
  source text not null default 'human',      -- human|ai_draft
  status text not null default 'submitted',  -- draft|submitted|approved|rejected
  values_json jsonb not null default '{}',
  confidence_json jsonb,
  validation_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
