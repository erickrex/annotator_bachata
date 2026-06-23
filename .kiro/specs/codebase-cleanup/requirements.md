# Requirements Document

## Introduction

This spec covers a comprehensive cleanup and improvement effort for the Bachata Clip Slicer & Annotator codebase. The changes address preview playback quality (replacing Remotion Player with HTML5 video + canvas for preview), export correctness (respecting trim adjustments), dead code removal, annotation system simplification, and data durability improvements. The goal is a leaner, more reliable system where preview playback is smooth, exports match what the user sees, and unused complexity is stripped away.

## Glossary

- **Preview_Player**: The HTML5 `<video>` element with a canvas overlay used for in-browser clip preview playback during the review workflow.
- **Export_Renderer**: The Remotion-based rendering pipeline that produces final MP4 files with overlays baked in.
- **Trim_System**: The metadata-only in-point/out-point adjustment mechanism (`/api/clips/[id]/trim`) that adjusts clip boundaries without re-extraction.
- **Debounced_Saver**: The `DebouncedSaver` instance in `project-service.ts` that batches writes to `project.json` and `manifest.json` after a configurable delay.
- **Beat_Markers**: Visual indicators rendered on the canvas overlay showing beat positions within a clip's timeline.
- **Energy_Profile**: A per-segment RMS energy visualization rendered as a waveform on the canvas overlay.
- **Annotation_Service**: The service managing annotation CRUD, validation, and completeness tracking for clip metadata.
- **VirtualClipDef**: The runtime data structure representing a sliced clip's timing, source reference, extraction state, and trim points.
- **ClipAnnotation**: The full annotation record for a clip including classification, musical phrasing, dancer state, and quality metadata.

## Requirements

### Requirement 1: Replace Remotion Player with HTML5 Video + Canvas Overlay for Preview

**User Story:** As a reviewer, I want smooth, responsive clip preview playback, so that I can accurately assess clip boundaries and content without choppiness or sync issues.

#### Acceptance Criteria

1. WHEN a clip is selected for preview, THE Preview_Player SHALL render the clip's extracted MP4 using a native HTML5 `<video>` element.
2. WHILE a clip is playing in preview, THE Preview_Player SHALL render beat markers on a transparent canvas overlay positioned above the video element.
3. WHILE a clip is playing in preview, THE Preview_Player SHALL render the energy profile visualization on the canvas overlay synchronized to the current playback time.
4. WHEN the user presses Space, THE Preview_Player SHALL toggle between play and pause states.
5. WHEN the user presses comma or period, THE Preview_Player SHALL step backward or forward by one frame respectively while paused.
6. WHEN the user presses ArrowLeft or ArrowRight, THE Preview_Player SHALL invoke the previous-clip or next-clip navigation callbacks respectively.
7. WHEN a different clip is selected, THE Preview_Player SHALL pause the current playback and load the new clip's extracted MP4 from frame zero.
8. THE Export_Renderer SHALL continue to use Remotion's `renderMedia()` for producing final MP4 files with overlays baked into the video stream.

### Requirement 2: Export Respects Trim Adjustments

**User Story:** As a user exporting clips, I want the exported MP4 to match the trimmed region I see in preview, so that my exports reflect my boundary decisions.

#### Acceptance Criteria

1. WHEN a clip with custom `inPoint` and `outPoint` values is exported, THE Export_Renderer SHALL compute the ffmpeg trim range from those values rather than the original `fromFrame` and `durationInFrames`.
2. WHEN a clip has no custom trim points set, THE Export_Renderer SHALL fall back to the default range defined by `handleBefore` offset to `handleBefore + clipDuration`.
3. THE Export_Renderer SHALL produce an MP4 whose duration in seconds equals `outPoint - inPoint` (within a tolerance of one frame duration).
4. WHEN a batch export is performed, THE Export_Renderer SHALL apply per-clip trim points independently for each clip in the batch.

### Requirement 3: Remove Old Boundary Adjustment Endpoint

**User Story:** As a developer, I want a single clip adjustment mechanism, so that the codebase has no conflicting boundary systems that can break UI state.

#### Acceptance Criteria

1. THE Trim_System SHALL be the sole mechanism for adjusting clip playback boundaries after extraction.
2. WHEN the application starts, THE system SHALL NOT expose the `/api/clips/[id]/boundary` endpoint.
3. WHEN the `/api/clips/[id]/boundary` endpoint file is removed, THE system SHALL continue to function with all remaining clip adjustment operations using the Trim_System.
4. THE system SHALL remove the `adjustBoundary` function from `clip-manager.ts` and all references to it across the codebase.

### Requirement 4: Simplify Annotation System

**User Story:** As a developer, I want the annotation system to contain only fields that serve the user's workflow, so that validation is meaningful and the data model is maintainable.

#### Acceptance Criteria

1. THE Annotation_Service SHALL require only the following fields for a complete annotation: `clip_id`, `source_id`, `status`, `remotion` (from_frame, duration_in_frames, fps), `move_name`, `difficulty`, `style`, and `tags`.
2. WHEN an annotation is updated, THE Annotation_Service SHALL validate only the reduced required field set.
3. THE Annotation_Service SHALL retain optional fields (`energy_level`, `move_label`, `move_family`, `move_variant`, `phrase_resolution`, `song_position`) as non-required metadata that does not affect completeness scoring.
4. THE Annotation_Service SHALL remove the `embedding_refs` field from the `ClipAnnotation` type and all code referencing it.
5. THE Annotation_Service SHALL remove the `completion_profile` field from the required annotation skeleton.
6. WHEN a clip is exported, THE Export_Renderer SHALL write a sidecar JSON file alongside the MP4 containing the clip's annotation metadata.

### Requirement 5: Flush Pending Saves on Shutdown

**User Story:** As a user, I want my unsaved changes to persist even if the server shuts down unexpectedly, so that I do not lose work.

#### Acceptance Criteria

1. WHEN the process receives a SIGINT signal, THE Debounced_Saver SHALL flush all pending writes to disk before the process exits.
2. WHEN the process receives a SIGTERM signal, THE Debounced_Saver SHALL flush all pending writes to disk before the process exits.
3. IF the flush operation fails during shutdown, THEN THE Debounced_Saver SHALL log the error to stderr and exit with a non-zero exit code.
4. WHEN no pending writes exist at shutdown time, THE Debounced_Saver SHALL exit cleanly without performing any disk I/O.

### Requirement 6: Remove Unused Beatgrid API Endpoints

**User Story:** As a developer, I want dead API endpoints removed, so that the codebase surface area matches actual functionality.

#### Acceptance Criteria

1. THE system SHALL NOT expose the `/api/beatgrid/shift` endpoint.
2. THE system SHALL NOT expose the `/api/beatgrid/downbeat` endpoint.
3. WHEN the beatgrid endpoint files are removed, THE system SHALL continue to function with all beat detection and cycle building operations unaffected.

### Requirement 7: Regenerate Beat Markers After Trim Change

**User Story:** As a reviewer, I want beat markers to stay accurate after I adjust trim points, so that the visual overlay matches the actual clip boundaries.

#### Acceptance Criteria

1. WHEN a clip's `inPoint` or `outPoint` is updated via the Trim_System, THE system SHALL recompute the `beatMarkerFrames` array to reflect only beats within the new trimmed range.
2. WHEN beat markers are recomputed, THE system SHALL express marker positions relative to the start of the trimmed region (frame zero = inPoint).
3. IF no beats fall within the trimmed range, THEN THE system SHALL set `beatMarkerFrames` to an empty array.

### Requirement 8: Remove embedding_refs Dead Code

**User Story:** As a developer, I want unused type fields and their references removed, so that the codebase does not carry dead abstractions.

#### Acceptance Criteria

1. THE system SHALL remove the `embedding_refs` field from the `ClipAnnotation` interface in `src/types/index.ts`.
2. THE system SHALL remove all assignments to `embedding_refs` in service code, skeleton creation, and test fixtures.
3. WHEN the `embedding_refs` field is removed, THE system SHALL continue to pass all existing tests after updating test expectations.

### Requirement 9: Reduce Data Model Duplication

**User Story:** As a developer, I want a clear separation between runtime clip state and persisted annotation data, so that fields are not duplicated across structures.

#### Acceptance Criteria

1. THE `VirtualClipDef` SHALL be the single source of truth for runtime clip timing (`fromFrame`, `durationInFrames`, `fps`), extraction state, and trim points.
2. THE `ClipAnnotation` SHALL derive its `remotion` fields from the corresponding `VirtualClipDef` at serialization time rather than storing independent copies.
3. WHEN a clip's timing is updated, THE system SHALL update only the `VirtualClipDef` and recompute the `ClipAnnotation.remotion` fields on next save or export.
4. THE system SHALL not require manual synchronization of timing fields between `VirtualClipDef` and `ClipAnnotation`.
