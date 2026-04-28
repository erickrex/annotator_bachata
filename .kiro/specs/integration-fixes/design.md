# Integration Fixes Bugfix Design

## Overview

The Bachata Clip Slicer & Annotator has a solid pure logic layer (213 passing tests) but 8 integration bugs prevent the end-to-end workflow from functioning. These bugs span: workflow orchestration, preview wiring, annotation seeding, persistence/restore, beat overlay frame math, build configuration, error handling, and duplicated logic. The fix strategy is minimal and surgical — wire existing services together correctly, fix frame math, add an Astro adapter, and remove duplication — without changing any pure logic that existing tests cover.

## Glossary

- **Bug_Condition (C)**: The set of conditions across 8 bugs that cause the integrated application to malfunction despite correct pure logic
- **Property (P)**: The desired behavior for each bug — correct orchestration, wiring, seeding, persistence, frame math, build, error handling, and single-source-of-truth completeness
- **Preservation**: All 213 existing tests must continue to pass; all existing API contracts, SSE streaming, clip management operations, annotation validation, and keyboard shortcuts must remain unchanged
- **AppState**: The singleton in `src/services/app-state.ts` holding `annotationService`, `clips`, `cycles`, `analysisResults`, `sourceMetadata`
- **VirtualClipDef**: The clip definition type with `remotion.fromFrame`, `durationInFrames`, `beatMarkerFrames`
- **AnnotationServiceImpl**: The service in `src/services/annotation-service.ts` managing annotation CRUD, validation, completeness, and project export/import
- **CycleHierarchy**: Beat-aligned cycle structure produced by `buildCycles()` and consumed by `createClips()`

## Bug Details

### Bug Condition

The bugs manifest across 8 distinct conditions in the integrated application. Each bug is independently triggerable but collectively they prevent the end-to-end workflow from functioning.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type AppInteraction
  OUTPUT: boolean

  // Bug 1: User completes ingest and expects clips on review page
  IF input.action == 'ingest_complete' AND NOT analyzeAndGenerateTriggered(input)
    RETURN true

  // Bug 2: User selects clip and expects video preview
  IF input.action == 'select_clip' AND sourceVideoPath == ''
    RETURN true

  // Bug 3: User selects clip and expects frame/nav callbacks
  IF input.action == 'select_clip' AND (onFrameChange == undefined OR onNextClip == undefined OR onPrevClip == undefined)
    RETURN true

  // Bug 4: Clips generated but no annotation records seeded
  IF input.action == 'generate_clips' AND NOT annotationSeeded(input.clipIds)
    RETURN true

  // Bug 5: Auto-save omits clips/cycles/analysisResults
  IF input.action == 'auto_save' AND NOT fullStatePersisted(input.projectJson)
    RETURN true

  // Bug 6: Server restarts with existing project.json but state is empty
  IF input.action == 'server_start' AND projectJsonExists AND appStateEmpty
    RETURN true

  // Bug 7: BeatOverlay uses source-absolute frames vs clip-relative currentFrame
  IF input.action == 'render_beat_overlay' AND clip.remotion.fromFrame > 0 AND beatMarkers NOT offset
    RETURN true

  // Bug 8: astro build with output:'server' and no adapter
  IF input.action == 'astro_build' AND adapterNotConfigured
    RETURN true

  // Bug 9: Ingest error response has body but condition checks !res.body
  IF input.action == 'ingest_error' AND res.ok == false AND res.body != null
    RETURN true

  // Bug 10: ClipGrid local completeness treats 0 as empty vs service treats 0 as filled
  IF input.action == 'display_completeness' AND annotation HAS numeric_zero_fields
    RETURN true

  RETURN false
END FUNCTION
```

### Examples

- **Bug 1**: User pastes a YouTube URL, download completes successfully, clicks "Go to Clip Review →", sees an empty clip list because `/api/analyze/:sourceId` and `/api/clips/generate` were never called.
- **Bug 2**: User selects clip `src001_c001_016` in the review page, PlayerWrapper receives `sourceVideoPath=""`, Remotion player shows a black screen.
- **Bug 3**: User presses ← or → arrow keys while a clip is selected, nothing happens because `onNextClip`/`onPrevClip` are not passed. Split-at-frame always uses `currentFrame=0` because `onFrameChange` is not wired.
- **Bug 4**: After clip generation, user selects a clip, the right panel shows "Select a clip to annotate" instead of the AnnotationForm because `annotations.get(clipId)` returns `undefined`.
- **Bug 5**: User annotates several clips, server restarts, all clips and cycles are gone because `project.json` only contained annotations and sources.
- **Bug 6**: `project.json` exists on disk from a previous session, but `getAppState()` creates a fresh empty state without reading it.
- **Bug 7**: Clip starting at source frame 3000 has beat markers at [3000, 3060, 3120, ...]. `useCurrentFrame()` returns 0, 1, 2, ... (clip-relative). The comparison `frame >= beatMarkers[i]` never matches until frame 3000, so beat count stays at 1 for the entire clip.
- **Bug 8**: Running `npx astro build` fails immediately with `NoAdapterInstalled` error.
- **Bug 9**: Submitting an invalid URL returns HTTP 400 with a JSON body. The check `!res.ok && !res.body` is false (body exists), so the code falls through to SSE parsing, which fails silently or shows confusing errors.
- **Bug 10**: A clip with `estimated_tempo_bpm: 0` (auto-populated default) is counted as "filled" by the annotation service but "empty" by ClipGrid's local function, producing different completeness percentages.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All 213 existing unit/property tests must continue to pass without modification
- All 14 Python analyzer tests must continue to pass
- SSE progress streaming during ingest (progress percentage, speed, ETA) must work identically
- Clip management operations (merge, split, discard, boundary adjust) via API must work identically
- Annotation field updates via `PUT /api/clips/:id/annotation` must work identically
- Schema validation (cross-field, enum, numeric, required field checks) must produce identical results
- `annotationService.exportProject()` must continue to include `schema_version`, `project` metadata, `sources`, `enum_definitions`, and `clips`
- PlayerWrapper keyboard shortcuts (Space, comma, period, arrows) must continue to work when callbacks are provided
- `computeManifest()` pure function must produce identical results for identical inputs

**Scope:**
All inputs that do NOT involve the 8 bug conditions should be completely unaffected by these fixes. This includes:
- Direct API calls to existing endpoints with valid parameters
- Pure service-layer function calls (clip-manager, cycle-builder, schema-validator, url-validator)
- Remotion composition rendering logic (VirtualClip, EnergyOverlay)
- Python analyzer subprocess behavior

## Hypothesized Root Cause

Based on the bug analysis and code review, the root causes are:

1. **Bug 1 — Missing orchestration**: `src/pages/index.astro` only calls `/api/ingest` and shows a "Go to Review" link. No client-side code triggers the analyze or generate steps. The SSE `complete` event includes `metadata.sourceId` but the handler only shows the link.

2. **Bug 2 — Hardcoded empty path**: `ReviewApp.tsx` line `<PlayerWrapper clip={selectedClip} sourceVideoPath="" />` passes an empty string. The source video path should be derived from the clip's `sourceId` by looking up the source record's `video_file` field.

3. **Bug 3 — Missing callbacks**: `ReviewApp.tsx` does not pass `onFrameChange`, `onNextClip`, or `onPrevClip` to `PlayerWrapper`. It also doesn't track `currentFrame` state or pass it to `ClipGrid` for split-at-frame.

4. **Bug 4 — No annotation seeding**: `POST /api/clips/generate` calls `createClips()` and stores clips in `state.clips` but never calls `annotationService.updateAnnotation()` to seed initial annotation records with clip metadata.

5. **Bug 5 & 6 — Incomplete persistence**: `autoSave()` calls `annotationService.exportProject()` which only serializes `sources` and `clips` (annotations). The `state.clips` (VirtualClipDef map), `state.cycles`, and `state.analysisResults` are not persisted. On startup, `getAppState()` creates a fresh empty state and never calls `loadProject()`.

6. **Bug 7 — Source-absolute beat frames**: `interpolateBeatFrames()` in `clip-manager.ts` produces frames in source-absolute space (e.g., `cycle.startFrame + t * (cycle.endFrame - cycle.startFrame)`). These are stored in `VirtualClipDef.beatMarkerFrames`. But `BeatOverlay` uses `useCurrentFrame()` which returns clip-relative frames (0-based). The comparison `frame >= beatMarkers[i]` is in mismatched coordinate spaces.

7. **Bug 8 — Missing Astro adapter**: `astro.config.mjs` has `output: 'server'` but no adapter. Astro requires an adapter for SSR mode. `@astrojs/node` is the standard choice for local Node.js SSR.

8. **Bug 9 — Flawed error condition**: `index.astro` checks `if (!res.ok && !res.body)` — the `&&` means both conditions must be true. But HTTP error responses from the API always have a JSON body, so `!res.body` is false, and the entire condition is false. The fix is to check only `!res.ok`.

9. **Bug 10 — Duplicated completeness with different semantics**: `ClipGrid.tsx` has a local `calculateCompleteness()` that treats `val === 0` as unfilled. `AnnotationServiceImpl.calculateCompleteness()` uses `isFilledValue()` which treats `0` as filled (only `undefined`, `null`, and empty string are unfilled). The local function should be removed and completeness should come from the API response.

## Correctness Properties

Property 1: Bug Condition - Ingest-to-Review Flow Completeness

_For any_ successful ingest where the SSE stream emits a `complete` event with a valid `sourceId`, the client-side code SHALL automatically trigger analysis and clip generation so that navigating to `/review` shows a populated clip list.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Source Video Path Resolution

_For any_ clip selection in ReviewApp where the clip has a valid `sourceId`, the system SHALL resolve and pass the correct `sourceVideoPath` to PlayerWrapper by looking up the source's `video_file` from the API.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Player Callback Wiring

_For any_ clip selection in ReviewApp, the system SHALL pass `onFrameChange`, `onNextClip`, and `onPrevClip` callbacks to PlayerWrapper, and track `currentFrame` state for split-at-frame operations.

**Validates: Requirements 2.3**

Property 4: Bug Condition - Annotation Seeding on Clip Generation

_For any_ clip generated via `/api/clips/generate`, the system SHALL seed an initial annotation record in the annotation service with `source_id`, `remotion` fields, and `status: 'pending'`, so that the AnnotationForm renders immediately when the clip is selected.

**Validates: Requirements 2.4, 2.5**

Property 5: Bug Condition - Full State Persistence and Restore

_For any_ auto-save operation, the system SHALL persist the complete application state (clips, cycles, analysis results) alongside annotations and sources. On server startup with an existing `project.json`, the system SHALL restore all state.

**Validates: Requirements 2.6, 2.7**

Property 6: Bug Condition - Beat Overlay Frame Space Correction

_For any_ clip with `fromFrame > 0`, the beat marker frames passed to BeatOverlay SHALL be in clip-relative space (offset by subtracting `fromFrame`), so that `useCurrentFrame()` values correctly correspond to beat positions.

**Validates: Requirements 2.8**

Property 7: Bug Condition - Astro Build Success

_For any_ invocation of `npx astro build`, the system SHALL complete successfully by having `@astrojs/node` adapter installed and configured in `astro.config.mjs`.

**Validates: Requirements 2.9**

Property 8: Bug Condition - Ingest Error Handling

_For any_ non-OK response from `/api/ingest` (regardless of whether the response has a body), the system SHALL surface the JSON error message to the user instead of falling through to SSE parsing.

**Validates: Requirements 2.10**

Property 9: Bug Condition - Single-Source Completeness

_For any_ clip displayed in ClipGrid, the completeness value SHALL come from the canonical `AnnotationServiceImpl.calculateCompleteness()` (via API), not from a local duplicate function.

**Validates: Requirements 2.11**

Property 10: Preservation - Existing Test Suite

_For any_ input covered by the existing 213 unit/property tests and 14 Python tests, the fixed code SHALL produce exactly the same results as the original code, preserving all pure logic behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/pages/index.astro`

**Bug 1 — Wire ingest → analyze → generate flow:**
1. After the SSE `complete` event, extract `metadata.sourceId` from the event payload
2. Call `POST /api/analyze/${sourceId}` and wait for completion
3. Call `POST /api/clips/generate` with `{ sourceId, beatCount: 16 }` and wait for completion
4. Update progress UI to show "Analyzing..." and "Generating clips..." phases
5. Only show the "Go to Clip Review" link after all three steps succeed

**Bug 9 — Fix error handling condition:**
6. Change `if (!res.ok && !res.body)` to `if (!res.ok)` so that error responses with bodies are correctly caught and their JSON error messages displayed

**File**: `src/components/ReviewApp.tsx`

**Bug 2 — Wire source video path:**
1. Add state for `sources` (Map of sourceId → source record) fetched from the clips API or a dedicated endpoint
2. When a clip is selected, look up `sources.get(clip.sourceId)?.video_file` to get the relative path
3. Pass the resolved path to `PlayerWrapper` as `sourceVideoPath`

**Bug 3 — Wire player callbacks:**
4. Add `currentFrame` state, updated via `onFrameChange` callback
5. Add `onNextClip` callback that selects the next non-discarded clip in the list
6. Add `onPrevClip` callback that selects the previous non-discarded clip in the list
7. Pass `currentFrame` to `ClipGrid` for split-at-frame
8. Pass all three callbacks to `PlayerWrapper`

**File**: `src/pages/api/clips/generate.ts`

**Bug 4 — Seed annotations:**
1. After `createClips()`, iterate over generated clips
2. For each clip, call `state.annotationService.updateAnnotation(clip.clipId, { source_id: clip.sourceId, status: 'pending', remotion: { from_frame: clip.remotion.fromFrame, duration_in_frames: clip.remotion.durationInFrames, fps: clip.remotion.fps } })`
3. This triggers auto-populate which fills `duration_seconds`, `estimated_tempo_bpm`, `beats_total`, `bars_total`, and `trim_profile`

**File**: `src/services/app-state.ts`

**Bug 5 & 6 — Full persistence and restore:**
1. Extend `autoSave()` to persist `state.clips`, `state.cycles`, and `state.analysisResults` alongside the annotation project file. The simplest approach: add `clips`, `cycles`, and `analysis_results` fields to the saved `project.json` as additional top-level keys (outside the annotation schema but in the same file for simplicity)
2. Extend `getAppState()` to call `loadProject()` on first initialization and hydrate `state.clips`, `state.cycles`, `state.analysisResults`, and import annotations/sources via `annotationService.importProject()`
3. Add serialization helpers to convert Maps to/from JSON-safe arrays of `[key, value]` pairs

**File**: `src/services/project-service.ts`

**Bug 5 & 6 — Extended project file format:**
1. Define an `ExtendedProjectFile` type that extends `AnnotationProjectFile` with optional `virtual_clips`, `cycle_hierarchies`, and `analysis_results` fields
2. Update `saveProject()` to accept the extended format
3. Update `loadProject()` to return the extended format

**File**: `src/services/clip-manager.ts`

**Bug 7 — Convert beat markers to clip-relative space:**
1. In `createClips()`, after collecting `beatMarkerFrames` from `interpolateBeatFrames()`, subtract `fromFrame` from each marker: `beatMarkerFrames.map(f => f - fromFrame)`
2. This makes beat markers 0-based relative to the clip start, matching `useCurrentFrame()` in Remotion
3. Also apply the same offset in `mergeClips()`, `splitClip()`, and `adjustBoundary()` to maintain consistency

**File**: `astro.config.mjs`

**Bug 8 — Add Astro adapter:**
1. Install `@astrojs/node` as a dependency
2. Import and configure the adapter: `import node from '@astrojs/node'` and add `adapter: node({ mode: 'standalone' })` to the config

**File**: `package.json`

**Bug 8 — Add adapter dependency:**
1. Add `"@astrojs/node": "^9.1.0"` to `dependencies`

**File**: `src/components/ClipGrid.tsx`

**Bug 10 — Remove duplicated completeness:**
1. Remove the local `calculateCompleteness()` function entirely
2. Accept completeness values from the parent (`ReviewApp`) which gets them from the API response (the `/api/clips` endpoint already returns `completeness` per clip)
3. Update `ClipGridProps` to accept a `completenessMap` or have the clips array include completeness values

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise each bug condition on the unfixed code to observe failures and confirm root causes.

**Test Cases**:
1. **Ingest Flow Test**: Simulate a complete ingest, verify that `/api/analyze` and `/api/clips/generate` are NOT called automatically (will fail on unfixed code — confirms Bug 1)
2. **Source Video Path Test**: Render ReviewApp with a selected clip, verify `sourceVideoPath` is empty string (will fail on unfixed code — confirms Bug 2)
3. **Callback Wiring Test**: Render ReviewApp, verify `onFrameChange`/`onNextClip`/`onPrevClip` are not passed to PlayerWrapper (will fail on unfixed code — confirms Bug 3)
4. **Annotation Seeding Test**: Call `/api/clips/generate`, then check `annotationService.getAnnotation(clipId)` returns null (will fail on unfixed code — confirms Bug 4)
5. **Persistence Test**: Call `autoSave()`, read `project.json`, verify `state.clips` data is missing (will fail on unfixed code — confirms Bug 5)
6. **Restore Test**: Write a `project.json` with clip data, call `getAppState()`, verify `state.clips` is empty (will fail on unfixed code — confirms Bug 6)
7. **Beat Frame Space Test**: Create a clip with `fromFrame=3000`, verify `beatMarkerFrames[0] >= 3000` (source-absolute, not clip-relative) (will fail on unfixed code — confirms Bug 7)
8. **Build Test**: Run `npx astro build`, verify it fails with `NoAdapterInstalled` (will fail on unfixed code — confirms Bug 8)
9. **Error Handling Test**: Simulate a non-OK fetch response with a body, verify the condition `!res.ok && !res.body` evaluates to false (will fail on unfixed code — confirms Bug 9)
10. **Completeness Divergence Test**: Create an annotation with `estimated_tempo_bpm: 0`, compare local vs service completeness (will fail on unfixed code — confirms Bug 10)

**Expected Counterexamples**:
- Bug 1: Review page shows 0 clips after successful ingest
- Bug 7: `beatMarkerFrames[0]` equals `cycle.startFrame` (e.g., 3000) instead of 0
- Bug 10: Local completeness = 17/23, service completeness = 18/23 for same annotation

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Run the existing 213 tests on the fixed code to verify preservation. Write additional property-based tests for the frame-space conversion (Bug 7) since that touches pure logic in `clip-manager.ts`.

**Test Cases**:
1. **Existing Test Suite Preservation**: Run `npm test` — all 213 tests must pass
2. **Python Test Preservation**: Run `uv run pytest` — all 14 tests must pass
3. **Clip Manager Preservation**: Verify `mergeClips()`, `splitClip()`, `adjustBoundary()` produce correct results with clip-relative beat markers
4. **Annotation Service Preservation**: Verify `calculateCompleteness()`, `validate()`, `exportProject()`, `importProject()` produce identical results
5. **Schema Validator Preservation**: Verify all validation rules produce identical errors for identical inputs

### Unit Tests

- Test that `createClips()` produces clip-relative beat markers (all markers >= 0 and < durationInFrames)
- Test that annotation seeding in `/api/clips/generate` creates records with correct `source_id` and `remotion` fields
- Test that extended `project.json` round-trips correctly (save then load restores clips, cycles, analysis results)
- Test that `getAppState()` hydrates from existing `project.json` on first call
- Test that the error handling condition `!res.ok` catches all error responses

### Property-Based Tests

- Generate random cycle hierarchies and verify all beat markers in generated clips are in range `[0, durationInFrames)`
- Generate random clip selections and verify `mergeClips()` produces markers that are still clip-relative
- Generate random annotations with zero-valued numeric fields and verify completeness is consistent between API and UI

### Integration Tests

- Test full ingest → analyze → generate flow produces clips visible on the review page
- Test that server restart with existing `project.json` restores all clips and annotations
- Test that selecting a clip shows the annotation form with pre-populated fields
