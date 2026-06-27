-- AdaptiveLabel — review / audit / export tables (Task 3)
--
-- Run AFTER db/002_workflow_tables.sql. Creates the Tier 2 review + audit seams
-- and the exports ledger. `exports` is used by the Tier 1 JSONL export
-- (Requirement 6.4); `annotation_reviews` and `audit_events` back the Tier 2
-- review workflow (Requirements 9.2/9.3) and are created now so later tasks add
-- no schema rework.
--
-- Idempotent: re-applying is safe.

-- Annotation reviews: a reviewer decision on a submitted annotation (Tier 2).
create table if not exists annotation_reviews (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references annotations(id),
  decision text not null,                    -- approved|changes_requested|rejected
  notes text,
  created_at timestamptz not null default now()
);

-- Audit events: an append-only trail of actor/action over an entity (Tier 2).
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  actor text,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

-- Exports: a record of every export request and its produced artifact (Req 6.4).
create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  format text not null,                      -- jsonl|csv|project_json
  status text not null default 'succeeded',
  storage_key text,
  filters_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
