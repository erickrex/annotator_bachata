# Bachata Clip Slicer & Annotator — Requirements

## What This System Does

A standalone TypeScript application built on Remotion (open-source) that takes a YouTube URL of a bachata dance video, analyzes the song's audio to detect BPM and bachata-specific rhythmic cycles, defines virtual clips aligned to those cycles within a Remotion composition, and provides a browser-based interface for reviewing and manually annotating each clip with structured metadata. The annotations produce a clip library that can be consumed by a future choreography generation system.

This system does not generate choreography. It produces annotated clip libraries.

---

## Architecture Overview

### Remotion as the Core Video Engine

Remotion is the central component of this application. Instead of a traditional pipeline that slices video files into separate clip files on disk, this system uses Remotion to treat the source video as a single composition and defines clips as virtual segments within it.

The architecture works like this:

1. The source video is downloaded once and loaded into a Remotion `<Composition>`.
2. Audio analysis produces a beat grid and cycle boundaries.
3. Each clip is defined as a Remotion `<Sequence>` with a `from` frame and `durationInFrames` — no physical file slicing needed.
4. The Remotion `<Player>` component provides frame-accurate playback of any clip segment with audio, scrubbing, and timeline visualization.
5. Clip boundaries are adjusted by changing frame ranges in the composition, not by re-cutting files.
6. Beat markers, cycle boundaries, and energy profiles are rendered as visual overlays on the Player using `useCurrentFrame()`.
7. When the user is done annotating, clips can be exported to individual files using Remotion's rendering pipeline backed by FFmpeg.

This eliminates the re-slice/re-import cycle entirely. Adjusting a clip boundary is an instant operation — change the frame range, and the Player reflects it immediately.

### Key Remotion APIs Used

- `<Composition>` — defines the full source video as a renderable composition.
- `<Sequence>` — defines each virtual clip as a time segment within the composition.
- `<Player>` — embeds frame-accurate video playback in the browser UI with scrubbing and controls.
- `<OffthreadVideo>` — loads the source video for playback without blocking the main thread.
- `useCurrentFrame()` — provides the current frame number for rendering beat markers and overlays.
- `useVideoConfig()` — provides fps, width, height, and duration for frame/time conversions.
- `visualizeAudio()` / `getAudioData()` from `@remotion/media-utils` — provides per-frame audio spectrum data for waveform and energy visualization.
- `renderMedia()` — exports individual clip segments to MP4 files when the user wants physical files.

### What Remotion Does Not Provide

Remotion's audio APIs (`visualizeAudio`, `getAudioData`) provide frequency spectrum data per frame. They do not perform beat tracking, BPM detection, or onset detection. The audio analysis pipeline (BPM detection, beat grid construction, cycle alignment) must be implemented separately using Essentia.js (WebAssembly port of the Essentia C++ library) running in Node.js.

Remotion also does not handle YouTube downloading. That remains a yt-dlp subprocess call.

---

## Core Concepts

### Bachata Rhythmic Structure

Bachata music follows a predictable count structure:

- 1 beat = one count
- 4 beats = one half-phrase (tap on 4)
- 8 beats = one full basic cycle (1-2-3-tap, 5-6-7-tap)
- 16 beats = one musical phrase (two full basics, common for most moves)
- 32 beats = one extended phrase (used for longer combinations)

The system must understand this hierarchy. Clip boundaries should land on cycle boundaries, not arbitrary time positions. A clip that starts mid-phrase or ends between counts 3 and 5 is unusable for choreography.

### Virtual Clip Definition

A clip is a virtual segment of the source video defined by a frame range within a Remotion composition. It:

- starts on a beat-aligned boundary (count 1 or count 5 of a basic cycle),
- spans one or more complete bachata cycles (8, 16, or 32 beats),
- is represented as a `<Sequence>` with `from` and `durationInFrames` props,
- does not exist as a separate file on disk until explicitly exported,
- can be described by structured entry/exit state metadata.

### Annotation Definition

An annotation is a structured metadata record attached to a virtual clip. It describes what happens in the clip in terms that a future choreography planner can use for retrieval, scoring, and transition compatibility.

---

## Functional Requirements

### FR-1: YouTube Video Ingestion

The system must accept a YouTube URL and download both the video and audio streams.

- Accept standard YouTube URLs and short URLs (youtu.be).
- Download the highest available video quality up to 1080p.
- Extract the audio track as a separate WAV file for analysis.
- Store the original video file locally.
- Display download progress.
- Handle age-restricted, unavailable, or private video errors gracefully.
- After download, automatically load the video into a Remotion `<Composition>` for playback.

### FR-2: Audio Analysis and BPM Detection

The system must analyze the extracted audio to detect tempo and beat positions. This analysis runs in Node.js using Essentia.js, not in the Remotion rendering pipeline.

- Detect the song's global BPM.
- Detect per-beat timestamps throughout the song (beat grid).
- Identify the downbeat (count 1) position. Bachata has a characteristic rhythmic accent pattern — the system should attempt to distinguish count 1 from count 5.
- Compute a confidence score for the detected BPM.
- Support the typical bachata BPM range: 115–145 BPM.
- Handle tempo variations within a song (slight accelerando/ritardando common in live recordings).
- Extract energy profile (RMS) across the song for section-level context.
- Convert all beat timestamps to frame numbers using the source video's fps for use in Remotion components.

### FR-3: Bachata Cycle Detection

The system must group beats into bachata-specific rhythmic cycles.

- Group beats into 8-count basic cycles (1-2-3-tap-5-6-7-tap).
- Group basic cycles into 16-count phrases and 32-count extended phrases.
- Identify the first downbeat of the song (where the dance would naturally start, often after an intro).
- Mark cycle boundaries with timestamps and corresponding frame numbers.
- Allow the user to manually adjust the downbeat position if auto-detection is wrong.
- Allow the user to manually shift the entire beat grid by a fixed offset.

### FR-4: Virtual Clip Creation

The system must define virtual clips as Remotion Sequences aligned to cycle boundaries. No physical file slicing occurs at this stage.

- Default clip length: 16 beats (two basic cycles). This is the most common unit for a single bachata move or short combination.
- Support configurable clip lengths: 8, 16, or 32 beats.
- Each clip is defined by a `from` frame and `durationInFrames` within the Remotion composition.
- Generate a `clip_id` for each virtual clip using the convention: `{source_id}_c{cycle_number}_{beat_count}`.
- Store clip definitions in the project state (JSON), not as physical files.
- The full source video remains a single file on disk; clips are views into it.

### FR-5: Clip Review Interface (Remotion Player)

The system must provide a Remotion-powered interface for reviewing virtual clips.

- Use the Remotion `<Player>` component to play any virtual clip segment with audio.
- Display all virtual clips in a list or grid view alongside the Player.
- Show the clip's position in the song (start time, end time, cycle number, beat range).
- Render beat markers as visual overlays on the Player timeline using `useCurrentFrame()`. Each beat should be visually distinguishable, with count 1 and count 5 emphasized.
- Render the energy profile as a waveform or intensity bar behind the beat markers using Remotion's `visualizeAudio()` API.
- Allow the user to mark a clip as "discard" (bad cut, no useful movement, camera obstruction, etc.).
- Allow the user to merge two adjacent clips into one longer clip by combining their frame ranges.
- Allow the user to split a clip at a cycle boundary into two shorter clips.
- Allow the user to adjust a clip's start or end frame to a different beat-aligned position by dragging or nudging. The adjustment is instant — just a frame range change, no re-encoding.
- Provide keyboard shortcuts for play/pause, next clip, previous clip, and frame-by-frame stepping.

### FR-6: Clip Annotation

The system must provide a structured annotation interface displayed alongside the Remotion Player. The annotator watches the clip playing in the Player while filling in the annotation form. The full annotation schema is defined in the Annotation Schema section of this document.

#### FR-6.1: Identity and Classification

- `clip_id`: auto-generated, editable.
- `move_name`: free text, human-readable name for the move.
- `move_label`: select from controlled vocabulary of move categories (see Controlled Vocabularies section).
- `move_family`: optional grouping within a category (e.g., "copa" within "cross_body_lead").
- `move_variant`: optional variant descriptor (e.g., "with_spin", "sensual").
- `tags`: free-form tag list for additional searchability.
- `difficulty`: enum — `beginner`, `intermediate`, `advanced`.
- `energy_level`: enum — `low`, `medium`, `high`.
- `style`: enum — `traditional`, `sensual`, `moderna`, `fusion`.

#### FR-6.2: Musical Phrasing

- `estimated_tempo_bpm`: auto-populated from analysis, editable.
- `duration_seconds`: auto-calculated from frame range and fps.
- `beats_total`: auto-calculated from BPM and duration.
- `bars_total`: auto-calculated (beats_total / 4).
- `phrase_resolution`: enum — `4_count`, `8_count`, `16_count`, `irregular`.
- `completion_profile.basico_completion_counts`: how many counts the basic pattern takes to complete.
- `completion_profile.tempo_feel`: enum — `slow_finish`, `even_finish`, `fast_finish`, `syncopated_finish`.
- `completion_profile.accent_pattern`: enum — `even`, `front_loaded`, `back_loaded`.
- `completion_profile.syncopation_level`: float 0.0–1.0.

#### FR-6.3: Entry State

The physical state of the dancers at the start of the clip.

- `entry_state.hold`
- `entry_state.leader_weight_foot`
- `entry_state.follower_weight_foot`
- `entry_state.leader_facing`
- `entry_state.follower_facing`
- `entry_state.body_orientation_degrees`
- `entry_state.relative_position`
- `entry_state.travel_direction`
- `entry_state.rotation_direction`
- `entry_state.rotation_degrees`
- `entry_state.distance_profile`
- `entry_state.frame_tension`
- `entry_state.hand_connections`

All field types and allowed values are defined in the Controlled Vocabularies section.

#### FR-6.4: Exit State

Same fields as entry state, describing the physical state at the end of the clip. Uses the same controlled vocabularies.

#### FR-6.5: Trim Profile

- `trim_profile.trim_safe_start_seconds`: earliest safe trim point (auto-set to 0.0, editable).
- `trim_profile.trim_safe_end_seconds`: latest safe trim point (auto-set to clip duration, editable).
- `trim_profile.trim_safe_windows`: list of safe sub-ranges within the clip (see schema example).
- `trim_profile.loopable`: boolean — whether the clip can loop seamlessly.
- `trim_profile.preferred_entry_beats`: list of beat numbers that are good entry points (e.g., [1, 5]).
- `trim_profile.preferred_exit_beats`: list of beat numbers that are good exit points (e.g., [4, 8]).

#### FR-6.6: Motion Profile

- `motion_profile.travel_amount`: enum — `none`, `low`, `medium`, `high`.
- `motion_profile.footwork_complexity`: enum — `low`, `medium`, `high`.
- `motion_profile.upper_body_isolation`: enum — `none`, `low`, `medium`, `high`.
- `motion_profile.spin_count`: number.
- `motion_profile.dip`: boolean.
- `motion_profile.headroll`: boolean.
- `motion_profile.bodywave`: boolean.
- `motion_profile.leader_dominant_motion`: enum — `lower_body`, `upper_body`, `torso`, `full_body`, `stationary`.
- `motion_profile.follower_dominant_motion`: enum — `lower_body`, `upper_body`, `torso`, `full_body`, `stationary`.

#### FR-6.7: Camera Profile

- `camera_profile.camera_angle`: enum — `front`, `side`, `back`, `overhead`, `mixed`.
- `camera_profile.framing`: enum — `full_body`, `upper_body`, `lower_body`, `close_up`, `wide`.
- `camera_profile.visibility_score`: float 0.0–1.0.
- `camera_profile.occlusion_score`: float 0.0–1.0 (0 = no occlusion, 1 = fully occluded).

#### FR-6.8: Quality Profile

- `quality_profile.visibility_score`: float 0.0–1.0 — how clearly the movement is visible.
- `quality_profile.boundary_cleanliness`: float 0.0–1.0 — how clean the start/end frames are.
- `quality_profile.teaching_clarity`: float 0.0–1.0 — how useful this clip is for learning.
- `quality_profile.stitchability`: float 0.0–1.0 — how well this clip can be joined to others.

### FR-7: Clip Export

The system must support exporting virtual clips to physical MP4 files using Remotion's rendering pipeline.

- Export a single clip to an MP4 file using `renderMedia()` with the clip's frame range.
- Export all non-discarded clips in batch.
- Preserve original video quality and frame rate in exported clips.
- Include the audio track in each exported clip.
- Name exported files with the convention: `{clip_id}.mp4`.
- Store exported clips in an organized output directory.
- Export is optional — the annotation workflow does not require physical files.

### FR-8: Annotation Persistence

- Save all annotations and virtual clip definitions to a JSON file following the annotation schema defined in this document.
- Auto-save on every field change.
- Support exporting the full annotation set as a single JSON file.
- Support importing a previously exported annotation file to resume work. On import, the system must verify that the referenced source video files exist locally.
- Validate annotations against the schema on save (required fields, valid enum values, numeric ranges).
- Track annotation completeness per clip (percentage of fields filled).

### FR-9: Source Video Metadata

- Store metadata about the source YouTube video: URL, title, channel, upload date, duration, fps, width, height.
- Store the audio analysis results: BPM, beat grid, downbeat offset, energy profile.
- Associate all virtual clips from the same source video.
- Support processing multiple YouTube URLs into the same annotation project.

---

## Non-Functional Requirements

### NFR-1: Technology Stack

- TypeScript throughout.
- Node.js runtime.
- Remotion (open-source) as the core video engine:
  - `remotion` — core framework, `<Composition>`, `<Sequence>`, `useCurrentFrame()`, `useVideoConfig()`.
  - `@remotion/player` — `<Player>` component for browser-based frame-accurate playback.
  - `@remotion/media-utils` — `getAudioData()`, `visualizeAudio()` for waveform and spectrum visualization.
  - `@remotion/renderer` — `renderMedia()` for exporting clips to MP4.
  - `@remotion/cli` — development server and preview tooling.
- React for the annotation UI (Remotion is React-based, so the entire app is a single React application).
- Essentia.js (WebAssembly) for audio analysis: BPM detection, beat tracking, onset detection, energy profiling. Runs in Node.js, not in the browser rendering pipeline.
- yt-dlp (external binary, called as subprocess) for YouTube video download.
- FFmpeg (external binary, used by Remotion's renderer for encoding exported clips).
- Storage: local filesystem for video files, JSON files for annotations and project state.

### NFR-2: Performance

- Audio analysis (Essentia.js) should complete within 30 seconds for a typical 4-minute song.
- Virtual clip creation (defining frame ranges) should be instantaneous after audio analysis.
- The Remotion Player should load and play any clip segment without perceptible delay.
- Clip boundary adjustments should reflect immediately in the Player (no re-encoding).
- Batch export of all clips should process at least 2x real-time.

### NFR-3: Portability

- Must run on macOS and Linux.
- No cloud dependencies. Everything runs locally.
- The only external network call is the YouTube download.

### NFR-4: Data Integrity

- Never overwrite annotation data without confirmation.
- Maintain a project-level manifest that tracks all source videos, virtual clips, and annotation status.
- All timestamps in annotations must be in seconds with millisecond precision.
- All frame numbers must be integers and consistent with the source video's fps.

---

## Remotion Component Architecture

### Source Video Composition

The root Remotion composition wraps the full source video:

```tsx
import { Composition, OffthreadVideo } from 'remotion';

// Registered in root.tsx
<Composition
  id="source-video"
  component={SourceVideoPlayer}
  durationInFrames={totalFrames}
  fps={sourceFps}
  width={sourceWidth}
  height={sourceHeight}
/>
```

### Virtual Clip as Sequence

Each virtual clip is a `<Sequence>` that plays a segment of the source video:

```tsx
import { Sequence, OffthreadVideo, useCurrentFrame } from 'remotion';

const VirtualClip: React.FC<{
  src: string;
  startFrame: number;
  durationInFrames: number;
  beatMarkers: number[]; // frame numbers where beats land
}> = ({ src, startFrame, durationInFrames, beatMarkers }) => {
  const frame = useCurrentFrame();

  return (
    <>
      <OffthreadVideo
        src={src}
        startFrom={startFrame}
      />
      <BeatOverlay
        currentFrame={frame}
        beatMarkers={beatMarkers}
      />
    </>
  );
};
```

### Beat Marker Overlay

Beat markers are rendered as a visual layer on top of the video using `useCurrentFrame()`:

```tsx
const BeatOverlay: React.FC<{
  currentFrame: number;
  beatMarkers: number[]; // frame numbers relative to clip start
}> = ({ currentFrame, beatMarkers }) => {
  // Find the nearest beat to the current frame
  const currentBeatIndex = beatMarkers.findIndex(
    (marker, i) =>
      currentFrame >= marker &&
      (i === beatMarkers.length - 1 || currentFrame < beatMarkers[i + 1])
  );

  const countInCycle = currentBeatIndex >= 0
    ? (currentBeatIndex % 8) + 1
    : null;

  // Highlight count 1 and count 5 (start of each half-phrase)
  const isDownbeat = countInCycle === 1 || countInCycle === 5;

  return (
    <div style={{ position: 'absolute', bottom: 20, left: 20 }}>
      {countInCycle && (
        <span style={{
          fontSize: isDownbeat ? 48 : 32,
          color: isDownbeat ? '#ff0' : '#fff',
          fontWeight: isDownbeat ? 'bold' : 'normal',
        }}>
          {countInCycle}
        </span>
      )}
    </div>
  );
};
```

### Player Integration in Annotation UI

The annotation interface embeds the Remotion Player alongside the form:

```tsx
import { Player } from '@remotion/player';

const AnnotationView: React.FC<{ clip: VirtualClipDef }> = ({ clip }) => {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <Player
        component={VirtualClip}
        inputProps={{
          src: clip.sourceVideoPath,
          startFrame: clip.fromFrame,
          durationInFrames: clip.durationInFrames,
          beatMarkers: clip.beatMarkerFrames,
        }}
        durationInFrames={clip.durationInFrames}
        fps={clip.fps}
        compositionWidth={clip.width}
        compositionHeight={clip.height}
        controls
        loop
        style={{ width: 640 }}
      />
      <AnnotationForm clip={clip} />
    </div>
  );
};
```

### Clip Export

When the user wants physical files, Remotion's renderer handles the encoding:

```tsx
import { renderMedia, selectComposition } from '@remotion/renderer';

async function exportClip(clip: VirtualClipDef): Promise<string> {
  const outputPath = `exports/${clip.clipId}.mp4`;

  await renderMedia({
    composition: await selectComposition({
      serveUrl: bundleLocation,
      id: 'virtual-clip',
      inputProps: {
        src: clip.sourceVideoPath,
        startFrame: clip.fromFrame,
        durationInFrames: clip.durationInFrames,
        beatMarkers: [],
      },
    }),
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
  });

  return outputPath;
}
```

---

## Out of Scope

- Choreography generation or sequence planning.
- Embedding generation (text, pose, audio, motion embeddings).
- Vector search or similarity search of any kind.
- Multi-user collaboration or cloud sync.
- Automatic annotation (all annotation is manual in this version).
- Transition scoring (node_score, edge_score, or any sequence optimization).
- Any cloud service integration.
- Remotion Editor Starter (paid template). This project uses only the open-source Remotion packages.

---

## Controlled Vocabularies

All enum fields in the annotation schema must use values from these controlled vocabularies. The annotation UI should present these as dropdowns or selectable options, never free text.

### Move Categories (`move_label`)

```
arm_styling, basic, bodywaves, bolero, cross_body_lead, footwork,
golpes, hammerlock, headrolls, hiprolls, intros, ladyturn, outro,
shadow, spin, style
```

### Hold Types (`hold`)

```
open, closed, shadow, hammerlock, cross_hand, side_by_side,
single_hand, transitioning
```

### Weight Foot (`leader_weight_foot`, `follower_weight_foot`)

```
left, right, split, unknown
```

### Facing Direction (`leader_facing`, `follower_facing`)

```
up_slot, down_slot, left, right, diagonal
```

### Relative Position (`relative_position`)

```
facing_each_other, side_by_side, offset_same_direction, back_to_back
```

### Travel Direction (`travel_direction`)

```
stationary, forward, backward, left, right, diagonal_left, diagonal_right
```

### Rotation Direction (`rotation_direction`)

```
none, clockwise, counterclockwise
```

### Distance Profile (`distance_profile`)

```
close, medium, far
```

### Frame Tension (`frame_tension`)

```
low, medium, high
```

### Tempo Feel (`tempo_feel`)

```
slow_finish, even_finish, fast_finish, syncopated_finish
```

### Phrase Resolution (`phrase_resolution`)

```
4_count, 8_count, 16_count, irregular
```

### Accent Pattern (`accent_pattern`)

```
even, front_loaded, back_loaded
```

### Difficulty (`difficulty`)

```
beginner, intermediate, advanced
```

### Energy Level (`energy_level`)

```
low, medium, high
```

### Style (`style`)

```
traditional, sensual, moderna, fusion
```

### Travel Amount / Isolation Level (`travel_amount`, `upper_body_isolation`)

```
none, low, medium, high
```

### Footwork Complexity (`footwork_complexity`)

```
low, medium, high
```

### Dominant Motion (`leader_dominant_motion`, `follower_dominant_motion`)

```
lower_body, upper_body, torso, full_body, stationary
```

### Camera Angle (`camera_angle`)

```
front, side, back, overhead, mixed
```

### Framing (`framing`)

```
full_body, upper_body, lower_body, close_up, wide
```

### Hand Connections (`hand_connections`)

Multi-select from:

```
leader_left_to_follower_left
leader_left_to_follower_right
leader_right_to_follower_left
leader_right_to_follower_right
no_hand_connection
```

---

## Annotation Schema

### Schema Version

All annotation output files must use `schema_version: "2.0"`.

### Top-Level File Structure

```json
{
  "schema_version": "2.0",
  "project": {
    "name": "My Annotation Project",
    "created_at": "2026-03-29T12:00:00Z",
    "updated_at": "2026-03-29T14:30:00Z"
  },
  "sources": [
    {
      "source_id": "yt_abc123",
      "youtube_url": "https://www.youtube.com/watch?v=abc123",
      "title": "Bachata Sensual Demo - Daniel & Desiree",
      "channel": "Bachata Stars",
      "upload_date": "2025-06-15",
      "duration_seconds": 245.0,
      "fps": 30,
      "width": 1920,
      "height": 1080,
      "total_frames": 7350,
      "video_file": "sources/yt_abc123.mp4",
      "audio_file": "sources/yt_abc123.wav",
      "detected_bpm": 128,
      "bpm_confidence": 0.92,
      "downbeat_offset_seconds": 1.35,
      "beat_grid": [1.35, 1.819, 2.288, 2.757, 3.226, 3.695],
      "beat_grid_frames": [40, 54, 68, 82, 96, 110],
      "energy_profile": [0.12, 0.15, 0.18, 0.35, 0.52, 0.61, 0.78],
      "downloaded_at": "2026-03-29T12:05:00Z"
    }
  ],
  "enum_definitions": {
    "hold": ["open", "closed", "shadow", "hammerlock", "cross_hand", "side_by_side", "single_hand", "transitioning"],
    "weight_foot": ["left", "right", "split", "unknown"],
    "facing": ["up_slot", "down_slot", "left", "right", "diagonal"],
    "relative_position": ["facing_each_other", "side_by_side", "offset_same_direction", "back_to_back"],
    "travel_direction": ["stationary", "forward", "backward", "left", "right", "diagonal_left", "diagonal_right"],
    "rotation_direction": ["none", "clockwise", "counterclockwise"],
    "distance_profile": ["close", "medium", "far"],
    "frame_tension": ["low", "medium", "high"],
    "tempo_feel": ["slow_finish", "even_finish", "fast_finish", "syncopated_finish"],
    "phrase_resolution": ["4_count", "8_count", "16_count", "irregular"],
    "accent_pattern": ["even", "front_loaded", "back_loaded"],
    "difficulty": ["beginner", "intermediate", "advanced"],
    "energy_level": ["low", "medium", "high"],
    "style": ["traditional", "sensual", "moderna", "fusion"],
    "move_label": ["arm_styling", "basic", "bodywaves", "bolero", "cross_body_lead", "footwork", "golpes", "hammerlock", "headrolls", "hiprolls", "intros", "ladyturn", "outro", "shadow", "spin", "style"],
    "travel_amount": ["none", "low", "medium", "high"],
    "footwork_complexity": ["low", "medium", "high"],
    "upper_body_isolation": ["none", "low", "medium", "high"],
    "dominant_motion": ["lower_body", "upper_body", "torso", "full_body", "stationary"],
    "camera_angle": ["front", "side", "back", "overhead", "mixed"],
    "framing": ["full_body", "upper_body", "lower_body", "close_up", "wide"],
    "hand_connections": ["leader_left_to_follower_left", "leader_left_to_follower_right", "leader_right_to_follower_left", "leader_right_to_follower_right", "no_hand_connection"]
  },
  "clips": []
}
```

### Canonical Clip Record

Each clip in the `clips` array must follow this structure. Fields marked `[required]` must be present for a valid annotation. Fields marked `[auto]` are populated automatically by the system. Fields marked `[optional]` can be left empty and filled progressively.

```json
{
  "clip_id": "yt_abc123_c005_016",
  "source_id": "yt_abc123",
  "status": "annotated",

  "remotion": {
    "from_frame": 970,
    "duration_in_frames": 225,
    "fps": 30
  },

  "move_name": "Sensual Shadow Entry with Body Wave",
  "move_label": "shadow",
  "move_family": "shadow_entry",
  "move_variant": "with_bodywave",
  "tags": ["sensual", "shadow", "bodywave", "smooth_entry"],
  "difficulty": "advanced",
  "energy_level": "high",
  "style": "sensual",

  "estimated_tempo_bpm": 128,
  "duration_seconds": 7.5,
  "beats_total": 16,
  "bars_total": 4,
  "phrase_resolution": "16_count",
  "song_position": {
    "start_time_seconds": 32.35,
    "end_time_seconds": 39.85,
    "cycle_number": 5,
    "beat_start": 65,
    "beat_end": 80
  },

  "completion_profile": {
    "basico_completion_counts": 8,
    "entry_latency_counts": 0,
    "exit_latency_counts": 0,
    "tempo_feel": "fast_finish",
    "accent_pattern": "even",
    "syncopation_level": 0.2
  },

  "entry_state": {
    "hold": "open",
    "leader_weight_foot": "left",
    "follower_weight_foot": "right",
    "leader_facing": "down_slot",
    "follower_facing": "down_slot",
    "body_orientation_degrees": 0,
    "relative_position": "facing_each_other",
    "travel_direction": "stationary",
    "rotation_direction": "none",
    "rotation_degrees": 0,
    "distance_profile": "medium",
    "frame_tension": "medium",
    "hand_connections": [
      "leader_left_to_follower_right"
    ]
  },

  "exit_state": {
    "hold": "shadow",
    "leader_weight_foot": "right",
    "follower_weight_foot": "left",
    "leader_facing": "down_slot",
    "follower_facing": "down_slot",
    "body_orientation_degrees": 0,
    "relative_position": "offset_same_direction",
    "travel_direction": "forward",
    "rotation_direction": "clockwise",
    "rotation_degrees": 90,
    "distance_profile": "close",
    "frame_tension": "high",
    "hand_connections": [
      "leader_left_to_follower_left",
      "leader_right_to_follower_right"
    ]
  },

  "trim_profile": {
    "trim_safe_start_seconds": 0.0,
    "trim_safe_end_seconds": 7.3,
    "trim_safe_windows": [
      { "start": 0.0, "end": 3.7 },
      { "start": 3.8, "end": 7.3 }
    ],
    "loopable": false,
    "preferred_entry_beats": [1, 5],
    "preferred_exit_beats": [4, 8]
  },

  "motion_profile": {
    "travel_amount": "low",
    "footwork_complexity": "medium",
    "upper_body_isolation": "high",
    "spin_count": 0,
    "dip": false,
    "headroll": false,
    "bodywave": true,
    "leader_dominant_motion": "upper_body",
    "follower_dominant_motion": "torso"
  },

  "camera_profile": {
    "camera_angle": "front",
    "framing": "full_body",
    "visibility_score": 0.95,
    "occlusion_score": 0.1
  },

  "quality_profile": {
    "visibility_score": 0.91,
    "boundary_cleanliness": 0.88,
    "teaching_clarity": 0.82,
    "stitchability": 0.84
  },

  "embedding_refs": {}
}
```

Note the `remotion` section in each clip record. This stores the frame-level information that Remotion needs to play the clip: `from_frame` (the starting frame in the source video), `duration_in_frames` (how many frames the clip spans), and `fps` (the source video's frame rate). These values are the source of truth for the virtual clip definition. The `song_position` and `duration_seconds` fields are derived from these frame values.

### Clip Status Values

Each clip has a `status` field tracking its annotation progress:

```
pending       — virtual clip created but not yet reviewed
discarded     — reviewed and marked as unusable
reviewed      — reviewed and accepted, not yet annotated
in_progress   — annotation started but incomplete
annotated     — all required fields filled and validated
```

### Required Fields (Minimum Valid Annotation)

A clip is considered validly annotated when all of these fields are present and contain valid values:

- `clip_id`
- `source_id`
- `status`
- `remotion.from_frame`
- `remotion.duration_in_frames`
- `remotion.fps`
- `move_name`
- `move_label`
- `difficulty`
- `energy_level`
- `style`
- `estimated_tempo_bpm`
- `duration_seconds`
- `beats_total`
- `bars_total`
- `entry_state.hold`
- `entry_state.leader_weight_foot`
- `entry_state.follower_weight_foot`
- `exit_state.hold`
- `exit_state.leader_weight_foot`
- `exit_state.follower_weight_foot`
- `trim_profile.trim_safe_start_seconds`
- `trim_profile.trim_safe_end_seconds`

### Recommended Fields (Phase 2 Enrichment)

These fields are not required for a valid annotation but significantly improve the clip's usefulness:

- All orientation and facing fields in entry/exit state
- `travel_direction` and `rotation_direction` in entry/exit state
- `hand_connections` in entry/exit state
- `completion_profile` (all sub-fields)
- `motion_profile` (all sub-fields)
- `trim_profile.trim_safe_windows`
- `trim_profile.preferred_entry_beats` and `preferred_exit_beats`
- `quality_profile.boundary_cleanliness`
- `quality_profile.stitchability`

### Advanced Fields (Phase 3 Enrichment)

These fields are for future use and can remain empty:

- `embedding_refs` (populated by a separate embedding generation system)
- `camera_profile` (useful but not critical for choreography planning)
- `quality_profile.teaching_clarity`

---

## Validation Rules

The system must enforce these rules when saving annotations:

1. All required fields must be present and non-empty.
2. All enum fields must contain values from the corresponding controlled vocabulary.
3. `trim_safe_start_seconds` must be less than `trim_safe_end_seconds`.
4. `trim_safe_end_seconds` must not exceed `duration_seconds`.
5. `beats_total` and `bars_total` must be positive integers.
6. `bars_total` must equal `beats_total / 4`.
7. If `rotation_direction` is `none`, then `rotation_degrees` must be `0`.
8. If `travel_direction` is `stationary`, then `travel_amount` (if present) should be `none` or `low`.
9. Float scores (`visibility_score`, `boundary_cleanliness`, `teaching_clarity`, `stitchability`, `syncopation_level`, `occlusion_score`) must be in the range 0.0–1.0.
10. `body_orientation_degrees` must be in the range 0–360.
11. `spin_count` must be a non-negative integer.
12. `hand_connections` must be an array containing only values from the `hand_connections` vocabulary.
13. `clip_id` must be unique across all clips in the project.
14. `remotion.from_frame` must be a non-negative integer.
15. `remotion.duration_in_frames` must be a positive integer.
16. `remotion.from_frame + remotion.duration_in_frames` must not exceed the source video's total frame count.
17. `duration_seconds` must equal `remotion.duration_in_frames / remotion.fps` (within 0.001s tolerance).

---

## Project Manifest

The system must maintain a project manifest file that tracks overall state:

```json
{
  "project_name": "My Annotation Project",
  "created_at": "2026-03-29T12:00:00Z",
  "updated_at": "2026-03-29T14:30:00Z",
  "sources_count": 2,
  "clips_total": 34,
  "clips_by_status": {
    "pending": 5,
    "discarded": 3,
    "reviewed": 8,
    "in_progress": 6,
    "annotated": 12
  },
  "annotation_completeness": 0.35,
  "sources": ["yt_abc123", "yt_def456"]
}
```

---

## User Workflow Summary

1. User provides a YouTube URL.
2. System downloads the video and extracts audio via yt-dlp.
3. System analyzes audio with Essentia.js: detects BPM, beat grid, downbeat, energy profile.
4. System loads the source video into a Remotion composition.
5. User reviews the detected BPM and downbeat in the Remotion Player with beat markers overlaid. Adjusts if needed.
6. System creates virtual clips as Remotion Sequences at bachata cycle boundaries (default 16-beat clips).
7. User reviews clips in the Remotion Player: discards bad ones, adjusts frame-range boundaries, merges or splits clips. All adjustments are instant — no re-encoding.
8. User annotates each clip using the form alongside the Remotion Player: identity, entry state, exit state, phrasing, motion profile, quality.
9. System validates and saves annotations as schema-v2 JSON.
10. User can optionally export annotated clips to physical MP4 files using Remotion's renderer.
11. User can export the full annotated clip library JSON for use in other systems.
