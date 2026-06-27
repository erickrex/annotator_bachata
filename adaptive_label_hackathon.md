# AdaptiveLabel — Hackathon Implementation Plan (Revised)

Last updated: June 24, 2026

Revision note: This plan was rewritten to focus the demo on two contrasting
movement domains — **bachata dance** and **sign language** — to compress scope
to a realistic build window, and to make the Vercel v0 / AI SDK generative-UI
story the technical centerpiece. The earlier three-domain version (dance +
physical therapy + warehouse safety) is preserved only as a roadmap talking
point, not as build scope. It also adds **pgvector semantic retrieval** as a
deliberate, Aurora-specific capability, and reorganizes the build into a tiered
scope (core spine / should-have / cut) so the must-ship slice is unambiguous.

## 1. Executive Summary

AdaptiveLabel is a B2B platform that generates a task-specific video labeling
workspace from a plain-English dataset description. Instead of forcing every
team into one generic labeling UI, the product reads what kind of movement a
team needs to label, generates a domain schema, renders the right controls and
timeline, validates annotations, routes work through review, and exports a
production-ready dataset.

Hackathon framing:

> AdaptiveLabel: AI-generated, schema-driven labeling workspaces for teams
> building human-movement video datasets.

The wedge is **adaptive movement labeling**. Generic tools (Label Studio, CVAT)
are weak at time- and rhythm-aware labeling. AdaptiveLabel treats a video as a
temporal grid of meaningful movement units and adapts that timeline per domain:

- **Bachata** needs a musical beat grid, 8/16/32-count phrase boundaries,
  entry/exit state, movement labels, and stitchability.
- **Sign language** needs sign (gloss) boundaries, phrase/sentence grouping,
  handshape and non-manual markers, and linguistic review.

One database-backed engine generates and operates both workspaces. Showing two
domains that look completely different on screen — but run on the same Aurora
schema and the same deterministic renderer — is the demo's AHA moment.

Aurora does more than store rows. **pgvector** powers semantic retrieval ("find
clips like this one") across the labeled dataset, including across domains. This
makes the database an active part of the product rather than a passive store, and
exercises an Aurora-specific capability that scores directly on Technical
Implementation.

The core technical principle, enforced everywhere:

> **AI generation produces config / structured objects (validated against a Zod
> schema) that feed trusted, hand-built components. We never generate or execute
> UI code at runtime.**

## 2. Verified Hackathon Facts

Source: https://h01.devpost.com/ and https://h01.devpost.com/rules

- **Event:** H0 — Hack the Zero Stack with Vercel v0 and AWS Databases.
- **Submission deadline:** June 29, 2026, 5:00 pm Pacific Time. (~5 days from
  this revision.)
- **Judging:** June 30 – July 24, 2026. Winners on or around July 31, 2026.
- **Stack requirement (all tracks):** full-stack app using one of three AWS
  databases — **Aurora, Aurora DSQL, or DynamoDB** — as the primary backend,
  with the frontend deployed on **Vercel or v0.app**.
- **Credits:** $100 AWS + $30 v0 credits available; the AWS credit request form
  closes **June 26 at 12:00 pm PT**. Request now if you want them.
- **New & Existing rule:** prior work is allowed, but the AWS Database + Vercel
  integration must be added during the submission period, and you must explain
  what was significantly updated. A fresh Next.js app cleanly satisfies this.

### Tracks
- Track 1: Monetizable B2C
- Track 2: Monetizable B2B  ← **our primary**
- Track 3: Million-scale global
- Track 4: Open Innovation  ← **backup**

### Judging Criteria (equally weighted)
1. **Technical Implementation** — deliberate AWS database data model/schema/query
   design; Vercel deployment beyond basics; clean, purposeful architecture over
   surface-level generation.
2. **Design** — intuitive UX; frontend designed in relation to the backend;
   cohesive full-stack feel.
3. **Impact & Real-World Applicability** — meaningful problem, real audience,
   shippable.
4. **Originality** — creative concept and genuine insight about the stack.

Plus **up to +0.6 bonus** for published content (0.2 each) explaining how the
project was built with the AWS database + Vercel. Final scores range 1–5.6.

### Prizes
- Each track: 1st $10k / 2nd $5k / 3rd $3k (cash + matching AWS credits).
- Four cross-cutting "Best of" prizes ($2k each), open to all submissions:
  **Best Technical Implementation, Best Design, Most Impactful, Most Original.**
- Each project can win only one prize. Our most reachable shots: a B2B podium
  slot, or **Most Original / Most Impactful** via the dance + sign-language story.

## 3. Realistic Odds and Where to Spend Effort

A polished, deployed, working version has roughly a **15–25% shot at some
prize**, with the best odds on Most Original / Most Impactful. The domain choice
is a multiplier on execution, not a substitute for it. The decision order that
actually wins:

1. A working, deployed app on the submitted link (Stage One is pass/fail).
2. A tight sub-3-minute video where the adaptive reveal lands and Aurora is
   clearly the backbone.
3. A deliberate, visible Aurora data model.
4. Polished UI.
5. Domain choice (dance + sign language) and the +0.6 content bonus.

Protect items 1–3 above all. Sign language and dance are the emotional hook on
top of solid engineering, not the thing being graded first.

## 4. Winning Thesis and Pitch

The credible thesis is not "v0 generates forms." It is:

> v0 and the Vercel AI SDK accelerate generation of custom labeling workspaces,
> while Aurora PostgreSQL stores the durable schema, annotations, review
> workflow, audit history, and export state.

### Pitch framing (use this language)
- **Product:** AI-generated, schema-driven labeling workspaces for human-movement
  video datasets.
- **Buyer:** ML/data teams building movement-understanding AI, plus the labeling
  vendors who serve them. The demo domains are vivid instances, not the whole
  market.
- **Market:** video training data for human-movement AI — spanning accessibility
  (sign language), fitness, rehab, sports performance, and ergonomics. Dance and
  sign language are the demo; the platform is the product.
- **Why this stack:** v0/Vercel for fast, polished adaptive frontends; the AI SDK
  for structured generation; Aurora PostgreSQL as the relational source of truth
  for multi-domain workflow state.

### Honest guardrails for the pitch
- Frame sign language as an **annotation workspace for sign datasets**, not a
  translator or recognizer. Do not claim to capture full linguistic nuance
  (non-manual markers, simultaneity, grammar).
- Don't oversell either niche as a standalone market; the platform is the TAM.

## 5. Product Scope (Tiered — Build in This Order)

Scope is organized into three tiers. Ship the **Core spine** completely before
touching Should-have. Treat Nice-to-have as bonus only if the spine is deployed
and polished. When in doubt, cut — a small thing done flawlessly beats a broad
thing half-working.

### Tier 1 — Core spine (must ship; this is the demo)
1. Generative schema: plain-English description -> Zod-validated `WorkspaceSchema`
   -> persisted as an immutable version in Aurora.
2. Deterministic renderer: one renderer + the timeline modules that turn a schema
   into a working labeling studio.
3. Two domains from the same engine: **bachata** (beat grid) and **sign language**
   (gloss segments). This is the adaptivity AHA.
4. Annotation save/submit to Aurora.
5. **pgvector semantic retrieval:** "find similar clips" across the dataset
   (embeddings computed offline at seed time). This is the Aurora differentiator.
6. JSONL export of annotations.
7. Deployed and working on Vercel against Aurora.

### Tier 2 — Should-have (add only after the spine is deployed)
- Review/approve flow + audit events.
- AI pre-labeling (multimodal `Output.array` + confidence highlights).
- CSV + project-JSON export in addition to JSONL.

### Tier 3 — Nice-to-have (bonus)
- Dashboard metrics (counts, acceptance rate).
- A workspace copilot that edits the schema via tool calls.

### Explicitly cut from build scope
- Physical therapy, warehouse safety, and other domains (roadmap slide only).
- Multi-tenant orgs/roles, real-time collaboration, payments.
- Live media processing (ffmpeg/Remotion/Python) in the cloud.
- Runtime execution of AI-generated UI code.

### Demo Domains (exactly two)
1. **Bachata dance** — flagship. Beat-grid timeline, phrase counts, movement
   labels, entry/exit state. Reuses existing beat/cycle logic.
2. **Sign language** — contrast domain. Gloss-segment timeline, sign boundaries,
   handshape/non-manual fields. Proves the engine is not hardcoded.

Two domains is enough to prove adaptivity. Do not build a third.

## 6. The Generative-UI Approach (Technical Centerpiece)

Verified against current Vercel AI SDK docs (AI SDK 5/6 era). Structured
generation is standardized on the `Output` API passed to `generateText` /
`streamText`: `Output.object({ schema })`, `Output.array({ element })`, with
`partialOutputStream` / `elementStream` for streaming and `useObject` on the
client. (`generateObject` / `streamObject` still exist as older equivalents.)
Sources: Vercel "Generating Structured Data" and "useObject" docs. Pin exact
`ai` / `@ai-sdk/react` versions and re-confirm signatures on build day — the API
moves fast.

### Principle
Every AI call returns a **Zod-validated structured object**. That object is
persisted to Aurora and read by a **deterministic renderer** that maps a fixed
set of field types and timeline modes to trusted, hand-built components. The AI
chooses configuration; it never emits executable UI.

### The workspace config schema (the contract)

```ts
// lib/schemas/workspace.ts
import { z } from 'zod';

export const FieldType = z.enum([
  'text', 'textarea', 'select', 'multiselect', 'checkbox',
  'radio', 'slider', 'number', 'time_range', 'timeline_marker',
]);

export const LabelField = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  help: z.string().nullable(),
  type: FieldType,
  required: z.boolean().default(false),
  options: z.array(z.string()).nullable(),   // select/radio/multiselect
  min: z.number().nullable(),                // slider/number
  max: z.number().nullable(),
  group: z.string().nullable(),              // UI section
});

// The enum that drives the on-screen AHA: different timeline per domain.
export const TimelineMode = z.enum(['beat_grid', 'phase_rep', 'gloss_segments']);

export const WorkspaceSchema = z.object({
  domain: z.string(),
  workspaceName: z.string(),
  timelineMode: TimelineMode,
  fields: z.array(LabelField).min(3).max(24),
  workflowStages: z.array(z.string()),
});

export type WorkspaceSchema = z.infer<typeof WorkspaceSchema>;
```

### Schema generation: description -> validated config

```ts
// app/api/generate-schema/route.ts
import { generateText, Output } from 'ai';
import { WorkspaceSchema } from '@/lib/schemas/workspace';

export async function POST(req: Request) {
  const { description } = await req.json();
  const { output } = await generateText({
    model: 'openai/gpt-4.1',
    output: Output.object({ schema: WorkspaceSchema }),
    system:
      'You design video-labeling workspaces. Choose timelineMode: beat_grid for ' +
      'music/dance, phase_rep for reps/exercises, gloss_segments for sign ' +
      'language. Only use the allowed field types.',
    prompt: `Dataset description: ${description}`,
  });
  // output is schema-validated -> persist as an immutable schema version in Aurora.
  return Response.json(output);
}
```

### Streaming wizard ("watch the studio assemble itself")

```tsx
// app/wizard/page.tsx
'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { WorkspaceSchema } from '@/lib/schemas/workspace';

export default function Wizard() {
  const { object, submit } = useObject({
    api: '/api/generate-schema-stream', // streamText + Output.object
    schema: WorkspaceSchema,
  });
  return (
    <>
      <button onClick={() => submit({ description: 'Label ASL clips for gloss segmentation' })}>
        Generate workspace
      </button>
      {object?.fields?.map((f, i) => f && <FieldPreview key={i} field={f} />)}
    </>
  );
}
```

### AI pre-labeling: multimodal frames + schema -> values with confidence

(Tier 2 — add after the core spine ships.)

```ts
// app/api/pre-label/route.ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const FieldDraft = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
});

export async function POST(req: Request) {
  const { schema, frameUrls } = await req.json();
  const { output } = await generateText({
    model: 'openai/gpt-4.1',
    output: Output.array({ element: FieldDraft }),
    system: 'Return one entry per field key. Use low confidence when ambiguous.',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `Fields:\n${JSON.stringify(schema.fields)}` },
        ...frameUrls.map((url: string) => ({ type: 'image' as const, image: new URL(url) })),
      ],
    }],
  });
  // validate keys against schema.fields; store as annotation source='ai_draft'
  return Response.json(output);
}
```

### Deterministic renderer (the trust boundary)

```tsx
// components/FieldRenderer.tsx — a switch over trusted types, nothing executed.
switch (field.type) {
  case 'select':          return <SelectField .../>;
  case 'slider':          return <SliderField .../>;
  case 'timeline_marker': return <TimelineMarkerField .../>;
  // text, textarea, checkbox, radio, multiselect, number, time_range...
  default:                return <TextField .../>;
}

// Timeline module picks itself from the enum:
function TimelineForMode({ mode }) {
  if (mode === 'beat_grid')      return <BeatGridTimeline />;   // reuse cycle-builder data
  if (mode === 'phase_rep')      return <PhaseRepTimeline />;
  return <GlossSegmentTimeline />;                              // sign language
}
```

### Why this scores
- **Technical Implementation:** Zod-validated output -> immutable versioned schema
  rows in Aurora -> deterministic renderer. Deliberate, not surface-level.
- **Design / generative UI:** the streamed wizard visibly builds a workspace, and
  `timelineMode` yields a genuinely different studio per domain.
- **Safe:** AI output is config feeding a trusted component switch; nothing is
  executed at runtime.

## 6A. Semantic Retrieval with pgvector (Aurora Differentiator)

This is the one strategic addition borrowed from the DirectoryCMS analysis. It
closes AdaptiveLabel's only real weakness — under-using Aurora's headline
capabilities — for a small, contained amount of work. It is Tier 1 (core).

### What it does
Each labeled clip gets a text representation (domain + move/gloss + key field
values + summary). That text is embedded once and stored as a `vector` on the
clip. "Find similar clips" runs a cosine-distance query in Aurora, returning the
nearest movements across the whole dataset — including cross-domain matches,
which makes a memorable demo beat.

### Why it fits cleanly
- Embeddings are computed **offline at seed time** (and on annotation submit if
  time allows), never in the request path — so it stays fast and serverless-safe.
- It uses Aurora-native pgvector + a real similarity index, which is exactly the
  "deliberate query design" judges reward.
- It needs no new infrastructure beyond the `vector` extension.

### Schema additions

```sql
create extension if not exists vector;

alter table clips
  add column search_text text,
  add column embedding vector(1536);

-- Build the index after seeding enough rows.
create index clips_embedding_idx
  on clips using hnsw (embedding vector_cosine_ops);
```

### Embedding at seed time (AI SDK)

```ts
import { embedMany } from 'ai';

const { embeddings } = await embedMany({
  model: 'openai/text-embedding-3-small', // 1536 dims
  values: clips.map(c => c.searchText),
});
// UPDATE clips SET embedding = $1 WHERE id = $2  (per row)
```

### "Find similar clips" query

```sql
select id, title, domain, 1 - (embedding <=> $1) as similarity
from clips
where project_id = $2 or $3 = true        -- allow cross-domain search
order by embedding <=> $1                   -- cosine distance, HNSW-indexed
limit 8;
```

Confirm the exact embedding model id and dimension against your provider/gateway
on build day, and match the `vector(N)` dimension to the model.

## 7. Target Architecture

- **Vercel Next.js app:** landing, schema-generation wizard, labeling workspace,
  review queue, export center.
- **Aurora PostgreSQL:** source of truth for projects, schema versions, fields,
  media/clip metadata, tasks, annotations, reviews, audit events, exports. Uses
  **pgvector** for semantic clip retrieval.
- **Object storage (S3) or static assets:** demo clips, thumbnails, and
  pre-computed beat/segment data.
- **Vercel AI SDK:** schema generation (`Output.object`), streaming wizard
  (`useObject`), offline embeddings (`embedMany`), multimodal pre-labeling
  (`Output.array`, Tier 2).
- **No cloud worker / no ffmpeg / no Python at runtime.** All media-derived data
  and embeddings are pre-computed offline and seeded.

### Request flow
1. User describes a dataset in the wizard.
2. API route calls the AI SDK -> validated `WorkspaceSchema`.
3. Schema persisted as an immutable version (schema + fields) in Aurora.
4. Renderer reads the active schema and renders the workspace + timeline module.
5. Annotations save/submit to Aurora; reviewer approves/rejects; audit rows written.
6. Export job reads approved annotations and produces JSONL/CSV/JSON.

## 8. Data Model (Trimmed for MVP)

Keep the relational model deliberate — it is the Technical Implementation story.
Minimum tables for the spine:

- `projects` — id, name, domain, status, created_at.
- `label_schemas` — id, project_id, version, name, timeline_mode, status,
  generation_prompt, created_at, activated_at. (Versions are immutable.)
- `label_fields` — id, schema_id, key, label, help, field_type, required,
  options_json, min, max, group, order_index.
- `media_assets` — id, project_id, filename, storage_key, duration_seconds, fps,
  width, height, metadata_json.
- `clips` — id, project_id, media_asset_id, clip_index, start_frame, end_frame,
  start_seconds, end_seconds, metadata_json (beat grid or gloss markers seeded),
  search_text, embedding `vector(1536)` (pgvector; see Section 6A).
- `labeling_tasks` — id, project_id, clip_id, schema_id, status, created_at.
- `annotations` — id, task_id, schema_id, source (human|ai_draft), status,
  values_json, confidence_json, validation_json, created_at, updated_at.
- `annotation_reviews` — id, annotation_id, decision, notes, created_at.
- `audit_events` — id, project_id, actor, event_type, entity_type, entity_id,
  before_json, after_json, created_at.
- `exports` — id, project_id, format, status, storage_key, filters_json,
  created_at, completed_at.

Optional if time allows: `organizations`, `users`, roles. Not required for the
demo.

## 9. Domain Presets

### Bachata (timeline_mode = beat_grid) — flagship, reuses existing logic
UI: video player, beat markers, 8/16/32-count phrase display, clip boundaries,
entry/exit sections.

Fields: move_name, move_family, style, difficulty, energy_level, entry_position,
exit_position, rotation_direction, travel_direction, visibility_score,
stitchability, tags.

### Sign Language (timeline_mode = gloss_segments) — contrast domain
UI: video player, sign (gloss) segment markers, phrase/sentence grouping,
handshape and non-manual marker fields.

Fields: gloss, sign_type (lexical | fingerspelling | classifier | pointing),
dominant_hand, two_handed (bool), handshape, movement_path, non_manual_marker
(e.g., brow_raise, head_tilt, mouth_morpheme), phrase_index, clarity_score,
review_required, tags.

Both presets are produced by the same generation pipeline and rendered by the
same renderer; only the config (and therefore the timeline module + fields)
differs.

## 10. Code Reuse Plan

The existing Astro/local app is a source of domain logic and pre-computed data,
not a foundation. Build the new Next.js app fresh and transplant the pure pieces.

**Transplant (pure TypeScript, ports directly):**
- `src/services/cycle-builder.ts` — beat -> cycle -> phrase grouping (8/16/32).
- `src/services/clip-manager.ts` — clip create/merge/split from cycles.
- `src/services/beat-marker-utils.ts` — beat marker recompute.
- `src/services/slug-utils.ts`, `url-validator.ts` — generic utilities.
- `src/types/index.ts`, `enums.ts` — seed for the bachata preset.

**Reuse offline (do not run on Vercel):**
- `analyzer/` Python (`beat_this`) — run locally once on demo clips to produce
  beat grids; seed the JSON into Aurora `clips.metadata_json`.

**Do not port:**
- ingestion (`yt-dlp`/ffprobe), audio-analysis bridge, clip-extraction (ffmpeg),
  export-service (Remotion), local `project-service`/`app-state`, all `.astro`
  pages/routes and the Remotion player.

**Rebuild new (this is the actual product):**
- Generic schema-driven validator (the existing `schema-validator.ts` is
  hardcoded to bachata fields — reuse its patterns, not its content).
- The deterministic renderer and the three timeline modules.

Net reuse: roughly a day or two saved on beat math and field vocabulary, not a
head start on the platform.

## 11. Six-Day Execution Plan

Deadline June 29, 5pm PT. Treat each "day" as a focused work block; keep a buffer.

**Day 0 (now, < 2 hours):**
- Request AWS + v0 credits (form closes June 26, 12pm PT).
- Provision Aurora PostgreSQL; create a Vercel project; confirm DB connectivity.
- Scaffold Next.js app with v0 (dashboard + wizard + workspace shells).

**Day 1 — Foundation + data model:**
- Enable the `vector` extension; run migrations for the Section 8 tables.
- DB connection layer; seed one bachata project + clips (beat data from analyzer).
- Deploy the shell to Vercel; confirm it reads from Aurora in production.

**Day 2 — Generation + renderer:**
- `WorkspaceSchema` Zod contract; `/api/generate-schema` (+ streaming variant).
- Deterministic `FieldRenderer` + the three timeline modules (beat_grid first).
- Wizard: description -> streamed schema -> activate -> persisted version.

**Day 3 — Labeling + semantic retrieval + export (core spine):**
- Workspace renders the active schema; annotation save/submit to Aurora.
- Generic validator (required/enum/range) before submit.
- pgvector: compute clip embeddings offline at seed, build the HNSW index, and
  ship the "find similar clips" query + UI (Section 6A).
- JSONL export of annotations.

**Day 4 — Second domain + Tier 2 + polish:**
- Seed the sign-language project (gloss segments) and generate its schema.
- Confirm the same renderer produces the gloss timeline (the AHA), and that
  semantic search returns a cross-domain match.
- Tier 2 if time: review/approve + audit; AI pre-labeling with confidence.
- UI polish: empty/loading/error states, spacing, cohesion.

**Day 5 — Submission assets:**
- Architecture diagram; AWS DB proof screenshot; Vercel project link + Team ID.
- Record the < 3-minute demo video (script in Section 12).
- Write the Devpost description (Section 13).
- Publish one content piece for the +0.6 bonus.

**Buffer:** expect to spend it on deploy issues and the video. Protect the
working deployed link above all.

## 12. Demo Script (target 2:45)

- **0:00–0:20 Problem.** Generic labeling tools force every movement domain into
  the same UI. A dance dataset and a sign-language dataset should not share one
  interface.
- **0:20–0:45 Generate a workspace.** Type: "Label bachata clips for movement
  retrieval." The wizard streams a schema into view; activate it. Note it persists
  to Aurora as an immutable version.
- **0:45–1:10 Bachata labeling.** Beat-grid timeline, phrase counts, movement
  labels, entry/exit.
- **1:10–1:35 Prove adaptivity.** Switch to the sign-language project. Same app,
  same renderer, but a gloss-segment timeline and sign-specific fields — generated
  from a DB schema, not a separate hardcoded app. This is the AHA.
- **1:35–2:05 Semantic retrieval (Aurora).** On a clip, click "Find similar
  movements." pgvector returns the nearest clips across the dataset — including a
  cross-domain match. Say explicitly: this is a vector similarity query in Aurora.
- **2:05–2:25 Export.** Export annotations as ML-ready JSONL; download the
  artifact. (If review shipped, show one approve first.)
- **2:25–2:45 Architecture.** Vercel/v0 frontend, AI SDK structured generation,
  Aurora PostgreSQL + pgvector as the schema/workflow/retrieval backbone. Name
  Aurora explicitly.

Footage: IP-clean only (see Section 14). Record bachata clips you own or CC
footage; record sign-language clips yourself. No copyrighted music.

## 13. Devpost Positioning

**Tagline:** AI-generated, schema-driven labeling workspaces for human-movement
video datasets.

**Short description:** AdaptiveLabel lets teams create a custom video labeling
workspace from a plain-English description. The Vercel AI SDK generates a
validated schema (config, not code), which a deterministic renderer turns into a
task-specific labeling UI with the right timeline — a musical beat grid for
bachata, gloss segments for sign language. Labeled clips are embedded and stored
in Aurora with pgvector, enabling semantic "find similar movements" retrieval
across the dataset. Annotations export as ML-ready datasets. Aurora PostgreSQL is
the source of truth for schema versions, tasks, annotations, exports, and vector
search; the frontend is deployed on Vercel.

**Problem:** Teams building movement-understanding AI need labeled video, but
generic tools force every domain into one interface and handle time/rhythm-aware
labeling poorly.

**Solution:** A workspace that adapts to the movement domain, generated from a
description and backed by one production-grade relational model with vector search.

**Why this stack:** v0/Vercel for fast, polished adaptive frontends; the AI SDK
for Zod-validated structured generation and embeddings; Aurora PostgreSQL +
pgvector for durable, multi-domain workflow state and semantic retrieval.

**Roadmap (talking point, not built):** the same engine extends to physical
therapy, sports performance, workplace ergonomics, and other movement domains.

## 14. IP / Footage Compliance (Do Not Skip)

The rules prohibit copyrighted footage/music and third-party trademarks in the
submission video without permission.

- The existing bachata clips are downloaded YouTube videos set to copyrighted
  music. They are fine for local development but **must not appear in the demo
  video**.
- For the video: use clips you own, Creative Commons / Pexels footage, or
  self-recorded material; record sign-language clips yourself; use royalty-free or
  no music.
- Avoid brand logos and trademarks on screen.

## 15. Technical Risks and Mitigations

- **Scope too large for the window.** Mitigation: build only the two-domain spine;
  seed all media-derived data; cut everything in Section 5's "cut" list.
- **Media processing fails in cloud.** Mitigation: no ffmpeg/Python/Remotion at
  runtime; pre-compute beat grids and gloss markers offline and seed them.
- **AI output unreliable.** Mitigation: every output is Zod-validated; invalid
  output is rejected before persistence; deterministic preset fallback for the
  demo so it never depends on a live model call succeeding on stage.
- **Embeddings slow or rate-limited in the request path.** Mitigation: compute all
  embeddings offline at seed time; never embed during a page request; build the
  vector index after seeding; match `vector(N)` to the model's dimension.
- **"v0 looks superficial."** Mitigation: lead with the Aurora data model and the
  config-driven renderer; show that AI produces validated config, not live code.
- **Looks like a Label Studio clone.** Mitigation: lead with adaptive movement
  workspaces and the on-screen timeline switch between domains.
- **AI SDK API drift.** Mitigation: pin `ai` / `@ai-sdk/react` versions and
  re-confirm `Output` / `useObject` signatures against current docs on build day.
- **Overclaiming on sign language.** Mitigation: position strictly as a dataset
  annotation workspace, not a translator/recognizer.

## 16. Submission Checklist

- [ ] AWS + v0 credits requested (form by June 26, 12pm PT).
- [ ] Aurora PostgreSQL provisioned and used as primary backend (with pgvector).
- [ ] Next.js app deployed and working on Vercel (public link).
- [ ] Vercel Project Link + Vercel Team ID.
- [ ] AWS Database proof screenshot.
- [ ] Architecture diagram (Vercel/v0 + AI SDK + Aurora + pgvector + storage).
- [ ] Two domains demonstrated from one schema engine (bachata + sign language).
- [ ] Core spine functional end to end: schema generation, labeling, semantic
      "find similar clips" (pgvector), and JSONL export.
- [ ] < 3-minute demo video, IP-clean footage, names Aurora explicitly.
- [ ] Devpost text description naming the AWS database used.
- [ ] One published content piece for the +0.6 bonus (#H0Hackathon).
- [ ] Public repo + license if submitting source.

## 17. Recommended Next Steps

1. Request credits and provision Aurora + a Vercel project today.
2. Scaffold the Next.js app with v0 (dashboard, wizard, workspace shells).
3. Create the Section 8 migrations and seed the bachata project from analyzer
   output.
4. Implement the `WorkspaceSchema` contract, generation route, and deterministic
   renderer (beat_grid first).
5. Add labeling + JSONL export, and the pgvector "find similar clips" retrieval
   (embeddings seeded offline) — this completes the core spine.
6. Seed and generate the sign-language domain; confirm the renderer adapts and
   semantic search returns a cross-domain match.
7. Tier 2 if time: review/approve + audit, then AI pre-labeling with confidence.
8. Deploy, record the demo, prepare Devpost assets and the content piece.
