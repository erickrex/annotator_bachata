# Implementation Plan: Codebase Cleanup

## Overview

This plan implements seven interconnected cleanup efforts in safe incremental order: data model changes first (types, annotation service), then service-layer changes (beat markers, export, shutdown), then UI (preview player replacement), and finally dead code removal. Each step builds on the previous and ends with wiring and integration.

## Tasks

- [x] 1. Simplify data model and annotation types
  - [x] 1.1 Update `ClipAnnotation` interface in `src/types/index.ts`
    - Remove `embedding_refs` field from the interface
    - Remove `completion_profile` from the interface (or make fully optional)
    - Make fields optional per design: `move_label`, `energy_level`, `estimated_tempo_bpm`, `duration_seconds`, `beats_total`, `bars_total`, `phrase_resolution`, `song_position`, `entry_state`, `exit_state`, `trim_profile`, `motion_profile`, `camera_profile`, `quality_profile`
    - Keep required: `clip_id`, `source_id`, `status`, `remotion`, `move_name`, `difficulty`, `style`, `tags`
    - _Requirements: 4.1, 4.4, 4.5, 8.1, 9.1_

  - [x] 1.2 Update `AnnotationServiceImpl` in `src/services/annotation-service.ts`
    - Reduce `REQUIRED_FIELDS` array from 23 fields to the 10 required dot-paths: `clip_id`, `source_id`, `status`, `remotion.from_frame`, `remotion.duration_in_frames`, `remotion.fps`, `move_name`, `difficulty`, `style`, `tags`
    - Update `TOTAL_REQUIRED_FIELDS` constant to match
    - Update `createSkeleton()` to remove `embedding_refs` and `completion_profile` from the skeleton
    - Update `autoPopulate()` to stop requiring the removed fields
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 8.2_

  - [x] 1.3 Update `src/services/schema-validator.ts` to validate only the reduced required field set
    - Validation errors should only reference the reduced required fields
    - Unknown/optional fields should be silently preserved
    - _Requirements: 4.2, 4.3_

  - [x] 1.4 Write property test for annotation completeness (reduced field set)
    - **Property 2: Annotation completeness uses reduced field set only**
    - **Validates: Requirements 4.1, 4.3**

  - [x] 1.5 Write property test for validation (reduced required fields only)
    - **Property 3: Validation checks reduced required fields only**
    - **Validates: Requirements 4.2**

  - [x] 1.6 Update existing annotation service tests in `src/services/annotation-service.test.ts`
    - Adjust test expectations for the reduced field set
    - Remove references to `embedding_refs` and `completion_profile`
    - _Requirements: 4.1, 8.3_

  - [x] 1.7 Update schema validator tests in `src/services/schema-validator.test.ts`
    - Adjust test expectations for the reduced required fields
    - _Requirements: 4.2_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement data model deduplication (VirtualClipDef as single source of truth)
  - [x] 3.1 Update `getFullProjectState()` in `src/services/app-state.ts`
    - When serializing, derive each `ClipAnnotation.remotion` from the corresponding `VirtualClipDef` in `state.clips`
    - Ensure `clipToAnnotationFields()` is the single derivation point
    - Remove any code that independently sets `ClipAnnotation.remotion` outside this derivation
    - _Requirements: 9.2, 9.3, 9.4_

  - [x] 3.2 Write property test for ClipAnnotation.remotion derivation
    - **Property 6: ClipAnnotation.remotion derived from VirtualClipDef at serialization**
    - **Validates: Requirements 9.2, 9.3**

  - [x] 3.3 Write unit tests for data model deduplication
    - Test that updating VirtualClipDef timing propagates to ClipAnnotation on serialization
    - Test that no manual sync is needed between the two structures
    - _Requirements: 9.3, 9.4_

- [x] 4. Implement beat marker recomputation on trim
  - [x] 4.1 Create `src/services/beat-marker-utils.ts` with `recomputeBeatMarkers()` pure function
    - Compute absolute frame range from inPoint/outPoint × fps + fromFrame offset
    - Filter source beat grid frames to those within the absolute range
    - Subtract inPointFrame + fromFrame to make markers relative to trimmed start
    - Return empty array if no beats fall within range
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 4.2 Write property test for beat marker recomputation
    - **Property 5: Beat marker recomputation preserves only in-range beats relative to trim start**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x] 4.3 Update `src/pages/api/clips/[id]/trim.ts` to call `recomputeBeatMarkers()` after trim update
    - Import `recomputeBeatMarkers` from beat-marker-utils
    - Look up the source's `beat_grid_frames` from the annotation service
    - Recompute and assign `clip.beatMarkerFrames` before calling `autoSave()`
    - If source beat grid is unavailable, set `beatMarkerFrames` to empty array
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 4.4 Write unit tests for `recomputeBeatMarkers()`
    - Test with beats inside range, outside range, and empty grid
    - Test frame offset calculation correctness
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Refactor export service to use ffmpeg with trim support
  - [x] 6.1 Rewrite `src/services/export-service.ts` to use ffmpeg instead of Remotion
    - Replace `renderMedia()` with ffmpeg subprocess: `-ss {inPoint} -t {duration} -i {extractedFile} -c copy {output}`
    - Compute trim range: `inPoint ?? handleBefore` to `outPoint ?? (handleBefore + clipDuration)`
    - Write sidecar JSON (`{clipId}.json`) alongside the MP4 with annotation metadata
    - Update `exportClip()` and `exportBatch()` signatures per design
    - Handle errors: missing extracted file, ffmpeg non-zero exit, sidecar write failure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.6_

  - [x] 6.2 Write property test for export trim range computation
    - **Property 1: Export trim range computation**
    - **Validates: Requirements 2.1, 2.3**

  - [x] 6.3 Write property test for sidecar JSON written alongside export
    - **Property 4: Sidecar JSON written alongside export**
    - **Validates: Requirements 4.6**

  - [x] 6.4 Update export API routes (`src/pages/api/export/[id].ts`, `src/pages/api/export/batch.ts`)
    - Wire to the new export service signatures
    - Pass `VirtualClipDef` and `ClipAnnotation` to the export functions
    - _Requirements: 2.1, 2.4_

  - [x] 6.5 Update export service tests in `src/services/export-service.test.ts`
    - Test ffmpeg invocation arguments
    - Test fallback when no trim points are set
    - Test sidecar JSON content
    - _Requirements: 2.1, 2.2, 2.3, 4.6_

- [x] 7. Implement shutdown flush handler
  - [x] 7.1 Create `src/services/shutdown-handler.ts`
    - Register `SIGINT` and `SIGTERM` listeners
    - On signal: call `saver.flush()`, exit 0 on success, log to stderr and exit 1 on failure
    - Guard against double-flush with an `isShuttingDown` flag
    - No-op when no pending writes exist
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 7.2 Wire shutdown handler in `src/services/app-state.ts`
    - Import and call `registerShutdownHandlers(state.debouncedSaver)` during initialization
    - _Requirements: 5.1, 5.2_

  - [x] 7.3 Write unit tests for shutdown handler
    - Test flush is called on SIGINT/SIGTERM
    - Test no-op when no pending writes
    - Test non-zero exit on flush failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Replace Remotion Player with HTML5 video + canvas preview
  - [x] 9.1 Create `src/components/ClipPreviewPlayer.tsx`
    - Render HTML5 `<video>` element pointing at clip's extracted MP4 via `/api/media/...`
    - Render transparent `<canvas>` overlay (same dimensions) for beat markers and energy
    - Implement play/pause (Space), frame step (comma/period), prev/next clip (arrows)
    - On `timeupdate` + `requestAnimationFrame`, compute current frame and redraw canvas
    - Respect `inPoint`/`outPoint` by clamping playback range
    - Show "Not yet extracted" placeholder if `extractedFile` is not set
    - Show error state with retry button if video fails to load
    - Handle empty `beatMarkerFrames` or `energyProfile` gracefully
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 9.2 Update `src/components/ReviewApp.tsx` to use `ClipPreviewPlayer` instead of `PlayerWrapper`
    - Replace the `PlayerWrapper` import and usage with `ClipPreviewPlayer`
    - Pass the correct props per the new interface
    - _Requirements: 1.1, 1.7_

  - [x] 9.3 Write unit tests for `ClipPreviewPlayer`
    - Test keyboard shortcuts (Space, comma, period, arrows)
    - Test video src computation from extractedFile
    - Test clip change behavior (pause + load new)
    - _Requirements: 1.4, 1.5, 1.6, 1.7_

- [x] 10. Remove dead code and endpoints
  - [x] 10.1 Delete `src/pages/api/clips/[id]/boundary.ts`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 10.2 Remove `adjustBoundary` function from `src/services/clip-manager.ts`
    - Remove the function and the `snapToNearest` helper if no longer used elsewhere
    - _Requirements: 3.4_

  - [x] 10.3 Delete `src/pages/api/beatgrid/shift.ts` and `src/pages/api/beatgrid/downbeat.ts`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 10.4 Remove `@remotion/player` from `package.json` dependencies
    - Run `npm install` to update lockfile
    - Keep `@remotion/renderer` only if overlay export is still needed, otherwise remove all Remotion deps
    - _Requirements: 1.8_

  - [x] 10.5 Delete `src/components/PlayerWrapper.tsx` (replaced by ClipPreviewPlayer)
    - Remove any remaining imports of PlayerWrapper across the codebase
    - _Requirements: 1.1_

  - [x] 10.6 Verify no remaining references to removed code
    - Search for `adjustBoundary`, `boundary`, `beatgrid/shift`, `beatgrid/downbeat`, `PlayerWrapper`, `embedding_refs`, `completion_profile` across the codebase
    - Fix or remove any stale references found
    - _Requirements: 3.4, 6.3, 8.2_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between major phases
- Property tests validate universal correctness properties from the design document
- The ordering ensures no orphaned code: types first, then services that use them, then UI that uses services, then cleanup of replaced code
