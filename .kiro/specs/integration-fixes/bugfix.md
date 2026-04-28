# Bugfix Requirements Document

## Introduction

The Bachata Clip Slicer & Annotator has a solid pure logic layer (213 passing tests) but the integrated application has 8 issues preventing it from functioning as a complete product. These bugs span the core user workflow, clip preview wiring, annotation seeding, persistence/restore, beat overlay frame math, build configuration, error handling, and duplicated logic. Together they make the end-to-end ingest → analyze → generate → review → annotate → export flow non-functional.

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — Core user flow is broken**

1.1 WHEN a user successfully ingests a YouTube video via the ingest page THEN the system only calls `/api/ingest` and links to `/review` without ever triggering `/api/analyze/:sourceId` or `/api/clips/generate`, resulting in an empty review screen with no clips.

**Bug 2 — Clip preview is not wired**

1.2 WHEN a user selects a clip in ReviewApp THEN the system renders PlayerWrapper with `sourceVideoPath=""`, so the video player cannot load any source video for preview playback.

1.3 WHEN a user selects a clip in ReviewApp THEN the system does not pass `onFrameChange`, `onNextClip`, or `onPrevClip` callbacks to PlayerWrapper, so split-at-frame uses stale `currentFrame=0` and keyboard clip navigation (←/→) is dead.

**Bug 3 — Annotation cannot start for new clips**

1.4 WHEN clips are generated via `/api/clips/generate` THEN the system creates VirtualClipDef objects in `state.clips` but never seeds corresponding annotation records in the annotation service.

1.5 WHEN a newly generated clip is selected in ReviewApp THEN the system only shows the AnnotationForm when `selectedAnnotation` is truthy, so clips without seeded annotations show no annotation form.

**Bug 4 — Persistence is incomplete and restore is broken**

1.6 WHEN `annotationService.exportProject()` is called during auto-save THEN the system only serializes annotations and sources, omitting `state.clips`, `state.cycles`, and `state.analysisResults` from the persisted `project.json`.

1.7 WHEN the server restarts THEN the system creates a fresh empty `AppState` via `getAppState()` and never reads back `project.json`, so all generated clips, cycle hierarchies, and analysis results are lost.

**Bug 5 — Beat overlays use wrong frame space**

1.8 WHEN BeatOverlay renders for a clip that does not start at frame 0 THEN the system compares `useCurrentFrame()` (clip-relative) against `beatMarkerFrames` that are stored as source-absolute frame positions from `interpolateBeatFrames()`, causing inaccurate beat count display.

**Bug 6 — Build is broken**

1.9 WHEN `npx astro build` is run THEN the system fails with `NoAdapterInstalled` because `astro.config.mjs` has `output: 'server'` but no Astro SSR adapter is installed or configured.

**Bug 7 — Ingest error handling is flawed**

1.10 WHEN the `/api/ingest` endpoint returns a non-OK response that includes a body THEN the system's check `if (!res.ok && !res.body)` evaluates to false, causing the error response to fall through into SSE stream parsing instead of surfacing the JSON error message to the user.

**Bug 8 — Duplicated completeness logic**

1.11 WHEN ClipGrid calculates completeness for a clip annotation THEN the system uses a local `calculateCompleteness` function that treats `0` as empty (unfilled), while the canonical `AnnotationServiceImpl.calculateCompleteness` treats `0` as filled, producing inconsistent completeness percentages between the clip grid and the annotation service.

### Expected Behavior (Correct)

**Bug 1 — Core user flow**

2.1 WHEN a user successfully ingests a YouTube video THEN the system SHALL automatically trigger analysis (`/api/analyze/:sourceId`) and clip generation (`/api/clips/generate`) so that the review page is populated with clips without requiring manual API calls.

**Bug 2 — Clip preview wiring**

2.2 WHEN a user selects a clip in ReviewApp THEN the system SHALL pass the correct source video file path to PlayerWrapper so the video player can load and play the clip's source video.

2.3 WHEN a user selects a clip in ReviewApp THEN the system SHALL pass `onFrameChange`, `onNextClip`, and `onPrevClip` callbacks to PlayerWrapper so that the current frame tracks playback position and keyboard clip navigation (←/→) works.

**Bug 3 — Annotation seeding**

2.4 WHEN clips are generated via `/api/clips/generate` THEN the system SHALL seed an initial annotation record for each generated clip in the annotation service, pre-populated with clip and source metadata (source_id, remotion fields, detected BPM).

2.5 WHEN a newly generated clip is selected in ReviewApp THEN the system SHALL display the AnnotationForm regardless of whether the annotation has been manually edited, since a seeded annotation record exists.

**Bug 4 — Persistence and restore**

2.6 WHEN the project is auto-saved THEN the system SHALL persist the complete application state including clips, cycle hierarchies, and analysis results alongside annotations and sources in `project.json`.

2.7 WHEN the server starts and a `project.json` file exists THEN the system SHALL restore the full application state from that file, including clips, cycles, analysis results, and annotations, so that no data is lost across restarts.

**Bug 5 — Beat overlay frame space**

2.8 WHEN BeatOverlay renders for any clip THEN the system SHALL use beat marker frames that are relative to the clip's start frame (i.e., offset by subtracting `fromFrame`), so that `useCurrentFrame()` values correctly correspond to beat positions.

**Bug 6 — Build**

2.9 WHEN `npx astro build` is run THEN the system SHALL complete successfully by having a compatible Astro SSR adapter installed and configured in `astro.config.mjs`.

**Bug 7 — Ingest error handling**

2.10 WHEN the `/api/ingest` endpoint returns a non-OK response THEN the system SHALL check only `!res.ok` (not `!res.ok && !res.body`) to surface the JSON error message to the user, regardless of whether the response has a body.

**Bug 8 — Duplicated completeness logic**

2.11 WHEN ClipGrid needs to display completeness for a clip THEN the system SHALL use the canonical completeness calculation from the annotation service (via API) instead of a local duplicate, ensuring consistent completeness values throughout the application.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the pure logic layer functions (clip-manager, cycle-builder, schema-validator, annotation-service, url-validator) are called with valid inputs THEN the system SHALL CONTINUE TO produce correct results as validated by the existing 213 passing tests.

3.2 WHEN a user submits a valid YouTube URL on the ingest page THEN the system SHALL CONTINUE TO call `/api/ingest` and display SSE progress events (progress percentage, speed, ETA) during download.

3.3 WHEN a user interacts with clip management operations (merge, split, discard, boundary adjust) via the review UI THEN the system SHALL CONTINUE TO call the correct API endpoints and update the clip list in the UI.

3.4 WHEN a user edits annotation fields via the AnnotationForm THEN the system SHALL CONTINUE TO send partial updates to `/api/clips/:id/annotation`, receive validation results, and refresh the annotation state.

3.5 WHEN `annotationService.validate()` is called on a clip annotation THEN the system SHALL CONTINUE TO return the same validation errors for the same inputs, including cross-field validation and enum checks.

3.6 WHEN `annotationService.exportProject()` is called THEN the system SHALL CONTINUE TO include `schema_version`, `project` metadata, `sources`, `enum_definitions`, and `clips` (annotations) in the output.

3.7 WHEN the Python analyzer (`uv run pytest`) tests are run THEN the system SHALL CONTINUE TO pass all 14 existing tests without modification.

3.8 WHEN PlayerWrapper receives valid `onNextClip`/`onPrevClip` callbacks THEN the system SHALL CONTINUE TO support Space (play/pause), comma/period (frame step), and arrow key shortcuts as currently implemented.
