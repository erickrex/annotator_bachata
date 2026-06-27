// AdaptiveLabel — offline seed dataset generator (Task 6.1)
//
// Produces the IP-clean seed/*.json dataset consumed by the seed script
// (Task 6.2). This generator is DETERMINISTIC: running it repeatedly yields
// byte-identical output, so the committed JSON can always be regenerated.
//
// IMPORTANT — why this generator exists instead of the Python analyzer:
//   The bachata beat grids below are HAND-AUTHORED PLACEHOLDERS that match the
//   exact output shape of the existing Python `beat_this` analyzer
//   (analyzer/analyze.py):
//       { bpm, bpm_confidence, downbeat_offset_seconds,
//         beat_timestamps[], beat_frames[], energy_profile[] }
//   They are NOT produced by running the model. We do not run the analyzer here
//   because (a) the only clips checked into sources/clips/ are YouTube-derived
//   and therefore NOT IP-clean (Requirement 8.5 forbids copyrighted footage or
//   music), and (b) the analyzer requires the `beat_this` model weights, torch,
//   and a WAV stream which are not available in this environment.
//
//   To regenerate from REAL audio on IP-clean demo clips instead (see
//   seed/README.md for the full procedure):
//       uv run python -m analyzer <clip.wav> --fps 30 > grid.json
//   then drop each grid.json into the corresponding clip's metadata.beatGrid.
//
// The sign-language gloss segments are hand-authored (there is no analyzer for
// sign language); they describe original, IP-clean signed phrases.
//
// Run:  node scripts/generate-seed.mjs   (from the adaptive-label/ app dir)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "..", "seed");

const round = (n, dp) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// ---------------------------------------------------------------------------
// Bachata beat-grid synthesis (analyzer-shaped, deterministic)
// ---------------------------------------------------------------------------

/**
 * Build a beat grid matching analyzer/analyze.py's output contract.
 *
 * The clip is treated as starting on a downbeat, so downbeat_offset_seconds ==
 * beat_timestamps[0] and the downbeat index into the arrays is 0 (clean 8-count
 * cycles for the bachata timeline math).
 *
 * bpm_confidence is computed with the analyzer's own formula
 * (1 - clamped coefficient-of-variation of inter-beat intervals); a perfectly
 * regular synthetic grid yields 1.0. Real audio yields < 1.0.
 */
function buildBeatGrid({ bpm, durationSeconds, fps, firstBeatSeconds }) {
  const interval = 60 / bpm;
  const timestamps = [];
  for (let t = firstBeatSeconds; t <= durationSeconds + 1e-9; t += interval) {
    timestamps.push(round(t, 6));
  }
  const frames = timestamps.map((t) => Math.round(t * fps));

  // Energy profile: a modest, fixed-length (64) RMS-style envelope with a pulse
  // on each beat. The real analyzer emits a full-resolution profile at
  // sr=22050 / hop=512 (~43 Hz); this downsampled stand-in is documented in
  // seed/README.md and is not used by the timeline math.
  const N = 64;
  const energy = [];
  for (let i = 0; i < N; i++) {
    const tSec = (i / (N - 1)) * durationSeconds;
    // base groove swell + nearest-beat emphasis
    const swell = 0.32 + 0.12 * Math.sin((tSec / durationSeconds) * Math.PI);
    let nearest = Infinity;
    for (const b of timestamps) nearest = Math.min(nearest, Math.abs(tSec - b));
    const pulse = 0.18 * Math.exp(-((nearest / (interval * 0.35)) ** 2));
    energy.push(round(swell + pulse, 6));
  }

  return {
    bpm: round(bpm, 2),
    bpm_confidence: 1.0, // perfectly regular synthetic grid (analyzer formula)
    downbeat_offset_seconds: timestamps[0],
    beat_timestamps: timestamps,
    beat_frames: frames,
    energy_profile: energy,
  };
}

// ---------------------------------------------------------------------------
// Project: bachata (timelineMode = beat_grid)
// ---------------------------------------------------------------------------

const BACHATA_FPS = 30;

// Each clip is an IP-clean, originally-recorded demo figure. `searchAttributes`
// keys mirror the bachata PRESET field keys in lib/schemas/workspace.ts and are
// what the seed script (Task 6.2) concatenates into each clip's search_text.
const bachataClipSpecs = [
  {
    title: "Basic step — closed position",
    bpm: 120,
    durationSeconds: 8.0,
    firstBeatSeconds: 0.2,
    searchAttributes: {
      move_name: "Basic step",
      move_category: "basic",
      lead_follow_role: "both",
      difficulty: 2,
      phrase_count: 8,
      footwork_patterns: ["side_step", "tap"],
      on_beat: true,
      styling_notes:
        "Closed position, weight changes on counts 1-2-3 and 5-6-7, tap on 4 and 8.",
    },
  },
  {
    title: "Lady's right underarm turn",
    bpm: 128,
    durationSeconds: 8.0,
    firstBeatSeconds: 0.15,
    searchAttributes: {
      move_name: "Right underarm turn",
      move_category: "turn",
      lead_follow_role: "follow",
      difficulty: 4,
      phrase_count: 8,
      footwork_patterns: ["cross_body"],
      on_beat: true,
      styling_notes:
        "Lead raises the left hand on count 1; follow turns over counts 2-3 and resolves to closed on 5.",
    },
  },
  {
    title: "Cross-body lead",
    bpm: 124,
    durationSeconds: 8.0,
    firstBeatSeconds: 0.25,
    searchAttributes: {
      move_name: "Cross-body lead",
      move_category: "footwork",
      lead_follow_role: "lead",
      difficulty: 3,
      phrase_count: 8,
      footwork_patterns: ["cross_body", "side_step"],
      on_beat: true,
      styling_notes:
        "Lead opens to the side on 1-2-3, follow travels across on 5-6-7, tap to close.",
    },
  },
  {
    title: "Body wave — sensual accent",
    bpm: 132,
    durationSeconds: 8.0,
    firstBeatSeconds: 0.18,
    searchAttributes: {
      move_name: "Body wave",
      move_category: "sensual",
      lead_follow_role: "both",
      difficulty: 6,
      phrase_count: 8,
      footwork_patterns: ["syncopation", "hammer"],
      on_beat: false,
      styling_notes:
        "Slow body wave initiated on count 1, syncopated weight change on the 'and' of 2.",
    },
  },
];

const bachataMediaAssets = bachataClipSpecs.map((spec, i) => {
  const n = String(i + 1).padStart(3, "0");
  return {
    key: `bachata_media_${n}`,
    filename: `bachata_demo_${n}.mp4`,
    // IP-clean placeholder storage location for originally-recorded demo footage.
    storageKey: `demo-media/bachata/bachata_demo_${n}.mp4`,
    durationSeconds: spec.durationSeconds,
    fps: BACHATA_FPS,
    width: 1280,
    height: 720,
    metadata: {
      ipClean: true,
      source: "original-demo-recording",
      note: "Placeholder reference; record/license original footage before demo.",
    },
  };
});

const bachataClips = bachataClipSpecs.map((spec, i) => {
  const beatGrid = buildBeatGrid({
    bpm: spec.bpm,
    durationSeconds: spec.durationSeconds,
    fps: BACHATA_FPS,
    firstBeatSeconds: spec.firstBeatSeconds,
  });
  return {
    clipIndex: i + 1,
    title: spec.title,
    domain: "bachata",
    mediaAssetKey: bachataMediaAssets[i].key,
    startSeconds: 0,
    endSeconds: spec.durationSeconds,
    startFrame: 0,
    endFrame: Math.round(spec.durationSeconds * BACHATA_FPS),
    searchAttributes: spec.searchAttributes,
    metadata: {
      timelineMode: "beat_grid",
      // analyzer-shaped beat grid (hand-authored placeholder — see header)
      beatGrid,
      // phrasing hints for the bachata timeline math (cycle-builder)
      phrasing: {
        beatsPerCycle: 8,
        downbeatIndex: 0,
        countsPerPhrase16: 16,
        countsPerPhrase32: 32,
      },
      provenance: "hand-authored-placeholder",
    },
  };
});

// ---------------------------------------------------------------------------
// Project: sign_language (timelineMode = gloss_segments)
// ---------------------------------------------------------------------------

const SIGN_FPS = 30;

// Hand-authored gloss segments for original, IP-clean signed phrases. Each clip
// is one signed phrase; segments carry per-sign attributes whose keys mirror the
// sign-language PRESET field keys in lib/schemas/workspace.ts. `phrases` groups
// segments into sentence-level units for the gloss timeline.
const signClipSpecs = [
  {
    title: "Greeting — nice to meet you",
    durationSeconds: 4.0,
    summary: "HELLO NICE MEET-YOU",
    segments: [
      { gloss: "HELLO", sign_type: "lexical", dominant_hand: "right", two_handed: false, handshapes: ["flat"], non_manual_markers: "brow raise, smile", clarity: 5, startSeconds: 0.2, endSeconds: 1.0, phrase: 1 },
      { gloss: "NICE", sign_type: "lexical", dominant_hand: "right", two_handed: true, handshapes: ["flat"], non_manual_markers: "neutral", clarity: 4, startSeconds: 1.1, endSeconds: 2.0, phrase: 1 },
      { gloss: "MEET-YOU", sign_type: "lexical", dominant_hand: "both", two_handed: true, handshapes: ["index"], non_manual_markers: "eye gaze to addressee", clarity: 5, startSeconds: 2.1, endSeconds: 3.4, phrase: 1 },
    ],
  },
  {
    title: "Introduction — my name",
    durationSeconds: 5.0,
    summary: "MY NAME f-i-n",
    segments: [
      { gloss: "MY", sign_type: "pointing", dominant_hand: "right", two_handed: false, handshapes: ["flat"], non_manual_markers: "neutral", clarity: 5, startSeconds: 0.2, endSeconds: 0.9, phrase: 1 },
      { gloss: "NAME", sign_type: "lexical", dominant_hand: "both", two_handed: true, handshapes: ["index"], non_manual_markers: "neutral", clarity: 5, startSeconds: 1.0, endSeconds: 1.9, phrase: 1 },
      { gloss: "fs-F", sign_type: "fingerspelled", dominant_hand: "right", two_handed: false, handshapes: ["open_8"], non_manual_markers: "mouthing", clarity: 4, startSeconds: 2.1, endSeconds: 2.6, phrase: 2 },
      { gloss: "fs-I", sign_type: "fingerspelled", dominant_hand: "right", two_handed: false, handshapes: ["index"], non_manual_markers: "mouthing", clarity: 4, startSeconds: 2.6, endSeconds: 3.1, phrase: 2 },
      { gloss: "fs-N", sign_type: "fingerspelled", dominant_hand: "right", two_handed: false, handshapes: ["index"], non_manual_markers: "mouthing", clarity: 3, startSeconds: 3.1, endSeconds: 3.7, phrase: 2 },
    ],
  },
  {
    title: "Farewell — thanks, see you later",
    durationSeconds: 4.5,
    summary: "THANK-YOU SEE-YOU LATER",
    segments: [
      { gloss: "THANK-YOU", sign_type: "lexical", dominant_hand: "right", two_handed: false, handshapes: ["flat"], non_manual_markers: "nod, smile", clarity: 5, startSeconds: 0.2, endSeconds: 1.2, phrase: 1 },
      { gloss: "SEE-YOU", sign_type: "lexical", dominant_hand: "right", two_handed: false, handshapes: ["index"], non_manual_markers: "eye gaze", clarity: 4, startSeconds: 1.4, endSeconds: 2.4, phrase: 1 },
      { gloss: "LATER", sign_type: "lexical", dominant_hand: "right", two_handed: false, handshapes: ["index"], non_manual_markers: "neutral", clarity: 4, startSeconds: 2.6, endSeconds: 3.8, phrase: 1 },
    ],
  },
  {
    title: "Question — where is the bathroom",
    durationSeconds: 4.0,
    summary: "BATHROOM WHERE",
    segments: [
      { gloss: "BATHROOM", sign_type: "lexical", dominant_hand: "right", two_handed: false, handshapes: ["fist"], non_manual_markers: "neutral", clarity: 5, startSeconds: 0.2, endSeconds: 1.3, phrase: 1 },
      { gloss: "WHERE", sign_type: "lexical", dominant_hand: "right", two_handed: false, handshapes: ["index"], non_manual_markers: "brow furrow (wh-question), head tilt", clarity: 5, startSeconds: 1.5, endSeconds: 3.2, phrase: 1 },
    ],
  },
];

const signMediaAssets = signClipSpecs.map((spec, i) => {
  const n = String(i + 1).padStart(3, "0");
  return {
    key: `sign_media_${n}`,
    filename: `sign_demo_${n}.mp4`,
    storageKey: `demo-media/sign-language/sign_demo_${n}.mp4`,
    durationSeconds: spec.durationSeconds,
    fps: SIGN_FPS,
    width: 1280,
    height: 720,
    metadata: {
      ipClean: true,
      source: "original-demo-recording",
      note: "Placeholder reference; record/license original signing footage before demo.",
    },
  };
});

const signClips = signClipSpecs.map((spec, i) => {
  const segments = spec.segments.map((s, idx) => ({
    index: idx,
    ...s,
    startFrame: Math.round(s.startSeconds * SIGN_FPS),
    endFrame: Math.round(s.endSeconds * SIGN_FPS),
  }));

  // Group segments into phrases for the gloss timeline.
  const phraseNumbers = [...new Set(segments.map((s) => s.phrase))].sort((a, b) => a - b);
  const phrases = phraseNumbers.map((p) => {
    const inPhrase = segments.filter((s) => s.phrase === p);
    return {
      phrase: p,
      label: inPhrase.map((s) => s.gloss).join(" "),
      startSeconds: Math.min(...inPhrase.map((s) => s.startSeconds)),
      endSeconds: Math.max(...inPhrase.map((s) => s.endSeconds)),
      glossIndices: inPhrase.map((s) => s.index),
    };
  });

  return {
    clipIndex: i + 1,
    title: spec.title,
    domain: "sign_language",
    mediaAssetKey: signMediaAssets[i].key,
    startSeconds: 0,
    endSeconds: spec.durationSeconds,
    startFrame: 0,
    endFrame: Math.round(spec.durationSeconds * SIGN_FPS),
    // search attributes mirror sign-language PRESET keys; aggregated across the
    // phrase so the seed script can build a representative search_text.
    searchAttributes: {
      gloss: spec.summary,
      sign_type: [...new Set(spec.segments.map((s) => s.sign_type))],
      dominant_hand: [...new Set(spec.segments.map((s) => s.dominant_hand))],
      handshapes: [...new Set(spec.segments.flatMap((s) => s.handshapes))],
      two_handed: spec.segments.some((s) => s.two_handed),
      non_manual_markers: spec.segments.map((s) => s.non_manual_markers).join("; "),
    },
    metadata: {
      timelineMode: "gloss_segments",
      glossSegments: segments,
      phrases,
      provenance: "hand-authored",
    },
  };
});

// ---------------------------------------------------------------------------
// Write the dataset
// ---------------------------------------------------------------------------

const projects = {
  generatedBy: "scripts/generate-seed.mjs",
  ipClean: true,
  projects: [
    {
      slug: "bachata",
      name: "Bachata Move Annotation",
      domain: "bachata",
      presetKey: "bachata",
      timelineMode: "beat_grid",
      clipsFile: "clips.bachata.json",
    },
    {
      slug: "sign_language",
      name: "Sign Language Gloss Annotation",
      domain: "sign_language",
      presetKey: "sign_language",
      timelineMode: "gloss_segments",
      clipsFile: "clips.sign_language.json",
    },
  ],
};

const bachataDataset = {
  projectSlug: "bachata",
  timelineMode: "beat_grid",
  fps: BACHATA_FPS,
  mediaAssets: bachataMediaAssets,
  clips: bachataClips,
};

const signDataset = {
  projectSlug: "sign_language",
  timelineMode: "gloss_segments",
  fps: SIGN_FPS,
  mediaAssets: signMediaAssets,
  clips: signClips,
};

mkdirSync(SEED_DIR, { recursive: true });

const writeJson = (name, data) => {
  const path = join(SEED_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${name}`);
};

writeJson("projects.json", projects);
writeJson("clips.bachata.json", bachataDataset);
writeJson("clips.sign_language.json", signDataset);

console.log("seed dataset generated.");
