-- AdaptiveLabel — runtime media processing
--
-- Adds upload / YouTube import state, audio analysis output, processing jobs,
-- and rendered/extracted derived assets. These objects support the self-hosted
-- runtime media pipeline (ffprobe, ffmpeg, uv/Python analyzer, Remotion).

alter table media_assets
  add column if not exists status text not null default 'uploaded',
  add column if not exists source_type text not null default 'upload',
  add column if not exists original_url text,
  add column if not exists local_video_path text,
  add column if not exists local_audio_path text,
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists audio_analysis (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  detected_bpm numeric not null,
  bpm_confidence numeric not null,
  downbeat_offset_seconds numeric not null,
  beat_grid_json jsonb not null default '[]',
  beat_grid_frames_json jsonb not null default '[]',
  energy_profile_json jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_asset_id)
);

create table if not exists media_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  type text not null,
  status text not null default 'queued',
  progress numeric not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists derived_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  media_asset_id uuid references media_assets(id) on delete cascade,
  clip_id uuid references clips(id) on delete cascade,
  asset_type text not null,
  storage_key text,
  local_path text,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists media_assets_project_status_idx
  on media_assets (project_id, status);

create index if not exists media_jobs_media_created_idx
  on media_jobs (media_asset_id, created_at desc);

create index if not exists derived_assets_clip_type_idx
  on derived_assets (clip_id, asset_type);
