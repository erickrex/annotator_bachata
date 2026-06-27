# Offline seed dataset (Task 6.1)

IP-clean clip + timeline metadata for the two demo domains, consumed by the
offline seed pipeline (Task 6.2, `scripts/seed.ts`). **No embeddings and no
database writes happen here** — this directory is pure JSON.

## Files

| File                       | Contents                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| `projects.json`            | Manifest: the two projects + which preset/timeline mode each uses.    |
| `clips.bachata.json`       | Bachata project: media assets + clips with **beat-grid** metadata.    |
| `clips.sign_language.json` | Sign-language project: media assets + clips with **gloss-segment** metadata. |

Type definitions for these shapes live in [`lib/seed/types.ts`](../lib/seed/types.ts).

The dataset is generated deterministically by
[`scripts/generate-seed.mjs`](../scripts/generate-seed.mjs):

```bash
# from the adaptive-label/ app directory
node scripts/generate-seed.mjs
```

Re-running produces byte-identical output.

## Writing the seed to Aurora (Task 6.2)

Once the table migrations (`db/000`–`003`) are applied and the environment is
configured (`DATABASE_URL`, `OPENAI_API_KEY`, `AI_EMBEDDING_MODEL`,
`AI_EMBEDDING_DIMENSIONS`), run the seed pipeline from the `adaptive-label/` app
directory:

```bash
npm run seed   # tsx scripts/seed.ts
```

The script (`scripts/seed.ts`) builds each clip's `search_text`
(`lib/seed/search-text.ts`), computes embeddings **once** with the AI SDK's
`embedMany` (the only place embeddings are generated — Requirement 5.5), checks
every vector against `AI_EMBEDDING_DIMENSIONS` before insert (Property 5 /
Requirement 5.6), inserts the projects, an activated `label_schemas` version +
`label_fields` (from `PRESETS`), `media_assets`, `clips` (with embeddings), and
`labeling_tasks`, then builds the HNSW index (`db/010_clips_embedding_index.sql`).

## How it maps to the data model

- Each manifest project → a `projects` row; its `presetKey` selects the
  activated `label_schemas` + `label_fields` from `PRESETS`
  (`lib/schemas/workspace.ts`).
- Each `mediaAssets[]` entry → a `media_assets` row.
- Each `clips[]` entry → a `clips` row. Its `metadata` becomes `metadata_json`
  (the seeded beat grid or gloss segments). `searchAttributes` keys mirror the
  domain's PRESET field keys and are what the seed script concatenates into
  `search_text` before embedding.

## Provenance — IMPORTANT

### Bachata beat grids: hand-authored placeholders

The `metadata.beatGrid` of every bachata clip is a **hand-authored placeholder**
(`provenance: "hand-authored-placeholder"`). It matches the exact output
contract of the existing Python `beat_this` analyzer (`analyzer/analyze.py`):

```json
{
  "bpm": 120.0,
  "bpm_confidence": 1.0,
  "downbeat_offset_seconds": 0.2,
  "beat_timestamps": [0.2, 0.7, ...],
  "beat_frames": [6, 21, ...],
  "energy_profile": [0.36, 0.47, ...]
}
```

The grids were **not** produced by running the model, for two reasons:

1. **IP cleanliness (Requirement 8.5).** The only clips checked into
   `sources/clips/` are YouTube-derived and therefore *not* IP-clean. The demo
   must use original/licensed footage and music only.
2. **Environment.** The analyzer requires the `beat_this` model weights, `torch`,
   and a decoded WAV stream, which are not available in this build environment.

Notes on the placeholders:

- Each clip is treated as starting on a downbeat, so
  `downbeat_offset_seconds == beat_timestamps[0]` and the downbeat index is `0`
  (clean 8-count cycles for the bachata timeline math in
  `lib/domain/cycle-builder.ts`).
- `bpm_confidence` is `1.0` because a perfectly regular synthetic grid yields
  `1.0` under the analyzer's own confidence formula. Real audio yields `< 1.0`.
- `energy_profile` is a 64-sample downsampled envelope. The real analyzer emits
  a full-resolution RMS profile at `sr=22050 / hop=512` (~43 Hz). The timeline
  math does not use `energy_profile`, so the downsample is cosmetic.

### Regenerating bachata grids from real audio

On IP-clean demo clips with a licensed/original audio track:

```bash
# 1. extract a WAV from each demo clip (ffmpeg/ffprobe on PATH — do NOT install
#    via Homebrew; see AGENTS.md). Example:
ffmpeg -i demo-media/bachata/bachata_demo_001.mp4 -ac 1 -ar 22050 bachata_demo_001.wav

# 2. run the analyzer (Python only via uv) to get the beat grid JSON:
uv run python -m analyzer bachata_demo_001.wav --fps 30 > grid_001.json
```

Then replace each clip's `metadata.beatGrid` with the corresponding `grid_*.json`
and set `metadata.provenance` to `"analyzer"`.

### Sign-language gloss segments: hand-authored

There is no analyzer for sign language, so `metadata.glossSegments` and
`metadata.phrases` are hand-authored (`provenance: "hand-authored"`). They
describe original, IP-clean signed phrases (greeting, self-introduction,
farewell, a wh-question). Glosses are written linguistic labels — not media — and
each `sign_type`, `dominant_hand`, `two_handed`, `handshapes`,
`non_manual_markers`, and `clarity` value mirrors the sign-language PRESET fields.

## IP cleanliness (Requirement 8.5)

All `mediaAssets` reference **placeholder** original-recording paths under
`demo-media/…`; they carry `metadata.ipClean: true`. No copyrighted footage,
music, or third-party trademarks are referenced anywhere in this dataset. Record
or license original demo media before the public demo.
