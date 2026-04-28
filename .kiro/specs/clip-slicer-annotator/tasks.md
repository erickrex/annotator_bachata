# Implementation Plan: Bachata Clip Slicer & Annotator

## Overview

Incremental implementation of the Clip Slicer & Annotator following the design's 9 components, 17 API routes, and full data model. Each task builds on the previous, starting with shared types and pure logic modules, then services, API routes, React islands, and finally integration wiring. TypeScript with Vitest for testing, Python with pytest for the librosa analyzer.

## Tasks

- [x] 1. Project scaffolding and shared types
  - [x] 1.1 Initialize Astro.js project with React integration, Remotion packages, and Vitest
    - Create `package.json` with dependencies: `astro`, `@astrojs/react`, `react`, `react-dom`, `remotion`, `@remotion/player`, `@remotion/media-utils`, `@remotion/renderer`, `@remotion/cli`, `fast-check`, `vitest`
    - Create `astro.config.mjs` with React integration
    - Create `tsconfig.json` with strict mode
    - Create `vitest.config.ts`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 1.2 Define all shared TypeScript types and interfaces
    - Create `src/types/index.ts` with all data model interfaces: `AnnotationProjectFile`, `SourceRecord`, `ClipAnnotation`, `DancerState`, `TrimProfile`, `MotionProfile`, `CameraProfile`, `QualityProfile`, `VirtualClipDef`, `ClipStatus`, `CycleHierarchy`, `Cycle`, `Phrase`, `ProjectManifest`, `EnumDefinitions`
    - Create `src/types/enums.ts` with all controlled vocabulary constants and the `EnumDefinitions` default object
    - _Requirements: 17.2, 17.4, 17.6_

  - [x] 1.3 Set up Python analyzer project structure
    - Create `pyproject.toml` with `uv` configuration and `librosa`, `numpy` dependencies
    - Create `analyzer/analyze.py` stub with CLI argument parsing (`wav_path`, `--fps`) and JSON stdout contract
    - Create `analyzer/tests/` directory with `conftest.py`
    - _Requirements: 16.5, 16.6_

- [x] 2. URL Validator and Ingestion Service
  - [x] 2.1 Implement YouTube URL validator
    - Create `src/services/url-validator.ts` implementing `validateUrl(url: string): { valid: boolean; videoId: string | null }`
    - Support standard YouTube URLs (`youtube.com/watch?v=...`) and short URLs (`youtu.be/...`)
    - Reject all non-matching strings with `valid: false`
    - _Requirements: 1.1, 1.7_

  - [x] 2.2 Write property test for URL validation
    - **Property 1: YouTube URL Validation**
    - **Validates: Requirements 1.1, 1.7**

  - [x] 2.3 Implement Ingestion Service
    - Create `src/services/ingestion-service.ts` implementing the `IngestionService` interface
    - Spawn `yt-dlp` subprocess with `--progress`, parse stderr for progress events
    - Extract audio as WAV using yt-dlp `--extract-audio` or ffmpeg post-processing
    - Read video metadata (fps, width, height, duration, total frames) via ffprobe
    - Store files in `sources/` directory with `yt_{videoId}` naming
    - Build `SourceMetadata` record from download results
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 15.1, 16.7_

- [x] 3. Checkpoint — Validate ingestion foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Audio Analysis Service and librosa CLI
  - [x] 4.1 Implement the Python librosa analyzer CLI
    - Implement `analyzer/analyze.py`: accept `wav_path` and `--fps` arguments
    - Use `librosa.beat.beat_track` for BPM detection and beat timestamps
    - Implement downbeat identification by analyzing accent patterns (count 1 vs count 5)
    - Compute BPM confidence score (0.0–1.0)
    - Use `librosa.feature.rms` for energy profile extraction
    - Convert all beat timestamps to frame numbers using provided fps
    - Output structured JSON to stdout matching the design contract: `{bpm, bpm_confidence, downbeat_offset_seconds, beat_timestamps, beat_frames, energy_profile}`
    - Exit non-zero with stderr message on failure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.12_

  - [x] 4.2 Implement Audio Analysis Service (TypeScript subprocess wrapper)
    - Create `src/services/audio-analysis-service.ts` implementing the `AudioAnalysisService` interface
    - Spawn `python analyze.py <wav_path> --fps <fps>` via `child_process`
    - Parse JSON from stdout into `AudioAnalysisResult`
    - Handle non-zero exit codes by surfacing stderr content
    - Handle JSON parse errors with descriptive messages
    - Implement timeout (60s) with process kill
    - _Requirements: 2.1, 2.10, 2.11, 16.6_

  - [x] 4.3 Write property test for timestamp-to-frame conversion
    - **Property 2: Timestamp-to-Frame Conversion Consistency**
    - **Validates: Requirements 2.8, 3.4**

- [x] 5. Cycle Builder
  - [x] 5.1 Implement Cycle Builder module
    - Create `src/services/cycle-builder.ts` implementing the `CycleBuilder` interface as pure functions
    - Implement `buildCycles`: group beats into 8-count `Cycle` objects starting from downbeat index, then assemble 16-count and 32-count `Phrase` objects
    - Implement `shiftBeatGrid`: apply millisecond offset to all timestamps, recompute frame numbers
    - Implement `recomputeWithDownbeat`: rebuild cycle hierarchy from a new downbeat index
    - Mark all cycle boundaries with both timestamps and frame numbers
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 5.2 Write property test for cycle hierarchy structure
    - **Property 3: Cycle Hierarchy Structure**
    - **Validates: Requirements 3.1, 3.2**

  - [x] 5.3 Write property test for beat grid shift round-trip
    - **Property 4: Beat Grid Shift Round-Trip**
    - **Validates: Requirements 3.6**

- [x] 6. Clip Manager
  - [x] 6.1 Implement Clip Manager module
    - Create `src/services/clip-manager.ts` implementing the `ClipManager` interface
    - Implement `createClips`: generate `VirtualClipDef` objects from `CycleHierarchy` at configurable beat counts (8, 16, 32), ensuring each clip starts on count 1 or count 5 and spans complete cycles
    - Implement clip ID generation: `{sourceId}_c{cycleNumber:03d}_{beatCount:03d}`
    - Implement `mergeClips`: combine two adjacent clips, generate new clip ID
    - Implement `splitClip`: divide at cycle boundary, generate two new clip IDs
    - Implement `adjustBoundary`: snap new boundaries to beat-aligned positions from the beat grid
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.7, 5.8, 5.9_

  - [x] 6.2 Write property test for virtual clip structural invariants
    - **Property 5: Virtual Clip Structural Invariants**
    - **Validates: Requirements 4.2, 4.3, 4.6, 4.7**

  - [x] 6.3 Write property test for clip ID convention
    - **Property 6: Clip ID Convention**
    - **Validates: Requirements 4.4**

  - [x] 6.4 Write property test for merge preserves frame coverage
    - **Property 7: Merge Preserves Frame Coverage**
    - **Validates: Requirements 5.7**

  - [x] 6.5 Write property test for split preserves frame coverage
    - **Property 8: Split Preserves Frame Coverage**
    - **Validates: Requirements 5.8**

  - [x] 6.6 Write property test for split-then-merge round-trip
    - **Property 9: Split-then-Merge Round-Trip**
    - **Validates: Requirements 5.7, 5.8**

  - [x] 6.7 Write property test for boundary adjustment stays beat-aligned
    - **Property 10: Boundary Adjustment Stays Beat-Aligned**
    - **Validates: Requirements 5.9**

- [x] 7. Checkpoint — Validate core logic modules
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Schema Validator
  - [x] 8.1 Implement Schema Validator module
    - Create `src/services/schema-validator.ts` implementing the `SchemaValidator` interface
    - Implement all 17 validation rules from Requirement 14:
      - Required fields check (14.1)
      - Enum field validation against `EnumDefinitions` (14.2)
      - Trim range ordering: `trim_safe_start < trim_safe_end` (14.3)
      - Trim end ≤ duration (14.4)
      - `beats_total` and `bars_total` positive integers, `bars_total == beats_total / 4` (14.5)
      - `rotation_direction == "none"` → `rotation_degrees == 0` (14.6)
      - `travel_direction == "stationary"` → `travel_amount` in `{none, low}` (14.7)
      - Float scores in [0.0, 1.0] (14.8)
      - `body_orientation_degrees` in [0, 360] (14.9)
      - `spin_count` non-negative integer (14.10)
      - `hand_connections` array values from vocabulary (14.11)
      - `clip_id` uniqueness (14.12)
      - `from_frame` non-negative, `duration_in_frames` positive (14.13)
      - `from_frame + duration_in_frames ≤ total_frames` (14.14)
      - `|duration_seconds - duration_in_frames / fps| ≤ 0.001` (14.15)
    - Return `ValidationError[]` with `{field, rule, message}` for each violation
    - Check all rules (not fail-fast)
    - _Requirements: 14.1–14.16_

  - [x] 8.2 Write property test for required fields validation
    - **Property 17: Required Fields Validation**
    - **Validates: Requirements 14.1**

  - [x] 8.3 Write property test for enum field validation
    - **Property 18: Enum Field Validation**
    - **Validates: Requirements 14.2, 14.11**

  - [x] 8.4 Write property test for numeric constraint validation
    - **Property 19: Numeric Constraint Validation**
    - **Validates: Requirements 14.3, 14.4, 14.8, 14.9, 14.10, 14.13**

  - [x] 8.5 Write property test for cross-field consistency validation
    - **Property 20: Cross-Field Consistency Validation**
    - **Validates: Requirements 14.5, 14.6, 14.7, 14.14, 14.15**

  - [x] 8.6 Write property test for clip ID uniqueness validation
    - **Property 21: Clip ID Uniqueness Validation**
    - **Validates: Requirements 14.12**

  - [x] 8.7 Write property test for validation failure prevents annotated status
    - **Property 22: Validation Failure Prevents Annotated Status**
    - **Validates: Requirements 14.16**

- [x] 9. Annotation Service
  - [x] 9.1 Implement Annotation Service
    - Create `src/services/annotation-service.ts` implementing the `AnnotationService` interface
    - Implement `getAnnotation` and `updateAnnotation` with partial update support
    - Integrate `SchemaValidator` for validation on every update
    - Implement auto-population of computed fields: `duration_seconds` from frames/fps, `beats_total` from BPM and duration, `bars_total` from beats, `estimated_tempo_bpm` from source analysis, `trim_safe_start_seconds` to 0.0, `trim_safe_end_seconds` to clip duration
    - Implement `calculateCompleteness`: count filled required fields / 24 total required fields
    - Implement `exportProject`: serialize full state as `AnnotationProjectFile` with schema v2.0
    - Implement `importProject`: parse JSON, verify source files exist on disk, return `ImportResult` with missing files list
    - Prevent status transition to `annotated` when validation errors exist
    - _Requirements: 7.1, 7.2, 7.3, 9.1, 9.2, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.16_

  - [x] 9.2 Write property test for duration calculation consistency
    - **Property 11: Duration Calculation Consistency**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 9.3 Write property test for annotation completeness calculation
    - **Property 15: Annotation Completeness Calculation**
    - **Validates: Requirements 13.6**

  - [x] 9.4 Write property test for import rejects missing source files
    - **Property 14: Import Rejects Missing Source Files**
    - **Validates: Requirements 13.3**

  - [x] 9.5 Write property test for serialization round-trip
    - **Property 23: Serialization Round-Trip**
    - **Validates: Requirements 18.1, 18.3**

  - [x] 9.6 Write property test for export schema conformance
    - **Property 24: Export Schema Conformance**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.6, 18.2**

- [x] 10. Manifest Service and Project Persistence
  - [x] 10.1 Implement manifest tracking and project file I/O
    - Create `src/services/project-service.ts` for reading/writing `project.json` and `manifest.json`
    - Implement manifest computation: `sources_count`, `clips_total`, `clips_by_status` (summing to total), `annotation_completeness`
    - Auto-save `project.json` on every annotation update (debounced)
    - Update `manifest.json` on every state change
    - _Requirements: 13.1, 13.7, 15.2, 15.3, 15.4_

  - [x] 10.2 Write property test for manifest consistency
    - **Property 16: Manifest Consistency**
    - **Validates: Requirements 13.7**

- [x] 11. Checkpoint — Validate all services and validation logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Export Service
  - [x] 12.1 Implement Export Service
    - Create `src/services/export-service.ts` implementing the `ExportService` interface
    - Implement `exportClip`: use Remotion `renderMedia()` with clip's frame range, output to `exports/{clip_id}.mp4`
    - Implement `exportBatch`: filter out discarded clips, iterate with progress callback
    - Preserve original video quality and fps, include audio track
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 16.8_

  - [x] 12.2 Write property test for batch export filters discarded clips
    - **Property 12: Batch Export Filters Discarded Clips**
    - **Validates: Requirements 12.2**

  - [x] 12.3 Write property test for export file naming convention
    - **Property 13: Export File Naming Convention**
    - **Validates: Requirements 12.5**

- [x] 13. API Routes
  - [x] 13.1 Implement ingestion and analysis API routes
    - Create `src/pages/api/ingest.ts` — POST handler: validate URL, spawn yt-dlp, stream SSE progress, return `SourceMetadata`
    - Create `src/pages/api/analyze/[sourceId].ts` — POST handler: trigger audio analysis, return `AudioAnalysisResult`
    - _Requirements: 1.1, 1.3, 1.6, 1.7, 2.1, 2.10, 2.11_

  - [x] 13.2 Implement clip management API routes
    - Create `src/pages/api/clips/generate.ts` — POST handler: generate virtual clips from cycles with `{sourceId, beatCount}`
    - Create `src/pages/api/clips/index.ts` — GET handler: list all clips with status and completeness
    - Create `src/pages/api/clips/[id]/index.ts` — GET handler: get clip definition + annotation
    - Create `src/pages/api/clips/[id]/annotation.ts` — PUT handler: update annotation fields, trigger validation + auto-save
    - Create `src/pages/api/clips/[id]/status.ts` — PUT handler: update clip status
    - Create `src/pages/api/clips/merge.ts` — POST handler: merge two adjacent clips
    - Create `src/pages/api/clips/[id]/split.ts` — POST handler: split clip at frame
    - Create `src/pages/api/clips/[id]/boundary.ts` — PUT handler: adjust clip boundary
    - _Requirements: 4.1, 4.2, 5.6, 5.7, 5.8, 5.9, 13.1_

  - [x] 13.3 Implement beat grid adjustment API routes
    - Create `src/pages/api/beatgrid/downbeat.ts` — PUT handler: set new downbeat index, recompute cycles and clips
    - Create `src/pages/api/beatgrid/shift.ts` — PUT handler: shift beat grid by offset, recompute cycles and clips
    - _Requirements: 3.5, 3.6_

  - [x] 13.4 Implement export and project API routes
    - Create `src/pages/api/export/[id].ts` — POST handler: export single clip to MP4
    - Create `src/pages/api/export/batch.ts` — POST handler: export all non-discarded clips
    - Create `src/pages/api/project/index.ts` — GET handler: return project manifest
    - Create `src/pages/api/project/export.ts` — POST handler: export full project JSON
    - Create `src/pages/api/project/import.ts` — POST handler: import project JSON with source file verification
    - _Requirements: 12.1, 12.2, 13.2, 13.3, 13.4, 17.1, 18.1_

- [x] 14. Checkpoint — Validate API routes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Remotion Composition and Virtual Clip Component
  - [x] 15.1 Implement Remotion composition and VirtualClip component
    - Create `src/remotion/Root.tsx` registering the source video `<Composition>` with dynamic fps, dimensions, and frame count
    - Create `src/remotion/VirtualClip.tsx` implementing the `VirtualClipProps` interface: render `<OffthreadVideo>` with `startFrom`, overlay `<BeatOverlay>` and `<EnergyOverlay>`
    - Create `src/remotion/BeatOverlay.tsx`: use `useCurrentFrame()` to display current beat count, emphasize count 1 and count 5 with distinct styling
    - Create `src/remotion/EnergyOverlay.tsx`: render energy profile as waveform/intensity bar behind beat markers using `visualizeAudio()` from `@remotion/media-utils`
    - _Requirements: 1.5, 5.1, 5.4, 5.5, 16.4_

- [x] 16. React Island — Clip Browser
  - [x] 16.1 Implement ClipGrid and PlayerWrapper React islands
    - Create `src/components/ClipGrid.tsx` implementing `ClipGridProps`: display clips in list/grid view with status indicators, annotation completeness percentage, and selection handling
    - Create `src/components/ClipCard.tsx`: show clip thumbnail info (start time, end time, cycle number, beat range, status badge)
    - Create `src/components/PlayerWrapper.tsx` implementing `PlayerWrapperProps`: embed Remotion `<Player>` with the `VirtualClip` component, wire `controls`, `loop`, and frame change callback
    - Create `src/components/ClipControls.tsx`: merge, split, discard buttons wired to API calls
    - Implement keyboard shortcuts: play/pause (Space), next clip (→), previous clip (←), frame step (. and ,)
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10_

- [x] 17. React Island — Annotation Form
  - [x] 17.1 Implement Identity & Classification section
    - Create `src/components/annotation/IdentitySection.tsx`: `clip_id` (auto-populated, editable), `move_name` (free text), `move_label` (dropdown from controlled vocabulary), `move_family` (optional text), `move_variant` (optional text), `tags` (free-form tag input), `difficulty` dropdown, `energy_level` dropdown, `style` dropdown
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 17.2 Implement Musical Phrasing section
    - Create `src/components/annotation/PhrasingSection.tsx`: `estimated_tempo_bpm` (auto-populated, editable), `duration_seconds` (auto-calculated, read-only), `beats_total` (auto-calculated), `bars_total` (auto-calculated), `phrase_resolution` dropdown, `completion_profile` sub-fields (`basico_completion_counts` integer input, `tempo_feel` dropdown, `accent_pattern` dropdown, `syncopation_level` float slider 0.0–1.0)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 17.3 Implement Entry/Exit State section
    - Create `src/components/annotation/EntryExitSection.tsx`: reusable `DancerStateForm` component used for both `entry_state` and `exit_state`
    - Include all fields: `hold` dropdown, `leader_weight_foot` / `follower_weight_foot` dropdowns, `leader_facing` / `follower_facing` dropdowns, `body_orientation_degrees` numeric (0–360), `relative_position` dropdown, `travel_direction` dropdown, `rotation_direction` dropdown, `rotation_degrees` numeric (≥0), `distance_profile` dropdown, `frame_tension` dropdown, `hand_connections` multi-select
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [x] 17.4 Implement Trim Profile section
    - Create `src/components/annotation/TrimSection.tsx`: `trim_safe_start_seconds` (auto-set to 0.0, editable), `trim_safe_end_seconds` (auto-set to duration, editable), `trim_safe_windows` (list of start/end pairs with add/remove), `loopable` boolean toggle, `preferred_entry_beats` and `preferred_exit_beats` multi-value numeric inputs
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 17.5 Implement Motion Profile section
    - Create `src/components/annotation/MotionSection.tsx`: `travel_amount` dropdown, `footwork_complexity` dropdown, `upper_body_isolation` dropdown, `spin_count` numeric (≥0), `dip` / `headroll` / `bodywave` boolean toggles, `leader_dominant_motion` / `follower_dominant_motion` dropdowns
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 17.6 Implement Camera & Quality Profile section
    - Create `src/components/annotation/CameraQualitySection.tsx`: `camera_angle` dropdown, `framing` dropdown, `camera_profile.visibility_score` float (0.0–1.0), `camera_profile.occlusion_score` float (0.0–1.0), `quality_profile.visibility_score` float, `quality_profile.boundary_cleanliness` float, `quality_profile.teaching_clarity` float, `quality_profile.stitchability` float
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 17.7 Assemble AnnotationForm with completeness indicator and validation errors
    - Create `src/components/AnnotationForm.tsx` implementing `AnnotationFormProps`: compose all sections, wire `onFieldChange` to API PUT, display inline validation errors per field, show completeness percentage bar
    - _Requirements: 13.5, 13.6, 14.16_

- [x] 18. Astro Pages and Layout
  - [x] 18.1 Create Astro pages wiring all React islands together
    - Create `src/pages/index.astro`: main page with URL input form, download progress display, and navigation to clip review
    - Create `src/pages/review.astro`: clip review page embedding `ClipGrid`, `PlayerWrapper`, and `AnnotationForm` islands
    - Create `src/layouts/Layout.astro`: shared layout with project name and manifest summary
    - Wire SSE for download progress from `/api/ingest`
    - _Requirements: 1.3, 5.1, 5.2, 16.2, 16.3_

- [x] 19. Checkpoint — Validate full UI integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Final integration and wiring
  - [x] 20.1 End-to-end wiring: ingest → analyze → clips → review → annotate → export
    - Verify the full flow: URL input triggers download, download completion triggers audio analysis, analysis completion generates virtual clips, clips load in the Remotion Player, annotations save and validate, export produces MP4 files
    - Wire multi-source support: multiple YouTube URLs into the same project, each source tracked independently via `source_id`
    - Ensure `project.json` and `manifest.json` stay in sync across all operations
    - _Requirements: 15.3, 15.4, 16.9, 16.10_

  - [x] 20.2 Write integration tests for subprocess pipelines
    - Test yt-dlp subprocess produces video + audio files
    - Test librosa subprocess returns valid JSON for a known WAV
    - Test Remotion `renderMedia()` produces valid MP4
    - _Requirements: 1.1, 2.1, 12.1_

- [x] 21. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document (24 properties total)
- The Python analyzer (`analyze.py`) is tested separately with pytest
- All React islands use controlled vocabularies from `src/types/enums.ts` for dropdown values
