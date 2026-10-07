# Bachata Clip Slicer Annotator

Astro + React application for turning a YouTube bachata video into reviewable dance clips.

The app downloads a source video, extracts audio, runs a Python `beat_this` analyzer to detect BPM and beat locations, builds bachata cycle boundaries, generates virtual clips, and lets you review, annotate, adjust, merge, split, and export those clips.

## What It Does

- Ingests a YouTube URL and downloads the source video and WAV audio.
- Streams download progress in the UI.
- Runs beat, BPM, downbeat, and energy analysis through a Python CLI.
- Builds 8-, 16-, and 32-count cycle groupings from the detected beat grid.
- Generates virtual clips from those cycle boundaries.
- Provides a review UI with clip navigation, preview, discard, merge, split, and boundary updates.
- Captures rich annotation data based on the project schema.
- Auto-saves working state to disk and supports project import/export.
- Exports single clips or batches to MP4 with ffmpeg and writes annotation JSON sidecars.

## Stack

- Frontend and server: Astro 5, React 19, TypeScript
- Rendering/export: ffmpeg
- Python analysis: Python 3.11+, `beat_this`, `torch`, `torchaudio`, `numpy`, `scipy`, `soundfile`
- Tests: Vitest, `fast-check`, pytest
- External binaries: `uv`, `ffprobe`, `ffmpeg` (YouTube downloads use `uv run yt-dlp` from `pyproject.toml`)

## Architecture Overview

The project has two runtime pieces:

1. A Node/Astro server app that handles the UI, API routes, persistence, clip generation, and export.
2. A Python package in `analyzer/` that analyzes WAV audio and prints JSON to stdout.

High-level flow:

1. Open `/` and submit a YouTube URL.
2. `POST /api/ingest` downloads the video via `uv run yt-dlp`, extracts WAV audio, and reads metadata with `ffprobe`.
3. `POST /api/analyze/:sourceId` runs `uv run python -m analyzer.analyze`.
4. `POST /api/clips/generate` creates virtual clips from detected cycle boundaries.
5. Open `/review` to preview clips, annotate them, and manage export.

## Main Pages

- `/`: ingestion page for adding a YouTube video
- `/review`: review and annotation workspace

## Key Features

### Ingestion

- Accepts YouTube URLs
- Downloads best available MP4 up to 1080p
- Extracts a WAV track for analysis
- Captures title, channel, upload date, duration, fps, dimensions, and total frame count

### Audio Analysis

The Python analyzer returns:

- `bpm`
- `bpm_confidence`
- `downbeat_offset_seconds`
- `beat_timestamps`
- `beat_frames`
- `energy_profile`

Those results are then stored on the source record and used to build cycle hierarchies for clip generation.

### Review and Annotation

The review screen combines:

- clip list/grid browsing
- HTML video playback with optional beat and energy overlays
- clip selection and navigation
- discard, split, and merge actions
- annotation form sections for identity, phrasing, trim, motion, camera, and quality

### Persistence

The app persists its working state in the current project directory:

- `project.json`: project data plus saved runtime state
- `manifest.json`: project summary
- `sources/`: downloaded MP4 and WAV files
- `exports/`: rendered MP4 clip exports

The server uses the repo root as its project directory, so run the app from this repository root if you want data written here consistently.

## Repository Layout

```text
.
├── analyzer/                # Python audio analyzer package and pytest suite
├── src/
│   ├── components/          # Review UI and annotation form components
│   ├── layouts/             # Astro layout shell
│   ├── pages/               # Astro pages and API routes
│   ├── services/            # Ingestion, analysis, state, validation, export
│   ├── tests/               # Property and integration tests
│   └── types/               # Project schema and enums
├── package.json             # Node app scripts and dependencies
├── pyproject.toml           # Python analyzer package metadata
├── uv.lock                  # Python lockfile
└── astro.config.mjs         # Astro server adapter config
```

## Prerequisites

Install the following before running the app:

- Node.js LTS with `npm`
- Python 3.11 or newer
- `uv` (runs the Python analyzer and `yt-dlp` from this repo’s `pyproject.toml`)
- `ffmpeg` and `ffprobe`

Install **`uv`** using the [official uv installation instructions](https://docs.astral.sh/uv/getting-started/installation/). Install **`ffmpeg`** (which includes **`ffprobe`**) using a method your environment allows—see [ffmpeg.org](https://ffmpeg.org/download.html).

After cloning, run **`uv sync`** so `yt-dlp` and the analyzer dependencies are available to `uv run`.

## Getting Started

### 1. Install JavaScript dependencies

```bash
npm install
```

### 2. Install Python dependencies

```bash
uv sync
```

Python dependencies are defined in **`pyproject.toml`** and locked in **`uv.lock`**; use **`uv`** only (see **`AGENTS.md`**).

### 3. Start the app

```bash
npm run dev
```

Then open the local Astro URL shown in the terminal.

## Typical Workflow

1. Start the dev server with `npm run dev`.
2. Open `/`.
3. Paste a YouTube URL and wait for download and analysis to complete.
4. Let the app generate 16-beat clips.
5. Open `/review`.
6. Select clips, preview them, and fill in annotations.
7. Adjust boundaries or use merge/split when needed.
8. Export individual clips or export a batch.

## Scripts

### Node

```bash
npm run dev
npm run build
npm run preview
npm run test
npm run test:watch
```

### Python

Run the analyzer directly:

```bash
uv run python -m analyzer.analyze path/to/file.wav --fps 30
```

Run Python tests:

```bash
uv run pytest
```

## Testing

### Fast local test run

```bash
npm run test
uv run pytest
```

### Optional integration tests

Integration tests verify that subprocess-based dependencies are wired correctly for:

- `uv run yt-dlp` (after `uv sync`)
- `uv` + Python analyzer

Run them only when `uv` and `ffmpeg` are installed and Python deps are synced (`uv sync`):

```bash
INTEGRATION=1 npx vitest run src/tests/integration/
```

## API Summary

### Ingestion and analysis

- `POST /api/ingest`: download source media and stream progress events
- `POST /api/analyze/:sourceId`: analyze WAV audio and build cycle hierarchy

### Clip operations

- `GET /api/clips`: list clips, annotations, and sources
- `POST /api/clips/generate`: generate clips from cycle groupings
- `GET /api/clips/:id`: fetch a single clip
- `PUT /api/clips/:id/annotation`: update annotation fields
- `PUT /api/clips/:id/status`: update clip status
- `PUT /api/clips/:id/trim`: update clip in/out points
- `POST /api/clips/:id/split`: split a clip
- `POST /api/clips/merge`: merge two clips

### Project operations

- `GET /api/project`: current manifest
- `POST /api/project/export`: export schema project JSON
- `POST /api/project/import`: import a project JSON file

### Export operations

- `POST /api/export/:id`: render one clip to MP4
- `POST /api/export/batch`: render all non-discarded clips

## Data Model

The canonical schema is defined in `src/types/index.ts`.

Important entities:

- `AnnotationProjectFile`: top-level project structure
- `SourceRecord`: source media metadata plus analysis outputs
- `ClipAnnotation`: full annotation record for one clip
- `VirtualClipDef`: generated clip definition used for preview/export
- `CycleHierarchy`: 8-, 16-, and 32-count cycle groupings
- `ProjectManifest`: project summary written to `manifest.json`

## Important Directories and Files

- `src/pages/index.astro`: ingestion page
- `src/pages/review.astro`: review page entry
- `src/components/ReviewApp.tsx`: main review UI
- `src/services/ingestion-service.ts`: `uv run yt-dlp` and `ffprobe` integration
- `src/services/audio-analysis-service.ts`: Node-to-Python bridge
- `src/services/export-service.ts`: ffmpeg export and annotation sidecars
- `src/services/project-service.ts`: `project.json` and `manifest.json` persistence
- `analyzer/analyze.py`: Python beat/BPM analysis CLI

## Notes on Persistence

- The app auto-saves after state changes.
- `project.json` stores annotations and persisted runtime state used to restore the session.
- `manifest.json` stores a summary view of the project.
- Exported MP4s are written to `exports/`.
- Downloaded source assets are written to `sources/`.

## Troubleshooting

### YouTube download failed to start (`uv` / `yt-dlp`)

Ingestion runs `uv run yt-dlp` from the repo root so `pyproject.toml` / `uv.lock` resolve. Install `uv` on your `PATH`, run `uv sync` in the project directory, and ensure the dev server’s working directory is the repo (or set `PROJECT_DIR` to it). A separately installed system `yt-dlp` binary is not required.

### `ffprobe` failed to start

Install `ffmpeg`, which provides both `ffmpeg` and `ffprobe`.

### Audio analysis failed to start

Make sure `uv` is installed and that Python dependencies have been synced with `uv sync`.

### Export failed

Make sure `ffmpeg` is available and the clip's extracted MP4 exists.

## Current Status

This repository already includes:

- a working Astro server app
- a Python analyzer package
- unit tests for core services
- property-based tests for schema and clip invariants
- optional integration tests for subprocess wiring

If you are extending the project, the best starting points are `src/components/ReviewApp.tsx`, `src/services/`, and `src/types/index.ts`.
