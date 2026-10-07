# Reusable TypeScript Artifacts for BachataCut

**Source project:** `annotator_bachata` — Bachata Clip Slicer & Annotator (Astro 5 + React 19 + TypeScript, Node adapter, Python `beat_this` analyzer)
**Target project:** BachataCut — consumer web/mobile app that turns a full dance recording into three share-ready Reels
**Purpose of this document:** capture every TypeScript artifact and pattern worth carrying forward, with complete code, so BachataCut does not reinvent solved problems.

This document is self-contained. You do not need the original repository open to use it. Every code block is either verbatim source from the annotator or an explicitly-labelled adaptation for BachataCut.

---

## Table of contents

1. [How to read this document](#1-how-to-read-this-document)
2. [Reuse ledger (the summary table)](#2-reuse-ledger)
3. [Background: what each codebase is](#3-background-what-each-codebase-is)
4. [Target package boundary](#4-target-package-boundary)
5. [Tier A — copy essentially as-is](#5-tier-a--copy-essentially-as-is)
   - 5.1 [`runProcess` — subprocess runner](#51-runprocess--the-subprocess-runner)
   - 5.2 [`cycle-builder` — beat grid to musical phrases](#52-cycle-builder--beat-grid--musical-phrases)
   - 5.3 [`beat-marker-utils` — beats in trimmed coordinate space](#53-beat-marker-utils--beats-in-trimmed-coordinate-space)
   - 5.4 [`slug-utils` — filesystem-safe names](#54-slug-utils--filesystem-safe-names)
6. [Tier B — extract the core, discard the shell](#6-tier-b--extract-the-core-discard-the-shell)
   - 6.1 [`ffprobe` wrapper — messy phone footage metadata](#61-ffprobe-wrapper--surviving-messy-phone-footage)
   - 6.2 [Handle-based clip extraction](#62-handle-based-clip-extraction)
   - 6.3 [HTTP Range streaming](#63-http-range-streaming)
   - 6.4 [Node↔Python analyzer contract](#64-nodepython-analyzer-contract)
   - 6.5 [`computeTrimRange`](#65-computetrimrange)
7. [Tier C — patterns worth stealing](#7-tier-c--patterns-worth-stealing)
   - 7.1 [SSE progress streaming → "Preparing your Reel"](#71-sse-progress-streaming--preparing-your-reel)
   - 7.2 [Clamped-region video playback](#72-clamped-region-video-playback)
   - 7.3 [Trim control geometry](#73-trim-control-geometry)
   - 7.4 [Debounced saver with flush-on-shutdown](#74-debounced-saver-with-flush-on-shutdown)
8. [Type definitions to keep](#8-type-definitions-to-keep)
9. [Known bugs — do NOT copy these](#9-known-bugs--do-not-copy-these)
10. [Worked example: "Best musicality" from reused primitives](#10-worked-example-best-musicality-from-reused-primitives)
11. [Delete list and why](#11-delete-list-and-why)
12. [Migration checklist](#12-migration-checklist)
13. [Test assets worth carrying over](#13-test-assets-worth-carrying-over)

---

## 1. How to read this document

Every artifact is tagged with a tier and a verdict:

| Tier | Meaning | Action |
|---|---|---|
| **A** | Pure logic, no coupling to the annotator's domain or architecture | Copy the file, change the import paths, done |
| **B** | Valuable core wrapped in an unusable shell | Extract the named functions; rewrite the surrounding I/O |
| **C** | The *approach* is correct, the implementation is context-bound | Read it, then rewrite deliberately for mobile/multi-tenant |
| **D** | Actively wrong for BachataCut | Delete. Documented in §11 so nobody re-adds it |

Code blocks are labelled:

- `SOURCE (verbatim)` — exact copy from the annotator, safe to lift
- `ADAPTED for BachataCut` — new code written for the target architecture
- `NEW (composition)` — new code that composes reused primitives

### Quantitative baseline

Non-test TypeScript in the annotator totals **6,149 lines** across 50 files. Reusable: **~700–880 lines (11–14%)**. The reusable portion is concentrated in four small pure-logic modules plus five extractable functions.

The point of this document is not the line count. It is that these ~800 lines encode solved problems — rational frame-rate parsing, keyframe-accurate seeking, byte-range streaming, beat-phrase alignment — that are individually cheap to write and expensive to get *right*.

---

## 2. Reuse ledger

| File (annotator) | Lines | Tier | Keep | Where it goes in BachataCut |
|---|---|---|---|---|
| `services/process-utils.ts` | 130 | **A** | all | `packages/media-core/process.ts` |
| `services/cycle-builder.ts` | 101 | **A** | all | `packages/dance-core/cycles.ts` |
| `services/beat-marker-utils.ts` | 49 | **A** | all | `packages/dance-core/beat-markers.ts` |
| `services/slug-utils.ts` | 37 | **A** | all | `packages/shared/slug.ts` |
| `services/ingestion-service.ts` | 477 | **B** | ~110 (`ffprobe`) | `packages/media-core/probe.ts` |
| `services/clip-extraction-service.ts` | 159 | **B** | ~90 (handles + args) | `packages/media-core/extract.ts` |
| `pages/api/media/[...path].ts` | 125 | **B** | ~70 (Range) | `apps/api/media/stream.ts` |
| `services/audio-analysis-service.ts` | 92 | **B** | ~40 (contract) | `packages/dance-core/analyzer-contract.ts` |
| `services/export-service.ts` | 161 | **B** | ~15 (`computeTrimRange`) | `packages/media-core/trim.ts` |
| `pages/index.astro` (script block) | ~120 | **C** | SSE reader pattern | `apps/web/lib/progress-stream.ts` |
| `components/ClipPreviewPlayer.tsx` | 468 | **C** | ~140 (clamped playback) | `apps/web/components/ReelPlayer.tsx` |
| `components/TrimControls.tsx` | 193 | **C** | ~60 (geometry) | `apps/web/components/TrimSlider.tsx` |
| `services/project-service.ts` | 209 | **C** | ~80 (debounced saver) | optional; a DB makes it moot |
| `services/shutdown-handler.ts` | 31 | **C** | all (trivial) | worker lifecycle |
| `types/index.ts` | 328 | **B** | ~35 (4 interfaces) | `packages/dance-core/types.ts` |
| `services/annotation-service.ts` | 296 | **D** | — | delete (§11) |
| `services/schema-validator.ts` | 192 | **D** | — | delete (§11) |
| `services/app-state.ts` | 239 | **D** | — | delete (§11) |
| `services/clip-manager.ts` | 234 | **D** | — | delete (§11) |
| `types/enums.ts` | 191 | **D** | — | delete, but see §11 note on ML labels |
| `components/ReviewApp.tsx` | 440 | **D** | — | delete (§11) |
| `components/annotation/*` (7 files) | 795 | **D** | — | delete (§11) |
| `components/AnnotationForm.tsx` | 54 | **D** | — | delete (§11) |
| `components/Clip{Card,Controls,Grid}`, `VideoGroup` | 299 | **D** | — | delete (§11) |
| `services/url-validator.ts` | 37 | **D** | — | delete unless URL import returns |
| `services/required-fields.ts` | 18 | **D** | — | delete (§11) |
| API routes except media (~14 files) | ~700 | **D** | — | delete (§11) |

---

## 3. Background: what each codebase is

You need this context to understand why so little transfers.

### The annotator (source)

A **single-user, local, dataset-labelling tool**. Flow:

1. Paste a YouTube URL → `yt-dlp` downloads MP4 + WAV
2. `ffprobe` reads fps/dimensions/duration/frame count
3. Python `beat_this` analyzer returns BPM, beat timestamps, downbeat offset, RMS energy profile
4. Beat grid → 8/16/32-count cycle hierarchy
5. The **entire video** is exhaustively tiled into uniform N-beat clips
6. Each clip is extracted to its own MP4 with 1-second "handles" on both sides
7. A human reviews every clip and fills a ~40-field annotation form (22 controlled vocabularies)
8. State persists as one big `project.json`; clips export to MP4 + JSON sidecar

Architecture: one global mutable singleton, in-memory `Map`s, whole-project-in-one-JSON with debounced whole-file rewrites, no auth, no users, long-running ffmpeg inside HTTP request handlers, `process.cwd()` as the data directory.

### BachataCut (target)

A **multi-tenant consumer service**. Flow:

1. User uploads a full dance recording from their phone
2. Background pipeline prepares it (progress surfaced to the UI)
3. Computer vision detects and tracks the **couple**, scores visibility/occlusion/steadiness
4. Three moments are **selected and ranked**: Most impressive / Best musicality / Best connection
5. Couple-aware auto-camera generates a smooth vertical crop trajectory
6. Automatic polish (stabilise, brighten, denoise)
7. User picks one, makes small adjustments, exports 9:16 / 1:1 / 16:9

### Why reuse is low

The two systems solve inverse problems. The annotator **exhaustively enumerates** every clip so a human can label them all. BachataCut **selects three** clips so a human never has to look at the rest. And BachataCut's core value — understanding that the subject is a *couple* — requires computer vision that does not exist anywhere in the annotator.

What *does* transfer is the **media plumbing** (subprocess handling, probing, extraction, streaming) and the **musical intelligence** (beat grid → phrase boundaries). Those are genuinely valuable and are exactly what §5–§7 preserve.

---

## 4. Target package boundary

Extract the reusable code into packages with no knowledge of HTTP, auth, or tenancy:

```
bachatacut/
├── packages/
│   ├── media-core/                 # ffmpeg/ffprobe plumbing — no domain knowledge
│   │   ├── process.ts              # ← Tier A: runProcess            (§5.1)
│   │   ├── probe.ts                # ← Tier B: ffprobe               (§6.1)
│   │   ├── extract.ts              # ← Tier B: handle extraction     (§6.2)
│   │   ├── trim.ts                 # ← Tier B: computeTrimRange      (§6.5)
│   │   └── render.ts               # NEW: vertical reframe + polish
│   │
│   ├── dance-core/                 # bachata musical intelligence — pure functions
│   │   ├── types.ts                # ← Tier B: 4 interfaces          (§8)
│   │   ├── cycles.ts               # ← Tier A: buildCycles           (§5.2)
│   │   ├── beat-markers.ts         # ← Tier A: recomputeBeatMarkers  (§5.3)
│   │   ├── analyzer-contract.ts    # ← Tier B: Python JSON contract  (§6.4)
│   │   ├── energy.ts               # NEW: energy profile helpers     (§10)
│   │   └── musicality.ts           # NEW: candidate scoring          (§10)
│   │
│   ├── vision-core/                # 100% NEW — the actual product differentiator
│   │   ├── detect.ts               # person detection + pose
│   │   ├── couple.ts               # which two people are the couple
│   │   ├── quality.ts              # visibility, occlusion, steadiness
│   │   └── framing.ts              # crop trajectory + smoothing
│   │
│   └── shared/
│       └── slug.ts                 # ← Tier A: slugify               (§5.4)
│
└── apps/
    ├── api/                        # multi-tenant HTTP + job enqueue
    ├── worker/                     # queue consumer; all ffmpeg/ML runs here
    └── web/                        # mobile-first UI
```

**Two rules that keep this clean:**

1. `media-core` and `dance-core` must never import from `apps/`. They take plain arguments and return plain data. This is what makes them testable and is why the annotator's pure modules survived at all.
2. All long-running work (ffmpeg, ML inference, analysis) runs in `apps/worker`, never inside a request handler. The annotator violated this and it is the single biggest architectural reason its API layer is unusable.

---

## 5. Tier A — copy essentially as-is

Four files, **317 lines total**. Change import paths and they work.

### 5.1 `runProcess` — the subprocess runner

**Verdict: copy the whole file.** BachataCut shells out to ffmpeg constantly. This consolidates spawn + timeout + stdout/stderr buffering + lifecycle into one well-documented primitive.

The important design decision: it **resolves on non-zero exit** rather than rejecting, and rejects only on spawn failure or timeout. That lets each caller apply its own exit-code interpretation and its own error message prefix, which is exactly what you want when ffmpeg's diagnostics live in stderr.

```ts
// SOURCE (verbatim) — packages/media-core/process.ts
import { spawn } from 'node:child_process';

/** Options controlling a single runProcess invocation. */
export interface RunProcessOptions {
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Environment variables for the spawned process. */
  env?: NodeJS.ProcessEnv;
  /** Max milliseconds before the process is SIGKILLed and the promise rejects. */
  timeoutMs: number;
  /** Message used to reject the promise when the timeout fires. */
  timeoutMessage: string;
}

/** Result of a completed subprocess (resolved on the 'close' event). */
export interface ProcessResult {
  stdout: string;
  stderr: string;
  /** Exit code, or null if terminated by a signal. */
  code: number | null;
}

/**
 * Spawn `cmd` with `args`, buffer stdout/stderr, enforce a timeout, and resolve
 * with { stdout, stderr, code } once the process closes.
 *
 * Lifecycle:
 * - stdio: ['ignore', 'pipe', 'pipe'] — stdin ignored, both outputs buffered.
 * - On timeout: kill('SIGKILL') and REJECT with `opts.timeoutMessage`.
 * - On spawn 'error': REJECT with the raw Error (callers add their own prefix).
 * - On 'close': RESOLVE with { stdout, stderr, code }. Does NOT reject on a
 *   non-zero exit code — callers apply their own exit-code logic.
 */
export function runProcess(
  cmd: string,
  args: string[],
  opts: RunProcessOptions,
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(opts.timeoutMessage));
    }, opts.timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
```

**Caller convention.** Distinguish a timeout rejection (message already correct) from a spawn failure (needs your prefix):

```ts
// SOURCE (verbatim, from clip-extraction-service.ts) — the established idiom
let stderr: string;
let code: number | null;
try {
  ({ stderr, code } = await runProcess('ffmpeg', args, {
    timeoutMs: FFMPEG_TIMEOUT_MS,
    timeoutMessage: `ffmpeg timed out extracting clip to ${outputPath}`,
  }));
} catch (err) {
  const message = (err as Error).message;
  // Timeout rejection already carries the exact desired message; re-throw as-is.
  // Only spawn errors get the caller-specific "failed to start" prefix.
  if (message.startsWith('ffmpeg timed out')) throw err;
  throw new Error(`ffmpeg failed to start: ${message}`);
}

if (code !== 0) {
  throw new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`);
}
```

Note the `stderr.slice(-500)`. ffmpeg emits enormous stderr; the *last* 500 characters contain the actual error. Keep this.

**One addition worth making for BachataCut.** The annotator buffers all stdout in memory, which is fine for JSON output but wrong for long renders where you want progress. Add a streaming variant rather than modifying `runProcess`:

```ts
// ADAPTED for BachataCut — packages/media-core/process.ts (addition)

export interface RunProcessStreamingOptions extends RunProcessOptions {
  /** Called for each line written to stderr. Use to parse ffmpeg progress. */
  onStderrLine?: (line: string) => void;
}

/**
 * Same lifecycle as runProcess, but invokes onStderrLine per complete line so
 * callers can surface progress. Still buffers for the final error message.
 */
export function runProcessStreaming(
  cmd: string,
  args: string[],
  opts: RunProcessStreamingOptions,
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let pending = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(opts.timeoutMessage));
    }, opts.timeoutMs);

    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });

    proc.stderr.on('data', (c: Buffer) => {
      const text = c.toString();
      stderr += text;
      if (!opts.onStderrLine) return;
      // ffmpeg uses \r for in-place progress updates as well as \n
      pending += text;
      const lines = pending.split(/[\r\n]/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) opts.onStderrLine(line.trim());
      }
    });

    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (pending.trim()) opts.onStderrLine?.(pending.trim());
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * Parse `-progress pipe:2` style ffmpeg output into a 0..1 fraction.
 * Emit ffmpeg with `-progress pipe:2 -nostats` to get `out_time_ms=` lines.
 */
export function parseFfmpegProgress(line: string, totalDurationSeconds: number): number | null {
  const m = /^out_time_ms=(\d+)$/.exec(line);
  if (!m || totalDurationSeconds <= 0) return null;
  const seconds = Number(m[1]) / 1_000_000; // out_time_ms is microseconds
  return Math.min(1, Math.max(0, seconds / totalDurationSeconds));
}
```

> **Windows/WSL note.** `spawn` is called without `shell: true`, which is correct and safe (no shell injection). It works on native Windows because `ffmpeg`/`ffprobe`/`uv` are `.exe` binaries. It would break for `.cmd`/`.bat` shims — if you ever wrap a tool in a `.cmd`, resolve the real executable rather than adding `shell: true`.

---

### 5.2 `cycle-builder` — beat grid → musical phrases

**Verdict: copy the whole file. This is the most directly valuable TypeScript in the annotator.**

Why it matters for BachataCut: requirement §6 says a suggestion should "begin and end naturally," and §8 says angle changes should land "at natural moments in the music." Both reduce to *snap cut points to musical phrase boundaries*. This file is that, already written and property-tested.

Bachata is danced in 8-count cycles; 16 and 32 counts form larger phrases. A clip that starts on count 1 of a cycle feels intentional; one that starts on count 5 feels like a mistake — even to viewers who cannot name why.

```ts
// SOURCE (verbatim) — packages/dance-core/cycles.ts
import type { Cycle, CycleHierarchy, Phrase } from './types.js';

/**
 * Group beats into Cycle objects of the specified size starting from the
 * downbeat index, then assemble 16-count and 32-count Phrase objects.
 *
 * Leftover beats that don't form a complete cycle are discarded.
 *
 * @param beatsPerCycle - Beats per cycle (4, 8, 16, or 32). Defaults to 8.
 */
export function buildCycles(
  beatGridFrames: number[],
  beatGridTimestamps: number[],
  downbeatIndex: number,
  beatsPerCycle: 4 | 8 | 16 | 32 = 8,
): CycleHierarchy {
  const beatsFromDownbeat = beatGridTimestamps.length - downbeatIndex;
  const cycleCount = Math.floor(beatsFromDownbeat / beatsPerCycle);

  const cycles8: Cycle[] = [];
  for (let i = 0; i < cycleCount; i++) {
    const startIdx = downbeatIndex + i * beatsPerCycle;
    const endIdx = startIdx + beatsPerCycle - 1;
    cycles8.push({
      cycleNumber: i + 1,
      startBeatIndex: startIdx,
      endBeatIndex: endIdx,
      startFrame: beatGridFrames[startIdx],
      endFrame: beatGridFrames[endIdx],
      startTimestamp: beatGridTimestamps[startIdx],
      endTimestamp: beatGridTimestamps[endIdx],
    });
  }

  const cyclesFor16Beats = 16 / beatsPerCycle;
  const cyclesFor32Beats = 32 / beatsPerCycle;

  const phrases16 = cyclesFor16Beats >= 1 ? buildPhrases(cycles8, cyclesFor16Beats) : [];
  const phrases32 = cyclesFor32Beats >= 1 ? buildPhrases(cycles8, cyclesFor32Beats) : [];

  return { cycles8, phrases16, phrases32 };
}

/**
 * Shift the entire beat grid by an offset in milliseconds and recompute
 * frame numbers from the shifted timestamps.
 */
export function shiftBeatGrid(
  beatGridTimestamps: number[],
  offsetMs: number,
  fps: number,
): { timestamps: number[]; frames: number[] } {
  const offsetSeconds = offsetMs / 1000;
  const timestamps = beatGridTimestamps.map((t) => t + offsetSeconds);
  const frames = timestamps.map((t) => Math.round(t * fps));
  return { timestamps, frames };
}

/** Group consecutive cycles into phrases of `cyclesPerPhrase` size. */
function buildPhrases(cycles: Cycle[], cyclesPerPhrase: number): Phrase[] {
  const phraseCount = Math.floor(cycles.length / cyclesPerPhrase);
  const phrases: Phrase[] = [];

  for (let i = 0; i < phraseCount; i++) {
    const group = cycles.slice(i * cyclesPerPhrase, (i + 1) * cyclesPerPhrase);
    phrases.push({
      phraseNumber: i + 1,
      cycles: group,
      startFrame: group[0].startFrame,
      endFrame: group[group.length - 1].endFrame,
    });
  }

  return phrases;
}
```

**Drop on copy:** the original also exports `recomputeWithDownbeat(frames, timestamps, newDownbeatIndex)`, which is a one-line passthrough to `buildCycles`. Call `buildCycles` directly.

**The downbeat index derivation** lives in the annotator's analyze route, not in this file. You need it, so here it is — the Python analyzer returns a downbeat *timestamp*, but `buildCycles` needs an *index into the beat grid*:

```ts
// SOURCE (verbatim, extracted from api/analyze/[sourceId].ts)
// ADAPTED into a named helper — packages/dance-core/cycles.ts

/**
 * Find the beat-grid index closest to the analyzer's downbeat timestamp.
 * The analyzer reports downbeat_offset_seconds as a time; buildCycles needs
 * the index of the corresponding beat.
 */
export function findDownbeatIndex(
  beatGrid: number[],
  downbeatOffsetSeconds: number,
): number {
  if (beatGrid.length === 0) return 0;
  return beatGrid.reduce((bestIndex, timestamp, index) => {
    const bestDistance = Math.abs(beatGrid[bestIndex] - downbeatOffsetSeconds);
    const currentDistance = Math.abs(timestamp - downbeatOffsetSeconds);
    return currentDistance < bestDistance ? index : bestIndex;
  }, 0);
}
```

**Usage for BachataCut:**

```ts
// NEW (composition) — snap any proposed cut to the nearest phrase boundary
import { buildCycles, findDownbeatIndex } from '@bachatacut/dance-core/cycles';

const downbeatIndex = findDownbeatIndex(analysis.beatGrid, analysis.downbeatOffsetSeconds);
const hierarchy = buildCycles(analysis.beatGridFrames, analysis.beatGrid, downbeatIndex, 8);

/** Snap a frame to the nearest cycle start so cuts land on count 1. */
export function snapToCycleStart(frame: number, hierarchy: CycleHierarchy): number {
  let best = frame;
  let bestDistance = Infinity;
  for (const cycle of hierarchy.cycles8) {
    const distance = Math.abs(cycle.startFrame - frame);
    if (distance < bestDistance) { bestDistance = distance; best = cycle.startFrame; }
  }
  return best;
}
```

> **Caveat to carry forward.** `buildCycles` assumes a *uniform* `beatsPerCycle` from a single downbeat and silently discards trailing beats that do not fill a cycle. It has no notion of tempo drift or a mid-song break. Real social-dance recordings have both. Treat the phrase grid as a strong prior for cut placement, not ground truth — and if BachataCut later needs drift handling, that is a new function, not an edit to this one.

---

### 5.3 `beat-marker-utils` — beats in trimmed coordinate space

**Verdict: copy the whole file.**

The problem it solves: you have a beat grid in *source-absolute* frame numbers, and a clip that has been trimmed to an arbitrary in/out point. To draw beat markers on the clip's own timeline you must translate coordinate spaces. Off-by-one errors here produce markers that visibly drift against the music, and it is tedious to re-derive.

```ts
// SOURCE (verbatim) — packages/dance-core/beat-markers.ts
import type { VirtualClipDef } from './types.js';

/**
 * Recompute beat marker frames for a clip based on its current trim points.
 * Returns frame numbers relative to the trimmed region start (inPoint = frame 0).
 *
 * Algorithm:
 * 1. Compute absolute frame range from inPoint/outPoint × fps + fromFrame offset
 * 2. Filter sourceBeatGridFrames to those within the absolute range
 * 3. Subtract (inPointFrame + fromFrame) to make markers relative to trimmed start
 * 4. Return empty array if no beats fall within range
 */
export function recomputeBeatMarkers(
  clip: VirtualClipDef,
  sourceBeatGridFrames: number[],
): number[] {
  if (sourceBeatGridFrames.length === 0) return [];

  const { fromFrame, durationInFrames, fps } = clip.remotion;

  // inPoint/outPoint default to the full clip range when unset.
  const inPointSeconds = clip.inPoint ?? 0;
  const outPointSeconds = clip.outPoint ?? durationInFrames / fps;

  const inPointFrame = Math.round(inPointSeconds * fps);
  const outPointFrame = Math.round(outPointSeconds * fps);

  // Source-absolute frame range.
  const absoluteStart = fromFrame + inPointFrame;
  const absoluteEnd = fromFrame + outPointFrame;

  // Inclusive start, exclusive end.
  const beatsInRange = sourceBeatGridFrames.filter(
    (frame) => frame >= absoluteStart && frame < absoluteEnd,
  );

  if (beatsInRange.length === 0) return [];

  return beatsInRange.map((frame) => frame - absoluteStart);
}
```

**Rename on copy.** The field is called `remotion` for historical reasons — the annotator once used Remotion for rendering and the name outlived the dependency. In BachataCut call it `timing`:

```ts
// ADAPTED for BachataCut — same logic, honest naming
export interface ClipTiming {
  fromFrame: number;
  durationInFrames: number;
  fps: number;
}

export interface ReelSegment {
  segmentId: string;
  videoId: string;
  timing: ClipTiming;
  /** Seconds of extra footage before/after the logical bounds. See §6.2. */
  handleBefore?: number;
  handleAfter?: number;
  /** In/out offsets in seconds from the start of the extracted file. */
  inPoint?: number;
  outPoint?: number;
  beatMarkerFrames: number[];
}

export function recomputeBeatMarkers(
  segment: ReelSegment,
  sourceBeatGridFrames: number[],
): number[] {
  if (sourceBeatGridFrames.length === 0) return [];

  const { fromFrame, durationInFrames, fps } = segment.timing;
  const inPointSeconds = segment.inPoint ?? 0;
  const outPointSeconds = segment.outPoint ?? durationInFrames / fps;

  const absoluteStart = fromFrame + Math.round(inPointSeconds * fps);
  const absoluteEnd = fromFrame + Math.round(outPointSeconds * fps);

  return sourceBeatGridFrames
    .filter((f) => f >= absoluteStart && f < absoluteEnd)
    .map((f) => f - absoluteStart);
}
```

---

### 5.4 `slug-utils` — filesystem-safe names

**Verdict: copy the whole file.** Small, but you need it for export filenames like `2026-08-01_maria-y-carlos-izmir.mp4`, and the truncation edge case (removing a trailing underscore *introduced by* truncation) is the kind of detail people forget.

```ts
// SOURCE (verbatim) — packages/shared/slug.ts

/**
 * Convert a string into a URL/filesystem-safe slug.
 *
 * 1. lowercase
 * 2. replace any non-[a-z0-9] with _
 * 3. collapse consecutive underscores
 * 4. trim leading/trailing underscores
 * 5. truncate to 60 chars
 * 6. remove any trailing underscore introduced by truncation
 */
export function slugify(title: string): string {
  let slug = title.toLowerCase();
  slug = slug.replace(/[^a-z0-9]/g, '_');
  slug = slug.replace(/_+/g, '_');
  slug = slug.replace(/^_+|_+$/g, '');
  slug = slug.slice(0, 60);
  slug = slug.replace(/_+$/, '');
  return slug;
}

/**
 * Build a folder name from a timestamp, title, and fallback id.
 * Format: YYYY-MM-DD_slugified_title
 */
export function buildFolderName(downloadedAt: string, title: string, sourceId: string): string {
  const date = downloadedAt.slice(0, 10);
  const slug = title ? slugify(title) || sourceId : sourceId;
  return `${date}_${slug}`;
}
```

> **Known limitation.** `[^a-z0-9]` strips all non-ASCII, so "Maria y Carlós — Bachata Sensual" becomes `maria_y_carl_s_bachata_sensual`. For a product with Spanish-speaking users, add Unicode normalisation before the strip:
>
> ```ts
> // ADAPTED for BachataCut — accent-folding so "Carlós" → "carlos"
> export function slugify(title: string): string {
>   let slug = title
>     .normalize('NFKD')                 // decompose accents
>     .replace(/[\u0300-\u036f]/g, '')   // strip combining marks
>     .toLowerCase()
>     .replace(/[^a-z0-9]/g, '_')
>     .replace(/_+/g, '_')
>     .replace(/^_+|_+$/g, '')
>     .slice(0, 60)
>     .replace(/_+$/, '');
>   return slug;
> }
> ```
> Never derive a storage key from user text alone — always pair the slug with an opaque id (`${uuid}_${slug}.mp4`) so collisions and empty slugs cannot cause overwrites.

---

## 6. Tier B — extract the core, discard the shell

Five functions buried inside files that are otherwise unusable. **~330 usable lines out of 1,014.**

### 6.1 `ffprobe` wrapper — surviving messy phone footage

**Verdict: extract `ffprobe()` (~110 lines of the 477-line `ingestion-service.ts`). Delete the rest.**

This is more valuable for BachataCut than for the annotator, because BachataCut ingests **arbitrary phone uploads** rather than normalised YouTube MP4s. Phone video is where metadata gets weird: variable frame rate, missing `nb_frames`, rational frame rates like `30000/1001`, duration present at container level but absent per-stream.

Every fallback in this function exists because something broke. Keep all of them.

```ts
// SOURCE (verbatim, extracted from ingestion-service.ts)
// → packages/media-core/probe.ts
import { runProcess } from './process.js';

/** Timeout for ffprobe metadata extraction (30 seconds). */
const FFPROBE_TIMEOUT_MS = 30 * 1000;

export interface FfprobeResult {
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  totalFrames: number;
}

/**
 * Run ffprobe on a video file and extract stream/format metadata.
 */
export async function ffprobe(videoPath: string): Promise<FfprobeResult> {
  let stdout: string;
  let stderr: string;
  let code: number | null;
  try {
    ({ stdout, stderr, code } = await runProcess(
      'ffprobe',
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath,
      ],
      { timeoutMs: FFPROBE_TIMEOUT_MS, timeoutMessage: 'ffprobe timed out' },
    ));
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'ffprobe timed out') throw err;
    throw new Error(`ffprobe failed to start: ${message}`);
  }

  if (code !== 0) {
    throw new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`);
  }

  try {
    const data = JSON.parse(stdout) as {
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
        nb_frames?: string;
        duration?: string;
      }>;
      format?: { duration?: string };
    };

    const videoStream = data.streams?.find((s) => s.codec_type === 'video');
    if (!videoStream) {
      throw new Error('No video stream found in ffprobe output');
    }

    // Parse frame rate from "30000/1001" or "30/1" format
    let fps = 30;
    if (videoStream.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2) {
        const num = Number(parts[0]);
        const den = Number(parts[1]);
        if (den > 0) fps = num / den;
      } else {
        const parsed = Number(videoStream.r_frame_rate);
        if (!Number.isNaN(parsed) && parsed > 0) fps = parsed;
      }
    }

    const width = videoStream.width ?? 0;
    const height = videoStream.height ?? 0;

    // Duration: prefer format-level, fall back to stream-level
    const durationStr = data.format?.duration ?? videoStream.duration ?? '0';
    const durationSeconds = Number.parseFloat(durationStr) || 0;

    // Total frames: prefer nb_frames, fall back to fps × duration
    let totalFrames = 0;
    if (videoStream.nb_frames && videoStream.nb_frames !== 'N/A') {
      totalFrames = Number.parseInt(videoStream.nb_frames, 10) || 0;
    }
    if (totalFrames === 0) {
      totalFrames = Math.round(fps * durationSeconds);
    }

    return { fps: Math.round(fps * 100) / 100, width, height, durationSeconds, totalFrames };
  } catch (err) {
    if (err instanceof Error && err.message === 'No video stream found in ffprobe output') {
      throw err;
    }
    throw new Error(`Failed to parse ffprobe output: ${(err as Error).message}`);
  }
}
```

**Why each fallback matters:**

| Line of defence | Real-world cause |
|---|---|
| `r_frame_rate` split on `/` | NTSC rates are rationals: `30000/1001` = 29.97, `24000/1001` = 23.976 |
| `fps = 30` default | Some containers omit `r_frame_rate` entirely |
| `format.duration ?? stream.duration` | Stream-level duration is missing in many phone MP4s |
| `nb_frames !== 'N/A'` | ffprobe returns the literal string `"N/A"`, which `parseInt` turns into `NaN` |
| `totalFrames = fps × duration` | VFR recordings frequently have no frame count at all |
| `Math.round(fps * 100) / 100` | Keeps 29.97 as 29.97 instead of 29.969999999999998 |

**Extensions BachataCut needs.** Phone uploads add two concerns the annotator never had: rotation metadata and orientation. Add these rather than editing the function above:

```ts
// ADAPTED for BachataCut — packages/media-core/probe.ts (additions)

export interface UploadProbeResult extends FfprobeResult {
  /** Display rotation in degrees (0, 90, 180, 270) from side_data or tags. */
  rotationDegrees: number;
  /** Dimensions after rotation is applied — what the viewer actually sees. */
  displayWidth: number;
  displayHeight: number;
  isPortrait: boolean;
  hasAudioStream: boolean;
  /** True when r_frame_rate and avg_frame_rate disagree materially (VFR). */
  likelyVariableFrameRate: boolean;
}

export async function probeUpload(videoPath: string): Promise<UploadProbeResult> {
  const { stdout, stderr, code } = await runProcess(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath],
    { timeoutMs: FFPROBE_TIMEOUT_MS, timeoutMessage: 'ffprobe timed out' },
  );
  if (code !== 0) throw new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`);

  const data = JSON.parse(stdout);
  const base = await ffprobe(videoPath); // reuse all the fallback logic above

  const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
  const hasAudioStream = Boolean(data.streams?.some((s: any) => s.codec_type === 'audio'));

  // Rotation lives in either side_data_list or the stream tags, depending on muxer.
  let rotationDegrees = 0;
  const sideData = videoStream?.side_data_list?.find((d: any) => d.rotation !== undefined);
  if (sideData) {
    rotationDegrees = ((Math.round(Number(sideData.rotation)) % 360) + 360) % 360;
  } else if (videoStream?.tags?.rotate) {
    rotationDegrees = ((Number(videoStream.tags.rotate) % 360) + 360) % 360;
  }

  const swapped = rotationDegrees === 90 || rotationDegrees === 270;
  const displayWidth = swapped ? base.height : base.width;
  const displayHeight = swapped ? base.width : base.height;

  // VFR detection: compare nominal vs average frame rate.
  let likelyVariableFrameRate = false;
  if (videoStream?.avg_frame_rate && videoStream.avg_frame_rate !== '0/0') {
    const [an, ad] = videoStream.avg_frame_rate.split('/').map(Number);
    if (ad > 0) {
      const avgFps = an / ad;
      likelyVariableFrameRate = Math.abs(avgFps - base.fps) > 0.5;
    }
  }

  return {
    ...base,
    rotationDegrees,
    displayWidth,
    displayHeight,
    isPortrait: displayHeight > displayWidth,
    hasAudioStream,
    likelyVariableFrameRate,
  };
}
```

> **Why rotation matters.** A phone recording is often stored landscape with a 90° rotation flag. If your vision pipeline reads raw frames without honouring rotation, every bounding box is transposed and the couple-aware framing in §7 of the requirements will crop the wrong region. Normalise orientation once at ingest (`ffmpeg -autorotate 1`, the default, or an explicit `transpose` filter) and record it.
>
> **Why VFR matters.** All frame↔time math in `dance-core` assumes constant fps. If `likelyVariableFrameRate` is true, transcode to CFR at ingest before analysis, otherwise beat markers drift progressively through the clip.

**Validation gate for uploads.** The annotator trusted its input; BachataCut cannot:

```ts
// ADAPTED for BachataCut — reject unusable uploads early, with honest messages
// Requirements §5: "BachataCut should be honest about it and offer the safest
// usable result rather than over-processing it."

export interface UploadRejection { code: string; userMessage: string; }

export function validateUpload(probe: UploadProbeResult): UploadRejection | null {
  if (probe.durationSeconds < 10) {
    return { code: 'TOO_SHORT', userMessage: 'This clip is too short to find a good moment. Try a recording of at least 15 seconds.' };
  }
  if (probe.durationSeconds > 20 * 60) {
    return { code: 'TOO_LONG', userMessage: 'This recording is longer than 20 minutes. Try uploading a single dance.' };
  }
  if (!probe.hasAudioStream) {
    return { code: 'NO_AUDIO', userMessage: 'This video has no sound, so we cannot match the moment to the music.' };
  }
  if (Math.min(probe.displayWidth, probe.displayHeight) < 480) {
    return { code: 'TOO_LOW_RES', userMessage: 'This video is too low resolution to make a sharp Reel.' };
  }
  return null;
}
```

---

### 6.2 Handle-based clip extraction

**Verdict: extract the handle math and the ffmpeg argument builder (~90 lines of 159). Discard `extractAllClips`.**

**The pattern, and why it is genuinely clever:** when you extract a candidate segment, you also extract a configurable amount of extra footage on *both* sides — a "handle." Later trim adjustments become pure metadata changes within the already-extracted file. No re-extraction, no waiting.

This maps precisely onto BachataCut §5: *"Make the start or end slightly earlier or later."* The user drags a trim handle and playback updates instantly, because the footage is already local.

```ts
// SOURCE (verbatim, from clip-extraction-service.ts) — the handle computation
// → packages/media-core/extract.ts

/** Default handle duration in seconds added before and after each clip. */
export const DEFAULT_HANDLE_SECONDS = 1.0;

/** Timeout for a single ffmpeg extraction (60 seconds per clip). */
const FFMPEG_TIMEOUT_MS = 60_000;

// --- The core insight: clamp handles to the source boundaries -------------
const fps = clip.remotion.fps;
const clipStartSeconds = clip.remotion.fromFrame / fps;
const clipDurationSeconds = clip.remotion.durationInFrames / fps;
const clipEndSeconds = clipStartSeconds + clipDurationSeconds;

// A clip at t=0.3s cannot have a 1.0s handle before it — clamp to what exists.
const handleBefore = Math.min(handleSeconds, clipStartSeconds);
const handleAfter = Math.min(handleSeconds, Math.max(0, sourceDurationSeconds - clipEndSeconds));

const extractStart = clipStartSeconds - handleBefore;
const extractDuration = handleBefore + clipDurationSeconds + handleAfter;
```

The `Math.max(0, ...)` inside `handleAfter` is not decoration — without it, a clip ending at or past the source duration produces a negative handle and ffmpeg receives a malformed `-t`.

**The returned contract records the handles**, because the UI must know where the logical bounds sit inside the extracted file:

```ts
// SOURCE (verbatim)
export interface ExtractionResult {
  clipId: string;
  /** Path to the extracted MP4 relative to project root. */
  extractedFile: string;
  /** The handle (in seconds) added before the clip's logical start. */
  handleBefore: number;
  /** The handle (in seconds) added after the clip's logical end. */
  handleAfter: number;
  /** Total duration of the extracted file in seconds. */
  extractedDuration: number;
}
```

**The ffmpeg argument builder:**

```ts
// SOURCE (verbatim, from clip-extraction-service.ts)
/**
 * Run ffmpeg to extract a segment with re-encoding for keyframe-accurate start.
 * Uses -ss before -i for fast seeking, then re-encodes a short segment.
 */
async function runFfmpeg(
  videoPath: string,
  audioPath: string | undefined,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
): Promise<void> {
  const args: string[] = [
    '-y',
    '-ss', startSeconds.toFixed(4),
    '-i', videoPath,
  ];

  // If separate audio, add it as a second input
  if (audioPath) {
    args.push('-ss', startSeconds.toFixed(4), '-i', audioPath);
  }

  args.push(
    '-t', durationSeconds.toFixed(4),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-force_key_frames', '0',      // keyframe at the very start
    '-movflags', '+faststart',     // moov atom first → instant web playback
  );

  if (audioPath) {
    args.push('-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-c:a', 'aac', '-b:a', '192k');
  }

  args.push(outputPath);
  // ... runProcess + exit-code handling (see §5.1 caller convention)
}
```

**Each flag is load-bearing. Do not "simplify" these:**

| Flag | Why |
|---|---|
| `-ss` **before** `-i` | Input seeking — ffmpeg jumps directly rather than decoding from t=0. Orders of magnitude faster on long sources |
| `-c:v libx264` (re-encode) | Stream copy cannot cut at an arbitrary frame; it snaps to the previous keyframe. Re-encoding is what makes the cut accurate |
| `-crf 18` | Visually near-lossless for an intermediate. Do not go lower for a working file |
| `-pix_fmt yuv420p` | Without it, some inputs yield `yuv444p`/`yuv422p` which Safari and many mobile browsers refuse to play |
| `-force_key_frames 0` | Guarantees a keyframe at frame 0 so the file seeks instantly from its start |
| `-movflags +faststart` | Moves the `moov` atom to the front. Without it, browsers must download the whole file before playback begins |
| `.toFixed(4)` | Avoids scientific notation (`1e-7`) in the argument, which ffmpeg misparses |

**Discard `extractAllClips`.** It is a serial async generator that extracts every clip one after another inside the request. BachataCut needs concurrency-limited work in a queue worker:

```ts
// ADAPTED for BachataCut — packages/media-core/extract.ts
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { runProcess } from './process.js';

export interface ExtractOptions {
  sourceVideoPath: string;
  /** Optional separate audio track (e.g. a cleaned WAV). */
  sourceAudioPath?: string;
  outputDir: string;
  sourceDurationSeconds: number;
  handleSeconds?: number;
}

export interface SegmentBounds {
  segmentId: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface ExtractionResult {
  segmentId: string;
  extractedFile: string;
  handleBefore: number;
  handleAfter: number;
  extractedDuration: number;
}

/** Extract one segment with clamped handles. Pure ffmpeg, no domain knowledge. */
export async function extractSegment(
  segment: SegmentBounds,
  opts: ExtractOptions,
): Promise<ExtractionResult> {
  const handleSeconds = opts.handleSeconds ?? DEFAULT_HANDLE_SECONDS;
  await mkdir(opts.outputDir, { recursive: true });

  const endSeconds = segment.startSeconds + segment.durationSeconds;

  // Verbatim handle-clamping logic from the annotator.
  const handleBefore = Math.min(handleSeconds, segment.startSeconds);
  const handleAfter = Math.min(
    handleSeconds,
    Math.max(0, opts.sourceDurationSeconds - endSeconds),
  );

  const extractStart = segment.startSeconds - handleBefore;
  const extractDuration = handleBefore + segment.durationSeconds + handleAfter;
  const outputPath = join(opts.outputDir, `${segment.segmentId}.mp4`);

  const args = [
    '-y',
    '-ss', extractStart.toFixed(4),
    '-i', opts.sourceVideoPath,
    ...(opts.sourceAudioPath ? ['-ss', extractStart.toFixed(4), '-i', opts.sourceAudioPath] : []),
    '-t', extractDuration.toFixed(4),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-force_key_frames', '0',
    '-movflags', '+faststart',
    ...(opts.sourceAudioPath
      ? ['-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k']
      : ['-c:a', 'aac', '-b:a', '192k']),
    outputPath,
  ];

  let stderr: string, code: number | null;
  try {
    ({ stderr, code } = await runProcess('ffmpeg', args, {
      timeoutMs: FFMPEG_TIMEOUT_MS,
      timeoutMessage: `ffmpeg timed out extracting segment ${segment.segmentId}`,
    }));
  } catch (err) {
    const message = (err as Error).message;
    if (message.startsWith('ffmpeg timed out')) throw err;
    throw new Error(`ffmpeg failed to start: ${message}`);
  }
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`);
  }

  return {
    segmentId: segment.segmentId,
    extractedFile: outputPath,
    handleBefore,
    handleAfter,
    extractedDuration: extractDuration,
  };
}

/**
 * Extract several segments with bounded concurrency.
 * Replaces the annotator's serial generator. BachataCut only ever extracts
 * ~3 candidates per video, so a small limit is plenty and keeps CPU predictable.
 */
export async function extractSegments(
  segments: SegmentBounds[],
  opts: ExtractOptions,
  concurrency = 2,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractionResult[]> {
  const results: ExtractionResult[] = new Array(segments.length);
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= segments.length) return;
      results[index] = await extractSegment(segments[index], opts);
      onProgress?.(++completed, segments.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, segments.length) }, worker),
  );
  return results;
}
```

> **Sizing note.** The annotator tiled a 165-second video into ~40 clips and extracted all of them — minutes of CPU per upload. BachataCut extracts **three**. Same primitive, two orders of magnitude less work. Do not carry over the tiling mindset (see §11 on `clip-manager.ts`).

---

### 6.3 HTTP Range streaming

**Verdict: extract the Range parsing (~70 lines of 125). Replace the allowlist and the file backend.**

Byte-range support is mandatory for video: without it, seeking in a `<video>` element either fails or forces a full re-download. The annotator's implementation is complete and correct, including the suffix-range form and proper 416 responses. That is worth keeping because it is easy to write subtly wrong.

```ts
// SOURCE (verbatim, extracted from api/media/[...path].ts)
// → the reusable core: parse a Range header against a known file size

const rangeHeader = request.headers.get('range');

// No Range → full 200 response with Content-Length and Accept-Ranges.
if (!rangeHeader) {
  const stream = createReadStream(absolutePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...commonHeaders, 'Content-Length': String(fileStats.size) },
  });
}

const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
if (!match) {
  return new Response(null, {
    status: 416,
    headers: { ...commonHeaders, 'Content-Range': `bytes */${fileStats.size}` },
  });
}

let start = match[1] === '' ? 0 : Number.parseInt(match[1], 10);
let end = match[2] === '' ? fileStats.size - 1 : Number.parseInt(match[2], 10);

// Suffix range: "bytes=-500" means the LAST 500 bytes, not bytes 0..500.
if (match[1] === '' && match[2] !== '') {
  const suffixLength = Number.parseInt(match[2], 10);
  start = Math.max(fileStats.size - suffixLength, 0);
  end = fileStats.size - 1;
}

if (
  Number.isNaN(start) || Number.isNaN(end) ||
  start < 0 || start > end || start >= fileStats.size
) {
  return new Response(null, {
    status: 416,
    headers: { ...commonHeaders, 'Content-Range': `bytes */${fileStats.size}` },
  });
}

end = Math.min(end, fileStats.size - 1);

const stream = createReadStream(absolutePath, { start, end });
return new Response(Readable.toWeb(stream) as ReadableStream, {
  status: 206,
  headers: {
    ...commonHeaders,
    'Content-Length': String(end - start + 1),
    'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
  },
});
```

**Refactor it into a pure, testable function** — this is the version to keep:

```ts
// ADAPTED for BachataCut — packages/media-core/range.ts (pure, unit-testable)

export type RangeResolution =
  | { kind: 'full'; size: number }
  | { kind: 'partial'; start: number; end: number; size: number }
  | { kind: 'unsatisfiable'; size: number };

/**
 * Resolve an HTTP Range header against a known content size.
 * Pure — no I/O — so every branch is trivially testable.
 *
 * Handles: absent header, "bytes=0-", "bytes=100-200", "bytes=-500" (suffix),
 * malformed values, and out-of-bounds requests.
 */
export function resolveRange(rangeHeader: string | null, size: number): RangeResolution {
  if (!rangeHeader) return { kind: 'full', size };

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return { kind: 'unsatisfiable', size };

  let start: number;
  let end: number;

  if (match[1] === '' && match[2] !== '') {
    // Suffix form: last N bytes.
    const suffixLength = Number.parseInt(match[2], 10);
    if (Number.isNaN(suffixLength) || suffixLength === 0) {
      return { kind: 'unsatisfiable', size };
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = match[1] === '' ? 0 : Number.parseInt(match[1], 10);
    end = match[2] === '' ? size - 1 : Number.parseInt(match[2], 10);
  }

  if (
    Number.isNaN(start) || Number.isNaN(end) ||
    start < 0 || start > end || start >= size
  ) {
    return { kind: 'unsatisfiable', size };
  }

  return { kind: 'partial', start, end: Math.min(end, size - 1), size };
}

export const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
};
```

**The traversal guard is also worth keeping as a pattern** — note it uses `path.sep`, so it is correct on both Windows and POSIX:

```ts
// SOURCE (verbatim) — defence-in-depth: allowlist prefix AND resolved-path containment
function isAllowedMediaPath(relativePath: string): boolean {
  return (
    relativePath === 'sources' || relativePath.startsWith('sources/') ||
    relativePath === 'exports' || relativePath.startsWith('exports/')
  );
}

const projectRoot = resolve(projectDir);
const absolutePath = resolve(projectDir, relativePath);

// Reject anything that escapes the root, even if the allowlist passed.
if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${sep}`)) {
  return errorResponse('Invalid media path', 403);
}
```

> **Critical security change for BachataCut.** The annotator is single-user, so *any* path under `sources/` is fair game. BachataCut is multi-tenant: an unauthenticated path-based media endpoint would let any user stream any other user's private dance videos.
>
> **Do not port the endpoint's authorization model. Port only `resolveRange`.** In production, serve media from object storage with short-lived signed URLs, and let the CDN handle Range:
>
> ```ts
> // ADAPTED for BachataCut — ownership check, then delegate to signed URL
> export async function getMediaUrl(userId: string, assetId: string): Promise<string> {
>   const asset = await db.asset.findUnique({ where: { id: assetId } });
>   if (!asset || asset.ownerId !== userId) {
>     throw new ForbiddenError('Asset not found'); // 404-style message, no existence leak
>   }
>   return storage.getSignedUrl(asset.storageKey, { expiresIn: 900 }); // 15 min
> }
> ```
>
> Keep `resolveRange` for local development and for the worker's own reads. Never expose a raw path-to-file endpoint to authenticated users in a multi-tenant service.

---

### 6.4 Node↔Python analyzer contract

**Verdict: extract the interface and mapping (~40 lines of 92). Replace the spawn-per-request.**

The valuable artifact is the **typed boundary** between Node and the Python `beat_this` analyzer, plus the snake_case→camelCase translation. That contract is what lets you swap the Python implementation without touching TypeScript.

```ts
// SOURCE (verbatim) — the contract worth preserving
// → packages/dance-core/analyzer-contract.ts

/** Shape of the JSON emitted by the Python analyzer CLI (stdout). */
export interface PythonAnalyzerOutput {
  bpm: number;
  bpm_confidence: number;
  downbeat_offset_seconds: number;
  beat_timestamps: number[];
  beat_frames: number[];
  energy_profile: number[];
}

/** The camelCase form used throughout TypeScript. */
export interface AudioAnalysisResult {
  detectedBpm: number;
  bpmConfidence: number;
  downbeatOffsetSeconds: number;
  beatGrid: number[];        // timestamps in seconds
  beatGridFrames: number[];  // frame numbers
  energyProfile: number[];   // RMS values per hop
}

/** Translate the Python payload into the internal representation. */
export function toAudioAnalysisResult(raw: PythonAnalyzerOutput): AudioAnalysisResult {
  return {
    detectedBpm: raw.bpm,
    bpmConfidence: raw.bpm_confidence,
    downbeatOffsetSeconds: raw.downbeat_offset_seconds,
    beatGrid: raw.beat_timestamps,
    beatGridFrames: raw.beat_frames,
    energyProfile: raw.energy_profile,
  };
}
```

**Constants you must carry over.** The Python analyzer computes its energy profile with `sr=22050, hop_length=512, frame_length=2048`. Every TypeScript consumer needs the hop duration to map a timestamp to an energy index. This is currently **implicit** in the annotator — a latent bug. Make it explicit:

```ts
// ADAPTED for BachataCut — packages/dance-core/analyzer-contract.ts (additions)

/**
 * Analyzer DSP constants. These MUST match analyzer/analyze.py:
 *   _compute_energy_profile(wav_path, sr=22050, hop_length=512)
 *   frame_length = 2048
 * If the Python side changes, change these together or all energy lookups skew.
 */
export const ANALYZER_SAMPLE_RATE = 22050;
export const ANALYZER_HOP_LENGTH = 512;
export const ANALYZER_FRAME_LENGTH = 2048;

/** Seconds represented by one energy_profile entry (≈0.023220s). */
export const ENERGY_HOP_SECONDS = ANALYZER_HOP_LENGTH / ANALYZER_SAMPLE_RATE;

/** Index into energy_profile for a given time in seconds. */
export function energyIndexForTime(seconds: number): number {
  return Math.max(0, Math.round(seconds / ENERGY_HOP_SECONDS));
}

/** Runtime guard — never trust subprocess stdout without checking its shape. */
export function isPythonAnalyzerOutput(v: unknown): v is PythonAnalyzerOutput {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.bpm === 'number' &&
    typeof o.bpm_confidence === 'number' &&
    typeof o.downbeat_offset_seconds === 'number' &&
    Array.isArray(o.beat_timestamps) &&
    Array.isArray(o.beat_frames) &&
    Array.isArray(o.energy_profile)
  );
}
```

**What to discard:** the annotator spawns `uv run python -m analyzer.analyze` **per HTTP request**, which reloads the torch checkpoint every time (the Python singleton only caches within one process). It also has a 60-second timeout that a long recording on CPU will exceed.

```ts
// ADAPTED for BachataCut — worker-side invocation with validation
import { runProcess } from '@bachatacut/media-core/process';
import {
  type AudioAnalysisResult,
  isPythonAnalyzerOutput,
  toAudioAnalysisResult,
} from './analyzer-contract.js';

const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000; // generous: CPU inference on a long upload

/**
 * Run the Python analyzer. Intended to be called from a QUEUE WORKER, never
 * from a request handler.
 *
 * Production note: prefer a long-lived Python service that holds the model in
 * memory (FastAPI, or a queue consumer) over per-job CLI spawns. The checkpoint
 * load dominates runtime for short recordings.
 */
export async function analyzeAudio(
  wavPath: string,
  fps: number,
  opts: { cwd: string },
): Promise<AudioAnalysisResult> {
  let stdout: string, stderr: string, code: number | null;
  try {
    ({ stdout, stderr, code } = await runProcess(
      'uv',
      ['run', 'python', '-m', 'analyzer.analyze', wavPath, '--fps', String(fps)],
      {
        cwd: opts.cwd,
        timeoutMs: ANALYSIS_TIMEOUT_MS,
        timeoutMessage: `Audio analysis timed out after ${ANALYSIS_TIMEOUT_MS / 1000}s`,
      },
    ));
  } catch (err) {
    const message = (err as Error).message;
    if (message.startsWith('Audio analysis timed out')) throw err;
    throw new Error(`Failed to start audio analysis subprocess: ${message}`);
  }

  if (code !== 0) {
    throw new Error(`Audio analysis failed (exit ${code}): ${stderr.trim() || '(no stderr)'}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Analyzer output was not valid JSON: ${stdout.slice(0, 200)}`);
  }

  if (!isPythonAnalyzerOutput(parsed)) {
    throw new Error('Analyzer output did not match the expected contract');
  }

  return toAudioAnalysisResult(parsed);
}
```

**Note on `bpm_confidence`.** The Python side derives it as `1 - coefficient_of_variation(inter_beat_intervals)`, clamped to `[0, 1]`. It measures **beat regularity, not genre correctness**. Use it as a gate: low confidence means the recording has tempo drift or a weak beat, so musicality-based suggestions should be de-prioritised rather than presented confidently. This aligns with requirement §5's instruction to be honest when the input is poor.

---

### 6.5 `computeTrimRange`

**Verdict: extract the function (~15 lines of 161). Do NOT copy the ffmpeg call around it — see §9.**

Small but exactly right: it resolves optional in/out points against handle-based defaults, which is the arithmetic you need every time a user nudges a trim boundary.

```ts
// SOURCE (verbatim, from export-service.ts) → packages/media-core/trim.ts

/**
 * Compute the ffmpeg seek position and duration for a clip export.
 * Falls back to handleBefore-based defaults when inPoint/outPoint are not set.
 */
export function computeTrimRange(clip: VirtualClipDef): { seekPosition: number; duration: number } {
  const clipDuration = clip.remotion.durationInFrames / clip.remotion.fps;
  const handleBefore = clip.handleBefore ?? 0;

  const seekPosition = clip.inPoint ?? handleBefore;
  const outPoint = clip.outPoint ?? (handleBefore + clipDuration);
  const duration = outPoint - seekPosition;

  return { seekPosition, duration };
}
```

```ts
// ADAPTED for BachataCut — decoupled from the clip type, with validation
export interface TrimRange { seekPosition: number; duration: number; }

export function computeTrimRange(segment: {
  timing: { durationInFrames: number; fps: number };
  handleBefore?: number;
  inPoint?: number;
  outPoint?: number;
}): TrimRange {
  const logicalDuration = segment.timing.durationInFrames / segment.timing.fps;
  const handleBefore = segment.handleBefore ?? 0;

  const seekPosition = segment.inPoint ?? handleBefore;
  const outPoint = segment.outPoint ?? handleBefore + logicalDuration;
  const duration = outPoint - seekPosition;

  if (duration <= 0) {
    throw new Error(
      `Invalid trim range: in=${seekPosition} out=${outPoint} yields duration ${duration}`,
    );
  }
  return { seekPosition, duration };
}
```

**Also worth keeping: the trim bounds validation** from the annotator's trim route, which correctly constrains adjustments to the extracted handle window:

```ts
// SOURCE (verbatim, from api/clips/[id]/trim.ts) — the validation logic
const handleBefore = clip.handleBefore ?? 0;
const handleAfter = clip.handleAfter ?? 0;
const clipDuration = clip.remotion.durationInFrames / clip.remotion.fps;
const totalExtracted = handleBefore + clipDuration + handleAfter;

if (body.inPoint !== undefined) {
  if (body.inPoint < 0 || body.inPoint >= totalExtracted) {
    return errorResponse(`inPoint must be between 0 and ${totalExtracted.toFixed(3)}`);
  }
  clip.inPoint = body.inPoint;
}
if (body.outPoint !== undefined) {
  if (body.outPoint <= 0 || body.outPoint > totalExtracted) {
    return errorResponse(`outPoint must be between 0 and ${totalExtracted.toFixed(3)}`);
  }
  clip.outPoint = body.outPoint;
}

// Then enforce ordering, and recompute beat markers for the new window.
const inPt = clip.inPoint ?? handleBefore;
const outPt = clip.outPoint ?? (handleBefore + clipDuration);
if (inPt >= outPt) return errorResponse('inPoint must be less than outPoint');
```

Note the final step in the original route: after changing the trim it calls `recomputeBeatMarkers` (§5.3) so the on-screen beat overlay stays aligned. Preserve that ordering — **validate, mutate, then recompute markers.**

---

## 7. Tier C — patterns worth stealing

These implementations are context-bound (desktop, single-user, mouse-driven), but the *approach* is correct and re-deriving it wastes time. Read, understand, then rewrite deliberately.

### 7.1 SSE progress streaming → "Preparing your Reel"

**Verdict: keep the pattern, both halves. This maps directly onto a named BachataCut screen.**

Requirement §10 lists a **"Preparing your Reel"** screen: *"See clear progress while results are being prepared."* The annotator already solves exactly this with Server-Sent Events over a `ReadableStream`, plus a client reader that handles partial chunks correctly.

#### Server side

```ts
// SOURCE (verbatim, from api/ingest.ts) — SSE over a ReadableStream
const encoder = new TextEncoder();

const stream = new ReadableStream({
  async start(controller) {
    try {
      const gen = download(url, state.projectDir);
      let result = await gen.next();

      // Forward each progress event as it arrives.
      while (!result.done) {
        const event = `data: ${JSON.stringify({ type: 'progress', ...result.value })}\n\n`;
        controller.enqueue(encoder.encode(event));
        result = await gen.next();
      }

      const metadata = result.value; // generator RETURN value, not a yield
      // ... persist ...

      const doneEvent = `data: ${JSON.stringify({ type: 'complete', metadata })}\n\n`;
      controller.enqueue(encoder.encode(doneEvent));
      controller.close();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Errors are delivered as a normal SSE event, not an HTTP error status —
      // the response headers were already flushed by this point.
      const errorEvent = `data: ${JSON.stringify({ type: 'error', error: message })}\n\n`;
      controller.enqueue(encoder.encode(errorEvent));
      controller.close();
    }
  },
});

return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

Two details worth internalising: the `AsyncGenerator<Progress, Result>` shape (progress via `yield`, final payload via `return`) is an elegant fit for SSE, and **once you have streamed a single byte you can no longer send an HTTP error status** — hence errors travel as `{ type: 'error' }` events.

#### Client side

```ts
// SOURCE (verbatim, from index.astro) — the buffered SSE reader
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  // Split on the SSE record separator; keep the trailing partial in the buffer.
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    const match = line.match(/^data:\s*(.+)$/m);
    if (!match) continue;
    const event = JSON.parse(match[1]);

    if (event.type === 'progress') {
      // update UI
    } else if (event.type === 'complete') {
      // advance
    } else if (event.type === 'error') {
      throw new Error(event.error || 'Failed');
    }
  }
}
```

The `buffer = lines.pop() || ''` line is the crux: TCP chunks do not align with SSE records, so a partial record must be carried to the next read. Skipping this produces intermittent `JSON.parse` failures that only appear under real network conditions.

#### BachataCut adaptation

The annotator's client orchestrates three sequential phases (download → analyze → generate) from the browser, with `progressLabel.textContent = 'Analyzing…'` between fetches. **Do not carry that over** — if the user closes the tab, the pipeline dies. Move orchestration server-side into a job, and let the client subscribe to job state.

```ts
// ADAPTED for BachataCut — apps/web/lib/progress-stream.ts

/** Pipeline stages surfaced on the "Preparing your Reel" screen. */
export type PrepareStage =
  | 'uploading'
  | 'probing'
  | 'extracting_audio'
  | 'analyzing_music'
  | 'detecting_dancers'
  | 'scoring_moments'
  | 'rendering_previews'
  | 'done';

export interface PrepareEvent {
  type: 'progress' | 'complete' | 'error';
  stage?: PrepareStage;
  /** 0..1 within the current stage. */
  stageProgress?: number;
  /** 0..1 across the whole pipeline. */
  overallProgress?: number;
  /** User-facing copy. Keep it human: "Listening to the music…" */
  message?: string;
  reelIds?: string[];
  error?: string;
}

/** Human-readable labels. Requirement §10: "See clear progress". */
export const STAGE_LABELS: Record<PrepareStage, string> = {
  uploading:          'Uploading your dance…',
  probing:            'Checking the video…',
  extracting_audio:   'Separating the music…',
  analyzing_music:    'Finding the beat…',
  detecting_dancers:  'Looking for both dancers…',
  scoring_moments:    'Choosing your best moments…',
  rendering_previews: 'Polishing your Reels…',
  done:               'Ready',
};

/**
 * Subscribe to a job's progress stream. Reuses the annotator's buffered-reader
 * pattern, adds reconnection so a dropped connection does not lose the job.
 */
export async function subscribeToJob(
  jobId: string,
  onEvent: (event: PrepareEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let attempt = 0;

  while (!signal?.aborted) {
    try {
      const res = await fetch(`/api/jobs/${jobId}/stream`, { signal });
      if (!res.ok) throw new Error(`Stream failed (HTTP ${res.status})`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const records = buffer.split('\n\n');
        buffer = records.pop() || '';

        for (const record of records) {
          const match = record.match(/^data:\s*(.+)$/m);
          if (!match) continue;
          const event = JSON.parse(match[1]) as PrepareEvent;
          onEvent(event);
          if (event.type === 'complete' || event.type === 'error') return;
        }
      }
      // Stream ended without a terminal event → the connection dropped. Retry.
      attempt = 0;
    } catch (err) {
      if (signal?.aborted) return;
      // Exponential backoff, capped. The job keeps running server-side.
      const delay = Math.min(1000 * 2 ** attempt++, 15_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

```ts
// ADAPTED for BachataCut — server side reads job state, does no work itself
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const { jobId } = params;
  const userId = locals.userId; // set by auth middleware

  const job = await db.job.findUnique({ where: { id: jobId! } });
  if (!job || job.ownerId !== userId) {
    return new Response(JSON.stringify({ error: 'Job not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PrepareEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      // Heartbeat comment keeps proxies from closing an idle connection.
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 15_000);

      try {
        for await (const state of watchJob(jobId!)) {  // e.g. Redis pub/sub
          if (state.status === 'failed') {
            send({ type: 'error', error: state.userMessage ?? 'Preparation failed' });
            break;
          }
          if (state.status === 'completed') {
            send({ type: 'complete', reelIds: state.reelIds, overallProgress: 1 });
            break;
          }
          send({
            type: 'progress',
            stage: state.stage,
            stageProgress: state.stageProgress,
            overallProgress: state.overallProgress,
            message: STAGE_LABELS[state.stage],
          });
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // stop nginx buffering the stream
    },
  });
};
```

> **Also reusable: the progress-line regex idea.** The annotator parses `yt-dlp` progress with a named regex constant:
> ```ts
> // SOURCE (verbatim) — the shape to imitate for ffmpeg progress
> const PROGRESS_RE =
>   /\[download\]\s+([\d.]+)%\s+of\s+~?[\d.]+\S*\s+at\s+(\S+)\s+ETA\s+(\S+)/;
> ```
> You will not parse yt-dlp, but you *will* parse ffmpeg. Use `-progress pipe:2 -nostats` with `parseFfmpegProgress` from §5.1 rather than scraping the human-readable `frame= ... time=` line, which changes format between ffmpeg versions.

---

### 7.2 Clamped-region video playback

**Verdict: keep ~140 lines of logic from the 468-line `ClipPreviewPlayer.tsx`. Discard the desktop chrome.**

The reusable idea: play only the region between `inPoint` and `outPoint` inside a longer file, using a plain `<video>` element. This is exactly what BachataCut's Reel preview needs, because the extracted file contains handles (§6.2) that must not appear during playback.

**The four mechanisms worth keeping:**

```ts
// SOURCE (verbatim, condensed from ClipPreviewPlayer.tsx)

// 1. Resolve effective in/out — differs for an extracted file vs the raw source.
const hasExtracted = Boolean(clip.extractedFile);
const inPoint = hasExtracted
  ? (clip.inPoint ?? clip.handleBefore ?? 0)
  : (clip.remotion.fromFrame / fps);
const outPoint = hasExtracted
  ? (clip.outPoint ?? ((clip.handleBefore ?? 0) + clip.remotion.durationInFrames / fps))
  : ((clip.remotion.fromFrame + clip.remotion.durationInFrames) / fps);

// 2. Seek to inPoint once metadata is known (duration is unavailable before this).
const handleLoadedMetadata = () => {
  video.currentTime = inPoint;
  setVideoSize({ width: video.videoWidth || 640, height: video.videoHeight || 360 });
};
video.addEventListener('loadedmetadata', handleLoadedMetadata);

// 3. Clamp on timeupdate — loops the region, and rescues an out-of-range seek.
const handleTimeUpdate = () => {
  if (video.currentTime >= outPoint) video.currentTime = inPoint;
  if (video.currentTime < inPoint) video.currentTime = inPoint;
  onFrameChange?.(Math.max(0, timeToFrame(video.currentTime)));
};

// 4. Convert media time to a clip-relative frame index.
const timeToFrame = (time: number): number => Math.floor((time - inPoint) * fps);
```

And the guard before playing, which prevents starting outside the region:

```ts
// SOURCE (verbatim)
const togglePlayPause = () => {
  if (video.paused) {
    if (video.currentTime < inPoint || video.currentTime >= outPoint) {
      video.currentTime = inPoint;
    }
    video.play().catch(() => { /* ignore autoplay rejection */ });
    setIsPlaying(true);
  } else {
    video.pause();
    setIsPlaying(false);
  }
};
```

That `.catch(() => {})` matters more on mobile than desktop: browsers reject `play()` without a user gesture, and an unhandled rejection would surface as a console error on every autoplay attempt.

**The canvas overlay loop** is reusable if BachataCut shows a beat ribbon:

```ts
// SOURCE (verbatim) — rAF loop only while playing, one final draw when paused
useEffect(() => {
  if (isPlaying) {
    startAnimationLoop();
  } else {
    stopAnimationLoop();
    drawOverlay(); // ensures the paused frame still shows markers
  }
  return () => stopAnimationLoop();
}, [isPlaying, startAnimationLoop, stopAnimationLoop, drawOverlay]);
```

**Discard for BachataCut:** keyboard shortcuts (space / `,` / `.` / arrows) are desktop-annotator affordances; the ~90 lines of inline style objects; the "Not yet extracted" placeholder; and the frame-step buttons. Requirement §5 asks for *"Editing is optional refinement"*, not frame-accurate scrubbing.

```tsx
// ADAPTED for BachataCut — apps/web/components/ReelPlayer.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ReelPlayerProps {
  src: string;
  /** Seconds into `src` where the Reel begins. */
  inPoint: number;
  /** Seconds into `src` where the Reel ends. */
  outPoint: number;
  /** Target aspect for the preview frame. */
  aspect: '9:16' | '1:1' | '16:9';
  loop?: boolean;
  onProgress?: (fraction: number) => void;
}

const ASPECT_CSS: Record<ReelPlayerProps['aspect'], string> = {
  '9:16': '9 / 16',
  '1:1': '1 / 1',
  '16:9': '16 / 9',
};

export const ReelPlayer: React.FC<ReelPlayerProps> = ({
  src, inPoint, outPoint, aspect, loop = true, onProgress,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // Seek to inPoint once metadata is available.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => { video.currentTime = inPoint; };
    video.addEventListener('loadedmetadata', onMeta);
    return () => video.removeEventListener('loadedmetadata', onMeta);
  }, [src, inPoint]);

  // Clamp playback to [inPoint, outPoint]. Verbatim logic from the annotator.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      if (video.currentTime >= outPoint) {
        if (loop) {
          video.currentTime = inPoint;
        } else {
          video.pause();
          video.currentTime = inPoint;
        }
      }
      if (video.currentTime < inPoint) video.currentTime = inPoint;

      const span = outPoint - inPoint;
      if (span > 0) {
        onProgress?.(Math.min(1, Math.max(0, (video.currentTime - inPoint) / span)));
      }
    };
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [inPoint, outPoint, loop, onProgress]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < inPoint || video.currentTime >= outPoint) {
        video.currentTime = inPoint;
      }
      void video.play().catch(() => { /* autoplay rejection is expected on mobile */ });
    } else {
      video.pause();
    }
  }, [inPoint, outPoint]);

  if (failed) {
    return (
      <div className="reel-player reel-player--error" style={{ aspectRatio: ASPECT_CSS[aspect] }}>
        <p>We couldn’t load this Reel.</p>
        <button onClick={() => { setFailed(false); videoRef.current?.load(); }}>Try again</button>
      </div>
    );
  }

  return (
    <div className="reel-player" style={{ aspectRatio: ASPECT_CSS[aspect] }}>
      <video
        ref={videoRef}
        src={src}
        onError={() => setFailed(true)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={toggle}
        playsInline           // REQUIRED: iOS fullscreens video without it
        preload="metadata"    // cheaper than "auto" on mobile data
        muted={false}
        aria-label="Reel preview"
      />
      {!isPlaying && (
        <button className="reel-player__play" onClick={toggle} aria-label="Play Reel">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        </button>
      )}
    </div>
  );
};
```

> **Two mobile fixes the annotator did not need.** `playsInline` is mandatory or iOS Safari takes over the screen on play. And move styling to CSS classes — the annotator's ~90 lines of inline style objects re-allocate on every render and cannot express media queries, which a mobile-first product needs.
>
> **Accessibility note.** The original makes the video itself the click target with `cursor: pointer` and no keyboard affordance. The version above adds a real `<button>` with an `aria-label`, which is what keyboard and screen-reader users need. Full WCAG conformance requires manual testing with assistive technology and expert review; this is a starting point, not a guarantee.

---

### 7.3 Trim control geometry

**Verdict: keep the ~60 lines of percentage math from the 193-line `TrimControls.tsx`. Rewrite the interaction for touch.**

The geometry — mapping handle regions, in/out markers and a playhead onto a single bar — is the reusable part, and it visually communicates the handle concept for free: the dark end zones *are* the extra footage available.

```ts
// SOURCE (verbatim, from TrimControls.tsx) — the geometry
const fps = clip.remotion.fps;
const handleBefore = clip.handleBefore ?? 0;
const handleAfter = clip.handleAfter ?? 0;
const clipDuration = clip.remotion.durationInFrames / fps;
const totalExtractedDuration = handleBefore + clipDuration + handleAfter;

const inPoint = clip.inPoint ?? handleBefore;
const outPoint = clip.outPoint ?? (handleBefore + clipDuration);

// Playhead position expressed in the extracted file's own timeline.
const playheadSeconds = handleBefore + (currentFrame / fps);

const toPercent = (s: number) => (s / totalExtractedDuration) * 100;

const inPercent = toPercent(inPoint);
const outPercent = toPercent(outPoint);
const playheadPercent = toPercent(Math.min(playheadSeconds, totalExtractedDuration));
const handleBeforePercent = toPercent(handleBefore);      // dark zone ends here
const handleAfterStart = toPercent(handleBefore + clipDuration); // dark zone starts here

const activeDuration = outPoint - inPoint;
```

And the nudge clamping, which keeps in/out from crossing:

```ts
// SOURCE (verbatim) — STEP is one frame at 30fps
const STEP = 0.033;

onInPointChange(Math.max(0, inPoint - STEP));                        // earlier
onInPointChange(Math.min(outPoint - STEP, inPoint + STEP));          // later, never past out
onOutPointChange(Math.max(inPoint + STEP, outPoint - STEP));         // earlier, never before in
onOutPointChange(Math.min(totalExtractedDuration, outPoint + STEP)); // later, never past file
```

**Rewrite the interaction.** The original picks whichever marker is nearer to a click:

```ts
// SOURCE (verbatim) — clever on desktop, frustrating on a touch screen
const distToIn = Math.abs(clickedSeconds - inPoint);
const distToOut = Math.abs(clickedSeconds - outPoint);
if (distToIn < distToOut) { onInPointChange(/* ... */); } else { onOutPointChange(/* ... */); }
```

For BachataCut, use explicit draggable handles with a minimum 44×44px touch target, and derive `STEP` from the real fps rather than hardcoding 30:

```ts
// ADAPTED for BachataCut — fps-correct step, explicit drag target
const STEP = 1 / segment.timing.fps;   // one true frame, not an assumed 0.033

export type DragTarget = 'in' | 'out' | null;

/** Convert a pointer x-position within the bar into a time in the extracted file. */
export function pointerToSeconds(
  clientX: number,
  barRect: DOMRect,
  totalExtractedDuration: number,
): number {
  const fraction = (clientX - barRect.left) / barRect.width;
  return Math.min(1, Math.max(0, fraction)) * totalExtractedDuration;
}

/** Apply a drag, enforcing a minimum Reel length and the handle bounds. */
export function applyDrag(
  target: Exclude<DragTarget, null>,
  seconds: number,
  current: { inPoint: number; outPoint: number; totalExtractedDuration: number },
  minDurationSeconds = 3,
): { inPoint: number; outPoint: number } {
  if (target === 'in') {
    return {
      inPoint: Math.max(0, Math.min(seconds, current.outPoint - minDurationSeconds)),
      outPoint: current.outPoint,
    };
  }
  return {
    inPoint: current.inPoint,
    outPoint: Math.min(
      current.totalExtractedDuration,
      Math.max(seconds, current.inPoint + minDurationSeconds),
    ),
  };
}
```

> `minDurationSeconds` is new and product-driven: a 0.5-second Reel is never a good result, so the editor should refuse to create one. The annotator allowed one-frame clips because a labelling tool has no such opinion.

---

### 7.4 Debounced saver with flush-on-shutdown

**Verdict: keep the pattern if you need any local buffering. A real database makes most of it unnecessary.**

The valuable part is not the debounce itself but the **flush-on-shutdown pairing** — a debounced write that is *guaranteed* to land before the process exits.

```ts
// SOURCE (verbatim, condensed from project-service.ts)
export interface DebouncedSaver {
  save(projectFile: ExtendedProjectFile): void;
  saveManifest(manifest: ProjectManifest): void;
  /** Flush any pending save immediately. */
  flush(): Promise<void>;
  /** Cancel any pending save without writing. */
  cancel(): void;
}

export function createDebouncedSaver(projectDir: string, delayMs = 1000): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingProject: ExtendedProjectFile | null = null;
  let pendingManifest: ProjectManifest | null = null;

  async function doSave(): Promise<void> {
    // Clear pending BEFORE awaiting, so a save during the await is not lost.
    const project = pendingProject;
    const manifest = pendingManifest;
    pendingProject = null;
    pendingManifest = null;

    const writes: Promise<void>[] = [];
    if (project) writes.push(saveFullState(projectDir, project));
    if (manifest) writes.push(saveManifest(projectDir, manifest));
    await Promise.all(writes);
  }

  function scheduleFlush(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void doSave().catch((error) => console.error('Failed to persist project state', error));
    }, delayMs);
  }

  return {
    save(projectFile) { pendingProject = projectFile; scheduleFlush(); },
    saveManifest(manifest) { pendingManifest = manifest; scheduleFlush(); },
    async flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      await doSave();
    },
    cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      pendingProject = null;
      pendingManifest = null;
    },
  };
}
```

```ts
// SOURCE (verbatim) — shutdown-handler.ts, the other half of the pairing
export function registerShutdownHandlers(saver: DebouncedSaver): void {
  let isShuttingDown = false;

  const handler = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;   // guard against double-flush
    isShuttingDown = true;
    try {
      await saver.flush();
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Shutdown flush failed (${signal}): ${message}\n`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handler('SIGINT'));
  process.on('SIGTERM', () => void handler('SIGTERM'));
}
```

**Where this still earns its place in BachataCut:** graceful worker shutdown. When a container receives `SIGTERM` during a deploy, an in-flight render should either finish or be requeued — never silently vanish.

```ts
// ADAPTED for BachataCut — apps/worker/lifecycle.ts
export function registerWorkerShutdown(opts: {
  drain: () => Promise<void>;      // stop accepting new jobs, finish current
  requeue: () => Promise<void>;    // hand unfinished work back to the queue
  timeoutMs?: number;
}): void {
  let shuttingDown = false;

  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — draining`);

    const timeout = new Promise<'timeout'>((r) =>
      setTimeout(() => r('timeout'), opts.timeoutMs ?? 25_000),
    );
    const outcome = await Promise.race([opts.drain().then(() => 'drained' as const), timeout]);

    if (outcome === 'timeout') {
      console.warn('[worker] drain timed out — requeueing in-flight work');
      await opts.requeue().catch((e) => console.error('[worker] requeue failed', e));
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void handler('SIGINT'));
  process.on('SIGTERM', () => void handler('SIGTERM'));
}
```

> **Do NOT carry over the annotator's persistence model.** `createDebouncedSaver` rewrites the **entire** `project.json` on every change. That file is already **732 KB for a single video**, because beat grids and energy profiles are serialised inline. With multiple users it is unworkable. Store metadata in a database, arrays like `beat_grid` / `energy_profile` in a blob or a dedicated column, and media in object storage.

---

## 8. Type definitions to keep

Of the 328 lines in `types/index.ts`, keep four interfaces (~35 lines). Everything else is annotation-domain or YouTube-specific.

```ts
// SOURCE (verbatim, the keepers) → packages/dance-core/types.ts

/** Output of the Python analyzer, camelCase. */
export interface AudioAnalysisResult {
  detectedBpm: number;
  bpmConfidence: number;
  downbeatOffsetSeconds: number;
  beatGrid: number[];         // timestamps in seconds
  beatGridFrames: number[];   // frame numbers
  energyProfile: number[];    // RMS values per hop
}

/** One bachata cycle (default 8 beats). */
export interface Cycle {
  cycleNumber: number;
  startBeatIndex: number;
  endBeatIndex: number;
  startFrame: number;
  endFrame: number;
  startTimestamp: number;
  endTimestamp: number;
}

/** A group of consecutive cycles (16- or 32-count). */
export interface Phrase {
  phraseNumber: number;
  cycles: Cycle[];
  startFrame: number;
  endFrame: number;
}

/** The full grouping returned by buildCycles. */
export interface CycleHierarchy {
  cycles8: Cycle[];    // base cycles at the requested beatsPerCycle
  phrases16: Phrase[]; // 16-count musical phrases
  phrases32: Phrase[]; // 32-count extended phrases
}
```

> **Naming wart to fix on copy.** `CycleHierarchy.cycles8` holds cycles at *whatever* `beatsPerCycle` was requested, not necessarily 8. Rename to `cycles` in BachataCut. This is a real trap: `clip-manager.ts` in the annotator re-derives the actual size at runtime with `allCycles[0].endBeatIndex - allCycles[0].startBeatIndex + 1` precisely because the field name lies.

**New types BachataCut needs** (no annotator equivalent):

```ts
// ADAPTED for BachataCut — packages/dance-core/types.ts

export interface ClipTiming {
  fromFrame: number;
  durationInFrames: number;
  fps: number;
}

/** The three named suggestions from requirement §6. */
export type SuggestionKind = 'most_impressive' | 'best_musicality' | 'best_connection';

export interface ReelCandidate {
  candidateId: string;
  videoId: string;
  kind: SuggestionKind;
  timing: ClipTiming;
  /** 0..1 — combined score used for ranking within a kind. */
  score: number;
  /** Per-signal breakdown, for debugging and for explanations. */
  signals: Record<string, number>;
  /**
   * Human-readable justification shown in the UI. Requirement §6:
   * "Both dancers stay clearly visible through this turn sequence."
   */
  reason: string;
  beatMarkerFrames: number[];
}
```

---

## 9. Known bugs — do NOT copy these

Three defects found while reading the annotator. They are documented here so they are not faithfully reproduced.

### 9.1 Export is not frame-accurate (real functional bug)

```ts
// SOURCE — export-service.ts. THIS IS BROKEN. Do not copy.
await execFile('ffmpeg', [
  '-y',
  '-ss', String(trimRange.seekPosition),
  '-t', String(trimRange.duration),
  '-i', extractedFile,
  '-c', 'copy',          // ← the bug
  outputPath,
]);
```

`-c copy` with input seeking cuts at the nearest **preceding keyframe**, not at `seekPosition`. The extracted files are encoded with only one forced keyframe at frame 0 (`-force_key_frames '0'`), so in the common case where `inPoint = handleBefore = 1.0s`, ffmpeg snaps back to frame 0 and **the exported clip still contains the handle footage that was supposed to be trimmed away.**

The irony: `clip-extraction-service.ts` deliberately re-encodes to get accurate starts, and the export step throws that accuracy away.

```ts
// ADAPTED for BachataCut — re-encode so the cut lands where the user asked
export async function renderTrimmed(
  inputPath: string,
  range: TrimRange,
  outputPath: string,
): Promise<void> {
  const args = [
    '-y',
    '-ss', range.seekPosition.toFixed(4),
    '-i', inputPath,
    '-t', range.duration.toFixed(4),
    '-c:v', 'libx264',
    '-preset', 'medium',      // final deliverable: better than 'fast'
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outputPath,
  ];
  const { stderr, code } = await runProcess('ffmpeg', args, {
    timeoutMs: 5 * 60_000,
    timeoutMessage: `ffmpeg timed out rendering ${outputPath}`,
  });
  if (code !== 0) throw new Error(`ffmpeg render failed: ${stderr.slice(-500)}`);
}
```

BachataCut must re-encode anyway for vertical reframing and polish, so this resolves itself — provided you do not copy the `-c copy` shortcut.

### 9.2 Incomplete subprocess consolidation

`process-utils.ts` was created to unify subprocess handling and its own doc comment names ingestion, audio analysis, and clip extraction as adopters. But `export-service.ts` still hand-rolls `execFile`. When you port, route **everything** through `runProcess`.

### 9.3 Duplicated helpers

`getNestedValue` is implemented identically in both `schema-validator.ts` and `annotation-service.ts`, and `isEmptyValue`/`isFilledValue` are inverses of each other in the two files. Both live in code you are deleting, so this matters only as a caution: hoist shared helpers into one module in the new codebase.

### 9.4 Minor: fractional bars

```ts
// SOURCE — annotation-service.ts. bars_total ends up non-integer.
if (clip.beats_total && clip.beats_total > 0) {
  clip.bars_total = clip.beats_total / 4;   // 30 beats → 7.5 bars
}
```

Being deleted with the annotation service, but if you compute musical bars anywhere, round or track the remainder.

---

## 10. Worked example: "Best musicality" from reused primitives

This section is the payoff. It shows that **one of BachataCut's three headline suggestions is achievable today**, with no computer vision, by composing the artifacts above.

Requirement §6 defines *Best musicality* as "a moment where the movement and music work especially well together." You cannot assess *movement* without vision — but you can assess the **music** side completely, and select moments that are musically strong and phrase-aligned. That is a genuine, shippable differentiator over generic auto-trim tools.

### 10.1 Energy profile helpers

```ts
// NEW (composition) — packages/dance-core/energy.ts
import { ENERGY_HOP_SECONDS, energyIndexForTime } from './analyzer-contract.js';

/** Mean RMS energy over a time window. */
export function meanEnergy(energyProfile: number[], startSeconds: number, endSeconds: number): number {
  const from = energyIndexForTime(startSeconds);
  const to = Math.min(energyIndexForTime(endSeconds), energyProfile.length);
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += energyProfile[i] ?? 0;
  return sum / (to - from);
}

/** Standard deviation of energy — a proxy for musical dynamics. */
export function energyVariation(energyProfile: number[], startSeconds: number, endSeconds: number): number {
  const from = energyIndexForTime(startSeconds);
  const to = Math.min(energyIndexForTime(endSeconds), energyProfile.length);
  if (to - from < 2) return 0;
  const mean = meanEnergy(energyProfile, startSeconds, endSeconds);
  let acc = 0;
  for (let i = from; i < to; i++) {
    const d = (energyProfile[i] ?? 0) - mean;
    acc += d * d;
  }
  return Math.sqrt(acc / (to - from));
}

/**
 * Detect whether a window *builds* (energy rises across it).
 * Returns a signed slope normalised by the window's mean.
 * A build-up into a phrase end is what makes a moment feel resolved.
 */
export function energySlope(energyProfile: number[], startSeconds: number, endSeconds: number): number {
  const from = energyIndexForTime(startSeconds);
  const to = Math.min(energyIndexForTime(endSeconds), energyProfile.length);
  const n = to - from;
  if (n < 4) return 0;

  // Least-squares slope over the index range, then normalise.
  const meanX = (n - 1) / 2;
  const mean = meanEnergy(energyProfile, startSeconds, endSeconds);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * ((energyProfile[from + i] ?? 0) - mean);
    den += dx * dx;
  }
  if (den === 0 || mean <= 0) return 0;
  return (num / den) / mean;
}

/** Global energy percentile of a window — is this loud *for this song*? */
export function energyPercentile(energyProfile: number[], windowMean: number): number {
  if (energyProfile.length === 0) return 0;
  let below = 0;
  for (const v of energyProfile) if (v < windowMean) below++;
  return below / energyProfile.length;
}

/** Is the window near-silent? Used to reject pre-dance and post-dance dead air. */
export function isNearSilent(energyProfile: number[], startSeconds: number, endSeconds: number): boolean {
  return meanEnergy(energyProfile, startSeconds, endSeconds) < 0.02;
}

export { ENERGY_HOP_SECONDS };
```

### 10.2 Candidate generation and scoring

```ts
// NEW (composition) — packages/dance-core/musicality.ts
import { buildCycles, findDownbeatIndex } from './cycles.js';
import {
  energyPercentile, energySlope, energyVariation, isNearSilent, meanEnergy,
} from './energy.js';
import type { AudioAnalysisResult, Cycle, ReelCandidate } from './types.js';

export interface MusicalityOptions {
  /** Cycles per candidate window. 4 × 8 beats = 32 beats ≈ 15s at 129 BPM. */
  cyclesPerWindow?: number;
  /** Step in cycles between candidate windows. 1 = maximum overlap. */
  strideCycles?: number;
  /** Ignore the first N seconds (walking on, settling). */
  leadInSeconds?: number;
  /** Ignore the last N seconds (walking off, applause). */
  leadOutSeconds?: number;
  /** Minimum seconds between two returned candidates, to avoid near-duplicates. */
  minSeparationSeconds?: number;
}

const DEFAULTS: Required<MusicalityOptions> = {
  cyclesPerWindow: 4,
  strideCycles: 1,
  leadInSeconds: 8,
  leadOutSeconds: 5,
  minSeparationSeconds: 10,
};

interface ScoredWindow {
  cycles: Cycle[];
  startSeconds: number;
  endSeconds: number;
  score: number;
  signals: Record<string, number>;
}

/**
 * Generate musically-scored candidate windows for a recording.
 *
 * Composes: buildCycles (§5.2) + findDownbeatIndex (§5.2) + energy helpers (§10.1).
 * No computer vision required — this is shippable now.
 */
export function scoreMusicalWindows(
  analysis: AudioAnalysisResult,
  durationSeconds: number,
  fps: number,
  options: MusicalityOptions = {},
): ScoredWindow[] {
  const opts = { ...DEFAULTS, ...options };

  // 1. Build the phrase grid from the beat grid (reused verbatim).
  const downbeatIndex = findDownbeatIndex(analysis.beatGrid, analysis.downbeatOffsetSeconds);
  const hierarchy = buildCycles(analysis.beatGridFrames, analysis.beatGrid, downbeatIndex, 8);
  const cycles = hierarchy.cycles8;
  if (cycles.length < opts.cyclesPerWindow) return [];

  const usableStart = opts.leadInSeconds;
  const usableEnd = Math.max(0, durationSeconds - opts.leadOutSeconds);

  const windows: ScoredWindow[] = [];

  // 2. Slide a phrase-aligned window across the recording.
  for (let i = 0; i + opts.cyclesPerWindow <= cycles.length; i += opts.strideCycles) {
    const group = cycles.slice(i, i + opts.cyclesPerWindow);
    const startSeconds = group[0].startTimestamp;
    const endSeconds = group[group.length - 1].endTimestamp;

    // Reject the awkward edges (requirement §6: avoid before/after dancing).
    if (startSeconds < usableStart || endSeconds > usableEnd) continue;
    if (isNearSilent(analysis.energyProfile, startSeconds, endSeconds)) continue;

    // 3. Score the musical signals.
    const mean = meanEnergy(analysis.energyProfile, startSeconds, endSeconds);
    const variation = energyVariation(analysis.energyProfile, startSeconds, endSeconds);
    const slope = energySlope(analysis.energyProfile, startSeconds, endSeconds);
    const percentile = energyPercentile(analysis.energyProfile, mean);

    // Dynamics: some variation is musical; too much is a recording problem.
    const dynamics = mean > 0 ? Math.min(1, variation / mean / 0.6) : 0;
    // A gentle build reads as "going somewhere". Reward positive slope mildly.
    const build = Math.min(1, Math.max(0, slope * 2 + 0.5));
    // Beat regularity for the whole track gates how much we trust any of this.
    const confidence = Math.min(1, Math.max(0, analysis.bpmConfidence));

    const signals = { energyPercentile: percentile, dynamics, build, bpmConfidence: confidence };

    // Weighted sum. Tune these against real user selections once you have data.
    const score =
      0.40 * percentile +
      0.25 * dynamics +
      0.20 * build +
      0.15 * confidence;

    windows.push({ cycles: group, startSeconds, endSeconds, score, signals });
  }

  return windows.sort((a, b) => b.score - a.score);
}

/**
 * Pick the top N windows while enforcing separation, so the user is never shown
 * three near-identical suggestions (requirement §6: avoid duplicates).
 */
export function selectDiverse(windows: ScoredWindow[], count: number, minSeparationSeconds: number): ScoredWindow[] {
  const chosen: ScoredWindow[] = [];
  for (const w of windows) {
    const tooClose = chosen.some(
      (c) => Math.abs(c.startSeconds - w.startSeconds) < minSeparationSeconds,
    );
    if (!tooClose) chosen.push(w);
    if (chosen.length === count) break;
  }
  return chosen;
}

/** Build the user-facing candidate, including the explanation string. */
export function toMusicalityCandidate(
  window: ScoredWindow,
  videoId: string,
  fps: number,
  beatGridFrames: number[],
): ReelCandidate {
  const fromFrame = window.cycles[0].startFrame;
  const endFrame = window.cycles[window.cycles.length - 1].endFrame;

  return {
    candidateId: `${videoId}_mus_${fromFrame}`,
    videoId,
    kind: 'best_musicality',
    timing: { fromFrame, durationInFrames: endFrame - fromFrame + 1, fps },
    score: window.score,
    signals: window.signals,
    reason: explainMusicality(window),
    // Reuse §5.3's coordinate translation: markers relative to clip start.
    beatMarkerFrames: beatGridFrames
      .filter((f) => f >= fromFrame && f <= endFrame)
      .map((f) => f - fromFrame),
  };
}

/**
 * Produce the short human-readable reason required by §6.
 * Deliberately plain language — never expose signal names to users.
 */
function explainMusicality(window: ScoredWindow): string {
  const { build, dynamics, energyPercentile: pct } = window.signals;
  const beats = window.cycles.length * 8;

  if (build > 0.7) return `The music builds through this ${beats}-count phrase and resolves on the last beat.`;
  if (dynamics > 0.7) return `This ${beats}-count phrase has the strongest light-and-shade in the song.`;
  if (pct > 0.8) return `One of the most energetic passages in the song, and it lands on a full ${beats}-count phrase.`;
  return `A complete ${beats}-count musical phrase with a clean start and finish.`;
}
```

### 10.3 Wiring it into the pipeline

```ts
// NEW (composition) — apps/worker/jobs/prepare-reels.ts
import { probeUpload, validateUpload } from '@bachatacut/media-core/probe';
import { extractSegments } from '@bachatacut/media-core/extract';
import { analyzeAudio } from '@bachatacut/dance-core/analyzer';
import {
  scoreMusicalWindows, selectDiverse, toMusicalityCandidate,
} from '@bachatacut/dance-core/musicality';
import { runProcess } from '@bachatacut/media-core/process';

export async function prepareReels(job: { videoId: string; localPath: string; workDir: string }) {
  const report = (stage: string, p: number) => publishProgress(job.videoId, stage, p);

  // 1. Probe (§6.1)
  report('probing', 0);
  const probe = await probeUpload(job.localPath);
  const rejection = validateUpload(probe);
  if (rejection) throw new UserFacingError(rejection.code, rejection.userMessage);

  // 2. Extract a WAV for analysis (§5.1 + ffmpeg)
  report('extracting_audio', 0);
  const wavPath = `${job.workDir}/audio.wav`;
  const { code, stderr } = await runProcess(
    'ffmpeg',
    ['-y', '-i', job.localPath, '-vn', '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', wavPath],
    { timeoutMs: 5 * 60_000, timeoutMessage: 'Audio extraction timed out' },
  );
  if (code !== 0) throw new Error(`Audio extraction failed: ${stderr.slice(-500)}`);

  // 3. Beat / BPM / energy analysis (§6.4 → Python beat_this)
  report('analyzing_music', 0);
  const analysis = await analyzeAudio(wavPath, probe.fps, { cwd: process.env.ANALYZER_DIR! });

  // 4. Musicality candidates — REUSED CODE ONLY, no vision yet (§10.2)
  report('scoring_moments', 0);
  const windows = scoreMusicalWindows(analysis, probe.durationSeconds, probe.fps);
  const picked = selectDiverse(windows, 3, 10);
  const candidates = picked.map((w) =>
    toMusicalityCandidate(w, job.videoId, probe.fps, analysis.beatGridFrames),
  );

  // 5. Extract each candidate with handles so trimming stays instant (§6.2)
  report('rendering_previews', 0);
  const extracted = await extractSegments(
    candidates.map((c) => ({
      segmentId: c.candidateId,
      startSeconds: c.timing.fromFrame / c.timing.fps,
      durationSeconds: c.timing.durationInFrames / c.timing.fps,
    })),
    {
      sourceVideoPath: job.localPath,
      outputDir: `${job.workDir}/segments`,
      sourceDurationSeconds: probe.durationSeconds,
      handleSeconds: 1.5,
    },
    2,
    (done, total) => report('rendering_previews', done / total),
  );

  report('done', 1);
  return { candidates, extracted, analysis, probe };
}
```

**What this delivers with zero new ML:** phrase-aligned, energy-ranked, de-duplicated candidate Reels with human-readable reasons, extracted with adjustable handles and beat markers ready for the editor overlay.

**What it still cannot do:** decide whether both dancers are visible, whether the couple is nicely framed, or whether a moment is *impressive*. Those need `vision-core`, which is 100% new work. When it exists, the composition changes only in step 4 — the vision signals join the same weighted score, and `most_impressive` / `best_connection` become additional `SuggestionKind`s using the same window machinery.

> **Honest caveat on the weights.** The coefficients in `scoreMusicalWindows` (0.40 / 0.25 / 0.20 / 0.15) are a starting hypothesis, not a tuned model. Requirement §6 includes feedback controls — *More like this*, *Not my best moment* — and those events are exactly the training signal needed to replace hand-tuned weights with a learned ranker. Log the full `signals` object alongside every user choice from day one; that data is expensive to backfill.

---

## 11. Delete list and why

**~4,400 lines (72%).** Recorded so nobody re-adds them out of misplaced thrift.

### 11.1 The annotation domain (~1,546 lines)

| File | Lines | Why it goes |
|---|---|---|
| `services/annotation-service.ts` | 296 | CRUD + completeness scoring for a 40-field labelling schema |
| `services/schema-validator.ts` | 192 | Validates required annotation fields |
| `services/required-fields.ts` | 18 | The 10 required dot-paths |
| `types/enums.ts` | 191 | 22 controlled vocabularies (`hold`, `weight_foot`, `hammerlock`, `hiprolls`…) |
| `types/index.ts` (most) | ~290 | `ClipAnnotation`, `DancerState`, `TrimProfile`, `MotionProfile`, `CameraProfile`, `QualityProfile` |
| `components/AnnotationForm.tsx` | 54 | Form shell |
| `components/annotation/*` (7 files) | 795 | Identity, Phrasing, Trim, Motion, Camera/Quality, EntryExit, FieldWrapper |

A BachataCut user never labels a dance. Requirement §11 explicitly excludes "dance scoring, correction or coaching."

> **Strategic exception worth preserving.** Do not delete the *vocabulary* from your organisation's knowledge — only from the product. `types/enums.ts` plus `CameraProfile`/`QualityProfile` (`visibility_score`, `occlusion_score`, `boundary_cleanliness`, `teaching_clarity`, `stitchability`) read almost exactly like the **label set you would need to train** the models behind `most_impressive` and `best_connection`.
>
> The pragmatic move: **keep the annotator alive as an internal labelling tool** that produces training data for BachataCut. It is a poor product foundation but a good data factory. Copy `types/enums.ts` into the annotator's own repo and let it live there.

### 11.2 The local single-user architecture (~950 lines)

| File | Lines | Why it goes |
|---|---|---|
| `services/app-state.ts` | 239 | One global mutable singleton, in-memory `Map`s, `process.cwd()` as data dir. No user or tenant concept |
| `services/project-service.ts` (most) | ~130 | Whole-project-in-one-JSON; `computeManifest` is annotation-specific |
| API routes except media (~14 files) | ~700 | Assume the singleton, run ffmpeg inline, no auth |

The killer detail: `project.json` is **732 KB for one video** and is rewritten in full on every edit. Multi-tenancy is not a refactor of this design; it is a different design.

### 11.3 Wrong-problem logic (~271 lines)

| File | Lines | Why it goes |
|---|---|---|
| `services/clip-manager.ts` | 234 | `createClips` exhaustively tiles the whole video into uniform N-beat clips. BachataCut selects three. `mergeClips`/`splitClip` are labelling-grid operations |
| `services/url-validator.ts` | 37 | YouTube URL parsing; BachataCut uploads from device. Also a rights problem — §9 of the requirements is explicit about *authorized* recordings |

`clip-manager.ts` also carries a dead compatibility branch: `generate.ts` already builds cycles at the requested size, so the `cyclesPerClip` regrouping path is unreachable in production and only exercised by tests.

### 11.4 The annotator UI shell (~739 lines)

| File | Lines | Why it goes |
|---|---|---|
| `components/ReviewApp.tsx` | 440 | Three-pane desktop grid (`280px 1fr 340px`), keyboard-driven, annotation-centric |
| `components/ClipGrid.tsx` | 63 | Grid of every clip in the video |
| `components/ClipCard.tsx` | 71 | Per-clip completeness badge |
| `components/ClipControls.tsx` | 84 | Discard / merge / split |
| `components/VideoGroup.tsx` | 81 | Collapsible source grouping |

BachataCut's equivalent screens (§10: Home, Upload, Preparing, Your best moments, Reel editor) are mobile-first and show **three** results, not hundreds. Different information architecture entirely.

### 11.5 The 477-line ingestion service, minus `ffprobe`

Keep `ffprobe` (§6.1). Delete the rest: `spawnYtDlp`, `fetchVideoInfo`, `downloadVideo`, `extractAudio`, `classifyYtDlpError`, and the `download` generator — roughly 367 lines of YouTube-specific machinery.

The `classifyYtDlpError` **pattern** (mapping raw subprocess stderr to a user-facing message) is worth imitating for ffmpeg failures, even though its specific cases — age-restricted, private video — are irrelevant:

```ts
// ADAPTED for BachataCut — the pattern, applied to upload failures
export function classifyFfmpegError(stderr: string): { code: string; userMessage: string } {
  if (/moov atom not found|Invalid data found/i.test(stderr)) {
    return { code: 'CORRUPT', userMessage: 'This video file looks damaged. Try uploading it again.' };
  }
  if (/No such file or directory/i.test(stderr)) {
    return { code: 'MISSING', userMessage: 'We lost track of your upload. Please try again.' };
  }
  if (/Unsupported codec|Decoder .* not found/i.test(stderr)) {
    return { code: 'UNSUPPORTED', userMessage: 'This video format isn’t supported yet. MP4 or MOV work best.' };
  }
  return { code: 'UNKNOWN', userMessage: 'Something went wrong preparing this video.' };
}
```

---

## 12. Migration checklist

Ordered so nothing depends on work that has not happened yet.

### Phase 1 — Lift the pure code (about a day)

- [ ] Create `packages/media-core` and `packages/dance-core` with strict TS config (`strict: true`, `noUncheckedIndexedAccess: true`)
- [ ] Copy `process-utils.ts` → `media-core/process.ts`; add `runProcessStreaming` + `parseFfmpegProgress` (§5.1)
- [ ] Copy `cycle-builder.ts` → `dance-core/cycles.ts`; drop `recomputeWithDownbeat`; add `findDownbeatIndex` and `snapToCycleStart` (§5.2)
- [ ] Copy `beat-marker-utils.ts` → `dance-core/beat-markers.ts`; rename `remotion` → `timing` (§5.3)
- [ ] Copy `slug-utils.ts` → `shared/slug.ts`; add Unicode normalisation (§5.4)
- [ ] Copy the 4 keeper interfaces → `dance-core/types.ts`; rename `cycles8` → `cycles` (§8)
- [ ] Verify: `media-core` and `dance-core` import nothing from `apps/`

### Phase 2 — Extract the media plumbing (2–3 days)

- [ ] Extract `ffprobe` → `media-core/probe.ts`; add `probeUpload` + `validateUpload` (§6.1)
- [ ] Extract handle math + ffmpeg args → `media-core/extract.ts`; replace the serial generator with `extractSegments` (§6.2)
- [ ] Extract `resolveRange` → `media-core/range.ts` as a pure function (§6.3)
- [ ] Extract the analyzer contract → `dance-core/analyzer-contract.ts`; add the DSP constants and `isPythonAnalyzerOutput` (§6.4)
- [ ] Extract `computeTrimRange` → `media-core/trim.ts`; **write `renderTrimmed` with re-encoding, not `-c copy`** (§6.5, §9.1)
- [ ] Confirm every subprocess call goes through `runProcess` (§9.2)

### Phase 3 — Port the analyzer as a service (2–3 days)

- [ ] Move `analyzer/` (Python) across unchanged; keep `pyproject.toml` + `uv.lock`
- [ ] Replace per-request CLI spawns with a worker that holds the `beat_this` checkpoint in memory
- [ ] Assert the DSP constants match `analyze.py` (`sr=22050`, `hop=512`, `frame=2048`) — add a test that fails loudly if they drift
- [ ] Raise the analysis timeout well above 60s for CPU inference
- [ ] Gate musicality suggestions on `bpmConfidence`

### Phase 4 — Build what does not exist (the real work)

- [ ] Multi-tenant data model: users, videos, jobs, candidates, exports. **Not** one JSON file
- [ ] Object storage + signed URLs; never a path-based media endpoint (§6.3)
- [ ] Job queue + worker; no ffmpeg or ML in a request handler
- [ ] Auth on every route
- [ ] SSE job-progress endpoint + `subscribeToJob` (§7.1)
- [ ] `ReelPlayer` with `playsInline` and CSS classes (§7.2)
- [ ] `TrimSlider` with touch drag and `minDurationSeconds` (§7.3)
- [ ] `dance-core/energy.ts` + `musicality.ts` (§10) → ship "Best musicality"
- [ ] `vision-core`: detection, couple identification, quality scoring, framing (100% new — the bulk of the schedule)

### Do-not-do list

- [ ] Do **not** port `app-state.ts` or any global singleton
- [ ] Do **not** port `project.json` whole-file persistence
- [ ] Do **not** port the annotation schema into the product
- [ ] Do **not** port `clip-manager.ts` tiling
- [ ] Do **not** copy `-c copy` into any trimming path (§9.1)
- [ ] Do **not** expose a path-based media endpoint to authenticated users
- [ ] Do **not** commit runtime state to git (the annotator tracks a 732 KB `project.json`)

---

## 13. Test assets worth carrying over

The annotator has **34 property-based tests** (`fast-check`) and **13 unit test files**. Most validate the annotation schema and are deleted with it. These carry:

| Test | Carries? | Why |
|---|---|---|
| `cycle-builder.prop.test.ts` | **Yes** | Cycle grouping invariants — directly guards `dance-core/cycles.ts` |
| `cycle-hierarchy.prop.test.ts` | **Yes** | 8/16/32 phrase relationships |
| `frame-conversion.prop.test.ts` | **Yes** | Frame↔time round-tripping; critical with fractional fps |
| `beatgrid-shift.prop.test.ts` | **Yes** | `shiftBeatGrid` correctness |
| `beat-frame-preservation.prop.test.ts` | **Yes** | Beat frames survive transformation |
| `beat-marker-recomputation.prop.test.ts` | **Yes** | Guards `recomputeBeatMarkers` coordinate translation |
| `beat-frame-space.prop.test.ts` | **Yes** | Absolute vs clip-relative frame spaces |
| `slugify.prop.test.ts` | **Yes** | Extend with accented input once you add normalisation |
| `duration-calc.prop.test.ts` | Partly | Keep the frame/fps arithmetic assertions |
| `export-trim-range.prop.test.ts` | Partly | Keep `computeTrimRange`; rewrite expectations after the §9.1 fix |
| `clip-invariants.prop.test.ts` | Partly | Non-negative frames, positive duration — reframe for `ReelCandidate` |
| `validation-*.prop.test.ts` (8 files) | No | Annotation schema |
| `annotation-completeness.prop.test.ts`, `completeness.prop.test.ts` | No | Completeness scoring |
| `clip-grouping.prop.test.ts`, `clip-creation.prop.test.ts`, `clip-id.prop.test.ts` | No | Exhaustive tiling |
| `merge-split.prop.test.ts` | No | Labelling-grid operations |
| `remotion-derivation.prop.test.ts` | No | Dual-source-of-truth reconciliation that should not exist |
| `manifest.prop.test.ts`, `serialization-roundtrip.prop.test.ts`, `import-validation.prop.test.ts` | No | `project.json` persistence |
| `export-naming/-sidecar/-schema/-filter` | No | Annotation sidecars |
| `url-validation.prop.test.ts` | No | YouTube URLs |
| `subprocess-pipelines.test.ts` (integration) | **Yes, as a template** | Gated by `INTEGRATION=1`; adapt to verify ffmpeg/ffprobe/analyzer wiring in CI |

**New properties worth asserting in BachataCut:**

```ts
// NEW — the invariants that actually matter for the product
// packages/dance-core/__tests__/musicality.prop.test.ts
import fc from 'fast-check';

// 1. Candidates always start on a cycle boundary (count 1).
//    This is the whole point of reusing buildCycles.
// 2. Candidates never overlap the lead-in / lead-out exclusion zones.
// 3. Selected candidates respect minSeparationSeconds (no near-duplicates, §6).
// 4. Beat markers are always within [0, durationInFrames).
// 5. Handle clamping never yields a negative handle, for any
//    (clipStart, clipDuration, sourceDuration) triple — including clips that
//    touch t=0 or the exact end of the source.
// 6. resolveRange never returns start > end, and never exceeds size - 1,
//    for arbitrary header strings including malformed and hostile input.
```

Property 5 and 6 are the highest-value ones: they cover exactly the boundary arithmetic that produced the bugs in §9.

---

## Appendix A — Reuse summary

| Category | Lines | Verdict |
|---|---:|---|
| **Tier A** — copy as-is | 317 | `process-utils`, `cycle-builder`, `beat-marker-utils`, `slug-utils` |
| **Tier B** — extract core | ~330 | `ffprobe`, handle extraction, Range parsing, analyzer contract, `computeTrimRange` |
| Type definitions | ~35 | `AudioAnalysisResult`, `Cycle`, `Phrase`, `CycleHierarchy` |
| **Tier C** — patterns | ~200 | SSE progress, clamped playback, trim geometry, debounced flush |
| **Tier D** — delete | ~4,400 | Annotation domain, singleton architecture, tiling, annotator UI |
| **Total non-test TS** | **6,149** | **Reusable: ~700–880 (11–14%)** |

**Highest-value single artifact:** `cycle-builder.ts` (101 lines). It converts a beat grid into bachata phrase boundaries, which is what makes a cut feel intentional. Combined with the Python analyzer it is the entire foundation of "Best musicality" and the only piece of BachataCut's product intelligence that already exists.

**The honest framing:** ~800 lines is a couple of days of lifting. Reuse is not where BachataCut's risk lives. The schedule is dominated by `vision-core` — couple detection, tracking, quality assessment and framing — which is 0% written and is the actual product differentiator. This document exists so that the two days are not spent twice, and so the solved problems (rational frame rates, keyframe-accurate cuts, byte ranges, phrase alignment, handle-based trimming) stay solved.

---

*Document generated from a full end-to-end read of `annotator_bachata` at commit-time state: 50 non-test TypeScript files, 6,149 lines, plus `analyzer/analyze.py`. All `SOURCE (verbatim)` blocks are exact copies; all `ADAPTED` and `NEW` blocks are proposals for the target architecture and have not been executed against a BachataCut codebase.*
