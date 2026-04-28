# Requirements Document

## Introduction

The Bachata Clip Slicer & Annotator is a standalone TypeScript application that takes a YouTube URL of a bachata dance video, analyzes the audio to detect BPM and bachata-specific rhythmic cycles, defines virtual clips aligned to those cycles within a Remotion composition, and provides a browser-based interface for reviewing and manually annotating each clip with structured metadata. The annotations produce a clip library consumable by a future choreography generation system. This system does not generate choreography — it produces annotated clip libraries.

The application uses Astro.js with React islands for the frontend UI, Vite as the build tool, Remotion as the core video engine (virtual clips as Sequences, frame-accurate Player, rendering pipeline for export), librosa (Python) for audio analysis invoked as a subprocess CLI, and yt-dlp for YouTube downloads. Python dependencies are managed via uv and pyproject.toml. All processing runs locally with no cloud dependencies.

## Glossary

- **Clip_Slicer**: The subsystem responsible for YouTube video ingestion, audio analysis, beat grid construction, cycle detection, and virtual clip creation.
- **Annotator**: The subsystem providing the browser-based UI for reviewing virtual clips and attaching structured metadata annotations.
- **Remotion_Composition**: A Remotion `<Composition>` component that wraps the full source video as a renderable entity with defined fps, dimensions, and total frame count.
- **Virtual_Clip**: A segment of the source video defined by a `from` frame and `durationInFrames` within a Remotion composition, represented as a `<Sequence>`. No physical file exists on disk until explicit export.
- **Remotion_Player**: The Remotion `<Player>` component embedded in the browser UI, providing frame-accurate playback with audio, scrubbing, and timeline controls.
- **Beat_Grid**: An ordered list of timestamps (and corresponding frame numbers) marking each detected beat position throughout the song.
- **Downbeat**: The first beat (count 1) of a bachata basic cycle, identified by the characteristic rhythmic accent pattern.
- **Bachata_Cycle**: An 8-count rhythmic unit (1-2-3-tap-5-6-7-tap) forming one complete basic step pattern.
- **Musical_Phrase**: A 16-count unit consisting of two consecutive Bachata_Cycles, the most common duration for a single dance move.
- **Extended_Phrase**: A 32-count unit consisting of two consecutive Musical_Phrases, used for longer combinations.
- **Annotation**: A structured metadata record attached to a Virtual_Clip describing identity, musical phrasing, entry/exit state, trim profile, motion profile, camera profile, and quality profile.
- **Annotation_Schema**: The JSON schema (version 2.0) defining the structure, required fields, controlled vocabularies, and validation rules for all annotation data.
- **Project_Manifest**: A JSON file tracking overall project state including source video count, clip totals, annotation status distribution, and completeness metrics.
- **Librosa_Analyzer**: A minimal Python CLI script using librosa for BPM detection, beat tracking, and RMS energy profiling on extracted audio. It accepts a WAV file path and video FPS as arguments, outputs structured JSON to stdout, and is invoked as a subprocess from the TypeScript application via `child_process`. Python dependencies are managed with uv and pyproject.toml.
- **Clip_Exporter**: The subsystem using Remotion's `renderMedia()` to export Virtual_Clips to physical MP4 files via FFmpeg.
- **Controlled_Vocabulary**: A fixed set of allowed enum values for annotation fields (e.g., move_label, hold, difficulty, style).
- **Astro_App**: The Astro.js application serving as the frontend shell, using React islands for interactive components like the Remotion Player and annotation forms.

## Requirements

### Requirement 1: YouTube Video Ingestion

**User Story:** As an annotator, I want to provide a YouTube URL and have the system download the video and audio, so that I can begin analyzing and annotating dance clips.

#### Acceptance Criteria

1. WHEN a standard YouTube URL or short URL (youtu.be) is provided, THE Clip_Slicer SHALL download the video at the highest available quality up to 1080p using yt-dlp.
2. WHEN a video download is initiated, THE Clip_Slicer SHALL extract the audio track as a separate WAV file for analysis.
3. WHILE a download is in progress, THE Astro_App SHALL display the current download progress percentage.
4. WHEN a download completes successfully, THE Clip_Slicer SHALL store the original video file and extracted audio file in the local project directory.
5. WHEN a download completes successfully, THE Clip_Slicer SHALL automatically load the video into a Remotion_Composition with the correct fps, dimensions, and total frame count.
6. IF the provided URL references an age-restricted, unavailable, or private video, THEN THE Clip_Slicer SHALL display a descriptive error message identifying the specific failure reason.
7. IF the provided URL is not a valid YouTube URL, THEN THE Clip_Slicer SHALL reject the input and display a validation error before attempting download.
8. WHEN a video is downloaded, THE Clip_Slicer SHALL record source metadata (URL, title, channel, upload date, duration, fps, width, height) in the project annotation file.

### Requirement 2: Audio Analysis and BPM Detection

**User Story:** As an annotator, I want the system to analyze the audio and detect tempo and beat positions, so that clips can be aligned to the musical structure.

#### Acceptance Criteria

1. WHEN an audio WAV file is extracted from a downloaded video, THE Clip_Slicer SHALL invoke the Librosa_Analyzer as a subprocess via `child_process`, passing the WAV file path and source video FPS as command-line arguments.
2. WHEN invoked, THE Librosa_Analyzer SHALL use `librosa.beat.beat_track` to detect the global BPM and per-beat timestamps throughout the song, producing a Beat_Grid.
3. WHEN audio analysis completes, THE Librosa_Analyzer SHALL identify the Downbeat (count 1) position by distinguishing the characteristic bachata accent pattern from count 5.
4. WHEN audio analysis completes, THE Librosa_Analyzer SHALL compute a confidence score (0.0–1.0) for the detected BPM.
5. THE Librosa_Analyzer SHALL support the typical bachata BPM range of 115–145 BPM.
6. WHEN a song contains tempo variations (accelerando or ritardando), THE Librosa_Analyzer SHALL track beat positions accurately across tempo changes rather than assuming a fixed BPM.
7. WHEN audio analysis completes, THE Librosa_Analyzer SHALL use `librosa.feature.rms` to extract an RMS energy profile across the song for section-level context.
8. WHEN audio analysis completes, THE Librosa_Analyzer SHALL convert all beat timestamps to frame numbers using the provided video FPS for use in Remotion components.
9. THE Librosa_Analyzer SHALL output all analysis results (BPM, confidence, beat grid timestamps, beat grid frame numbers, energy profile) as structured JSON to stdout.
10. WHEN the Librosa_Analyzer subprocess completes, THE Clip_Slicer SHALL parse the JSON output from stdout and integrate the results into the project state.
11. IF the Librosa_Analyzer subprocess exits with a non-zero exit code, THEN THE Clip_Slicer SHALL display a descriptive error message including the stderr output from the subprocess.
12. THE Librosa_Analyzer SHALL complete audio analysis within 30 seconds for a typical 4-minute song.

### Requirement 3: Bachata Cycle Detection

**User Story:** As an annotator, I want beats grouped into bachata-specific rhythmic cycles, so that clip boundaries align with the musical structure of the dance.

#### Acceptance Criteria

1. WHEN a Beat_Grid is available, THE Clip_Slicer SHALL group beats into 8-count Bachata_Cycles (1-2-3-tap-5-6-7-tap).
2. WHEN Bachata_Cycles are constructed, THE Clip_Slicer SHALL group them into 16-count Musical_Phrases and 32-count Extended_Phrases.
3. WHEN audio analysis completes, THE Clip_Slicer SHALL identify the first Downbeat of the song where the dance would naturally start (often after an intro section).
4. THE Clip_Slicer SHALL mark all cycle boundaries with both timestamps (seconds with millisecond precision) and corresponding frame numbers.
5. WHEN the user determines that auto-detected Downbeat position is incorrect, THE Annotator SHALL allow the user to manually set the Downbeat position.
6. WHEN the user determines that the Beat_Grid is offset, THE Annotator SHALL allow the user to shift the entire Beat_Grid by a fixed offset in milliseconds.

### Requirement 4: Virtual Clip Creation

**User Story:** As an annotator, I want the system to define virtual clips aligned to cycle boundaries within the Remotion composition, so that I can review and annotate dance segments without physical file slicing.

#### Acceptance Criteria

1. WHEN cycle boundaries are established, THE Clip_Slicer SHALL create Virtual_Clips as Remotion Sequences with default length of 16 beats (two Bachata_Cycles).
2. THE Clip_Slicer SHALL support configurable clip lengths of 8, 16, or 32 beats.
3. THE Clip_Slicer SHALL define each Virtual_Clip by a `from` frame and `durationInFrames` within the Remotion_Composition.
4. WHEN a Virtual_Clip is created, THE Clip_Slicer SHALL generate a clip_id using the convention `{source_id}_c{cycle_number}_{beat_count}`.
5. THE Clip_Slicer SHALL store all Virtual_Clip definitions in the project state JSON file, not as physical files on disk.
6. THE Clip_Slicer SHALL ensure each Virtual_Clip starts on a beat-aligned boundary (count 1 or count 5 of a Bachata_Cycle).
7. THE Clip_Slicer SHALL ensure each Virtual_Clip spans one or more complete Bachata_Cycles.
8. WHEN Virtual_Clips are created, THE Clip_Slicer SHALL complete the creation process instantaneously after audio analysis (frame range assignment only, no encoding).

### Requirement 5: Clip Review Interface

**User Story:** As an annotator, I want a Remotion-powered interface for reviewing virtual clips with beat markers and energy visualization, so that I can evaluate and adjust clips before annotation.

#### Acceptance Criteria

1. THE Annotator SHALL use the Remotion_Player component to play any Virtual_Clip segment with synchronized audio.
2. THE Annotator SHALL display all Virtual_Clips in a list or grid view alongside the Remotion_Player.
3. WHEN a Virtual_Clip is selected, THE Annotator SHALL show the clip's start time, end time, cycle number, and beat range.
4. WHILE a Virtual_Clip is playing, THE Annotator SHALL render beat markers as visual overlays on the Remotion_Player timeline using `useCurrentFrame()`, with count 1 and count 5 visually emphasized.
5. WHILE a Virtual_Clip is playing, THE Annotator SHALL render the energy profile as a waveform or intensity bar behind the beat markers using Remotion's `visualizeAudio()` API.
6. WHEN the user marks a clip as "discard", THE Annotator SHALL set the clip status to `discarded` and visually distinguish it in the clip list.
7. WHEN the user requests to merge two adjacent Virtual_Clips, THE Annotator SHALL combine their frame ranges into a single Virtual_Clip and generate a new clip_id.
8. WHEN the user requests to split a Virtual_Clip, THE Annotator SHALL divide the clip at a cycle boundary into two shorter Virtual_Clips, each with a new clip_id.
9. WHEN the user adjusts a clip's start or end frame, THE Annotator SHALL constrain the adjustment to beat-aligned positions and reflect the change immediately in the Remotion_Player without re-encoding.
10. THE Annotator SHALL provide keyboard shortcuts for play/pause, next clip, previous clip, and frame-by-frame stepping.

### Requirement 6: Clip Annotation — Identity and Classification

**User Story:** As an annotator, I want to classify each clip with identity metadata, so that clips can be searched and filtered by move type, difficulty, and style.

#### Acceptance Criteria

1. WHEN a Virtual_Clip is selected for annotation, THE Annotator SHALL auto-populate the clip_id field and allow the user to edit it.
2. THE Annotator SHALL provide a free-text input for `move_name` (human-readable name for the move).
3. THE Annotator SHALL provide a dropdown selection for `move_label` using values from the Controlled_Vocabulary: `arm_styling`, `basic`, `bodywaves`, `bolero`, `cross_body_lead`, `footwork`, `golpes`, `hammerlock`, `headrolls`, `hiprolls`, `intros`, `ladyturn`, `outro`, `shadow`, `spin`, `style`.
4. THE Annotator SHALL provide optional free-text inputs for `move_family` and `move_variant`.
5. THE Annotator SHALL provide a free-form tag input for `tags` allowing multiple values.
6. THE Annotator SHALL provide dropdown selections for `difficulty` (`beginner`, `intermediate`, `advanced`), `energy_level` (`low`, `medium`, `high`), and `style` (`traditional`, `sensual`, `moderna`, `fusion`).

### Requirement 7: Clip Annotation — Musical Phrasing

**User Story:** As an annotator, I want musical phrasing metadata auto-populated from analysis and editable, so that each clip's rhythmic context is captured accurately.

#### Acceptance Criteria

1. WHEN a Virtual_Clip is selected for annotation, THE Annotator SHALL auto-populate `estimated_tempo_bpm` from the audio analysis result and allow the user to edit the value.
2. WHEN a Virtual_Clip is selected for annotation, THE Annotator SHALL auto-calculate `duration_seconds` from the clip's frame range and fps.
3. WHEN a Virtual_Clip is selected for annotation, THE Annotator SHALL auto-calculate `beats_total` from BPM and duration, and `bars_total` as `beats_total / 4`.
4. THE Annotator SHALL provide a dropdown selection for `phrase_resolution` using values: `4_count`, `8_count`, `16_count`, `irregular`.
5. THE Annotator SHALL provide inputs for `completion_profile` sub-fields: `basico_completion_counts` (integer), `tempo_feel` (dropdown: `slow_finish`, `even_finish`, `fast_finish`, `syncopated_finish`), `accent_pattern` (dropdown: `even`, `front_loaded`, `back_loaded`), and `syncopation_level` (float 0.0–1.0).

### Requirement 8: Clip Annotation — Entry and Exit State

**User Story:** As an annotator, I want to describe the physical state of the dancers at the start and end of each clip, so that a future system can determine transition compatibility between clips.

#### Acceptance Criteria

1. THE Annotator SHALL provide annotation inputs for entry_state and exit_state with identical field structures.
2. THE Annotator SHALL provide dropdown selections for `hold` using values: `open`, `closed`, `shadow`, `hammerlock`, `cross_hand`, `side_by_side`, `single_hand`, `transitioning`.
3. THE Annotator SHALL provide dropdown selections for `leader_weight_foot` and `follower_weight_foot` using values: `left`, `right`, `split`, `unknown`.
4. THE Annotator SHALL provide dropdown selections for `leader_facing` and `follower_facing` using values: `up_slot`, `down_slot`, `left`, `right`, `diagonal`.
5. THE Annotator SHALL provide a numeric input for `body_orientation_degrees` accepting values in the range 0–360.
6. THE Annotator SHALL provide dropdown selections for `relative_position` (`facing_each_other`, `side_by_side`, `offset_same_direction`, `back_to_back`), `travel_direction` (`stationary`, `forward`, `backward`, `left`, `right`, `diagonal_left`, `diagonal_right`), `rotation_direction` (`none`, `clockwise`, `counterclockwise`), and `distance_profile` (`close`, `medium`, `far`).
7. THE Annotator SHALL provide a numeric input for `rotation_degrees` accepting non-negative values.
8. THE Annotator SHALL provide a dropdown selection for `frame_tension` using values: `low`, `medium`, `high`.
9. THE Annotator SHALL provide a multi-select input for `hand_connections` using values: `leader_left_to_follower_left`, `leader_left_to_follower_right`, `leader_right_to_follower_left`, `leader_right_to_follower_right`, `no_hand_connection`.

### Requirement 9: Clip Annotation — Trim Profile

**User Story:** As an annotator, I want to define safe trim points and loopability for each clip, so that a future system can trim or loop clips without cutting into important movement.

#### Acceptance Criteria

1. WHEN a Virtual_Clip is selected for annotation, THE Annotator SHALL auto-set `trim_safe_start_seconds` to 0.0 and `trim_safe_end_seconds` to the clip duration, both editable by the user.
2. THE Annotator SHALL provide inputs for `trim_safe_windows` as a list of start/end second pairs defining safe sub-ranges within the clip.
3. THE Annotator SHALL provide a boolean toggle for `loopable` indicating whether the clip can loop seamlessly.
4. THE Annotator SHALL provide multi-value numeric inputs for `preferred_entry_beats` and `preferred_exit_beats` (e.g., [1, 5] and [4, 8]).

### Requirement 10: Clip Annotation — Motion Profile

**User Story:** As an annotator, I want to describe the movement characteristics of each clip, so that clips can be filtered and matched by motion type and complexity.

#### Acceptance Criteria

1. THE Annotator SHALL provide dropdown selections for `travel_amount` (`none`, `low`, `medium`, `high`), `footwork_complexity` (`low`, `medium`, `high`), and `upper_body_isolation` (`none`, `low`, `medium`, `high`).
2. THE Annotator SHALL provide a numeric input for `spin_count` accepting non-negative integers.
3. THE Annotator SHALL provide boolean toggles for `dip`, `headroll`, and `bodywave`.
4. THE Annotator SHALL provide dropdown selections for `leader_dominant_motion` and `follower_dominant_motion` using values: `lower_body`, `upper_body`, `torso`, `full_body`, `stationary`.

### Requirement 11: Clip Annotation — Camera and Quality Profiles

**User Story:** As an annotator, I want to record camera angle, framing, and quality scores for each clip, so that clip usability can be assessed for teaching and stitching purposes.

#### Acceptance Criteria

1. THE Annotator SHALL provide dropdown selections for `camera_angle` (`front`, `side`, `back`, `overhead`, `mixed`) and `framing` (`full_body`, `upper_body`, `lower_body`, `close_up`, `wide`).
2. THE Annotator SHALL provide float inputs (0.0–1.0) for `camera_profile.visibility_score` and `camera_profile.occlusion_score`.
3. THE Annotator SHALL provide float inputs (0.0–1.0) for `quality_profile.visibility_score`, `quality_profile.boundary_cleanliness`, `quality_profile.teaching_clarity`, and `quality_profile.stitchability`.

### Requirement 12: Clip Export

**User Story:** As an annotator, I want to optionally export virtual clips to physical MP4 files, so that I can use them outside the Remotion environment.

#### Acceptance Criteria

1. WHEN the user requests export of a single clip, THE Clip_Exporter SHALL render the clip to an MP4 file using Remotion's `renderMedia()` with the clip's frame range.
2. WHEN the user requests batch export, THE Clip_Exporter SHALL export all non-discarded Virtual_Clips to individual MP4 files.
3. THE Clip_Exporter SHALL preserve the original video quality and frame rate in exported clips.
4. THE Clip_Exporter SHALL include the synchronized audio track in each exported MP4 file.
5. THE Clip_Exporter SHALL name exported files using the convention `{clip_id}.mp4`.
6. THE Clip_Exporter SHALL store exported clips in an organized output directory within the project.
7. THE Clip_Exporter SHALL process batch exports at a rate of at least 2x real-time.

### Requirement 13: Annotation Persistence

**User Story:** As an annotator, I want annotations auto-saved and exportable as JSON following the schema, so that my work is preserved and usable by other systems.

#### Acceptance Criteria

1. WHEN any annotation field value changes, THE Annotator SHALL auto-save all annotations and Virtual_Clip definitions to a JSON file following Annotation_Schema version 2.0.
2. THE Annotator SHALL support exporting the full annotation set as a single JSON file.
3. WHEN an annotation JSON file is imported, THE Annotator SHALL verify that all referenced source video files exist locally before loading.
4. IF a referenced source video file is missing during import, THEN THE Annotator SHALL display an error identifying the missing file and the affected clips.
5. WHEN saving annotations, THE Annotator SHALL validate all data against the Annotation_Schema: required fields present, enum values from Controlled_Vocabulary, numeric ranges respected.
6. THE Annotator SHALL track and display annotation completeness per clip as a percentage of filled fields.
7. THE Annotator SHALL maintain a Project_Manifest file tracking source video count, clip totals, annotation status distribution, and overall completeness.

### Requirement 14: Annotation Schema Validation Rules

**User Story:** As an annotator, I want the system to enforce data integrity rules on save, so that the annotation output is always valid and consistent.

#### Acceptance Criteria

1. WHEN saving an annotation, THE Annotator SHALL verify that all required fields (`clip_id`, `source_id`, `status`, `remotion.from_frame`, `remotion.duration_in_frames`, `remotion.fps`, `move_name`, `move_label`, `difficulty`, `energy_level`, `style`, `estimated_tempo_bpm`, `duration_seconds`, `beats_total`, `bars_total`, `entry_state.hold`, `entry_state.leader_weight_foot`, `entry_state.follower_weight_foot`, `exit_state.hold`, `exit_state.leader_weight_foot`, `exit_state.follower_weight_foot`, `trim_profile.trim_safe_start_seconds`, `trim_profile.trim_safe_end_seconds`) are present and non-empty.
2. WHEN saving an annotation, THE Annotator SHALL verify that all enum fields contain values from the corresponding Controlled_Vocabulary.
3. WHEN saving an annotation, THE Annotator SHALL verify that `trim_safe_start_seconds` is less than `trim_safe_end_seconds`.
4. WHEN saving an annotation, THE Annotator SHALL verify that `trim_safe_end_seconds` does not exceed `duration_seconds`.
5. WHEN saving an annotation, THE Annotator SHALL verify that `beats_total` and `bars_total` are positive integers and that `bars_total` equals `beats_total / 4`.
6. WHEN saving an annotation with `rotation_direction` set to `none`, THE Annotator SHALL verify that `rotation_degrees` is 0.
7. WHEN saving an annotation with `travel_direction` set to `stationary`, THE Annotator SHALL verify that `travel_amount` (if present) is `none` or `low`.
8. WHEN saving an annotation, THE Annotator SHALL verify that all float scores (`visibility_score`, `boundary_cleanliness`, `teaching_clarity`, `stitchability`, `syncopation_level`, `occlusion_score`) are in the range 0.0–1.0.
9. WHEN saving an annotation, THE Annotator SHALL verify that `body_orientation_degrees` is in the range 0–360.
10. WHEN saving an annotation, THE Annotator SHALL verify that `spin_count` is a non-negative integer.
11. WHEN saving an annotation, THE Annotator SHALL verify that `hand_connections` is an array containing only values from the `hand_connections` Controlled_Vocabulary.
12. WHEN saving an annotation, THE Annotator SHALL verify that `clip_id` is unique across all clips in the project.
13. WHEN saving an annotation, THE Annotator SHALL verify that `remotion.from_frame` is a non-negative integer and `remotion.duration_in_frames` is a positive integer.
14. WHEN saving an annotation, THE Annotator SHALL verify that `remotion.from_frame + remotion.duration_in_frames` does not exceed the source video's total frame count.
15. WHEN saving an annotation, THE Annotator SHALL verify that `duration_seconds` equals `remotion.duration_in_frames / remotion.fps` within a 0.001-second tolerance.
16. IF any validation rule fails on save, THEN THE Annotator SHALL display a specific error message identifying the failing field and the violated rule, and SHALL prevent the annotation status from being set to `annotated`.

### Requirement 15: Source Video Metadata and Multi-Source Support

**User Story:** As an annotator, I want to process multiple YouTube URLs into the same project with full metadata tracking, so that I can build a clip library from multiple source videos.

#### Acceptance Criteria

1. WHEN a video is downloaded, THE Clip_Slicer SHALL store source metadata: YouTube URL, title, channel, upload date, duration in seconds, fps, width, height, and total frame count.
2. WHEN audio analysis completes, THE Clip_Slicer SHALL store analysis results with the source: detected BPM, BPM confidence, downbeat offset, Beat_Grid (timestamps and frame numbers), and energy profile.
3. THE Clip_Slicer SHALL associate all Virtual_Clips from the same source video via the `source_id` field.
4. THE Annotator SHALL support processing multiple YouTube URLs into the same annotation project, with each source tracked independently.

### Requirement 16: Technology Stack

**User Story:** As a developer, I want the application built on a specific technology stack, so that the system is maintainable and uses appropriate tools for each concern.

#### Acceptance Criteria

1. THE Astro_App SHALL use TypeScript for all application code.
2. THE Astro_App SHALL use Astro.js as the frontend framework with React islands for interactive components (Remotion_Player, annotation forms).
3. THE Astro_App SHALL use Vite as the build tool and development server.
4. THE Astro_App SHALL use Remotion open-source packages (`remotion`, `@remotion/player`, `@remotion/media-utils`, `@remotion/renderer`, `@remotion/cli`) as the core video engine.
5. THE Librosa_Analyzer SHALL be a minimal Python CLI script using librosa for audio analysis (BPM detection, beat tracking, RMS energy profiling), managed with uv and pyproject.toml for dependency management.
6. THE Clip_Slicer SHALL invoke the Librosa_Analyzer as a subprocess via `child_process`, passing the WAV file path and video FPS as arguments, and parsing structured JSON from stdout.
7. THE Clip_Slicer SHALL use yt-dlp (external binary, called as subprocess) for YouTube video download.
8. THE Clip_Exporter SHALL use FFmpeg (external binary, used by Remotion's renderer) for encoding exported clips.
9. THE Annotator SHALL use the local filesystem for video file storage and JSON files for annotations and project state.
10. THE Astro_App SHALL run on macOS and Linux without cloud dependencies.

### Requirement 17: Annotation Schema Output Format

**User Story:** As a downstream system consumer, I want the annotation output to follow a versioned JSON schema with defined structure, so that I can reliably parse and use the clip library.

#### Acceptance Criteria

1. THE Annotator SHALL output all annotation files using `schema_version: "2.0"`.
2. THE Annotator SHALL structure the top-level JSON with `schema_version`, `project` (name, created_at, updated_at), `sources` array, `enum_definitions` object, and `clips` array.
3. THE Annotator SHALL include in each source record: `source_id`, `youtube_url`, `title`, `channel`, `upload_date`, `duration_seconds`, `fps`, `width`, `height`, `total_frames`, `video_file`, `audio_file`, `detected_bpm`, `bpm_confidence`, `downbeat_offset_seconds`, `beat_grid`, `beat_grid_frames`, `energy_profile`, and `downloaded_at`.
4. THE Annotator SHALL include in each clip record: `clip_id`, `source_id`, `status`, `remotion` (from_frame, duration_in_frames, fps), identity fields, musical phrasing fields, entry_state, exit_state, trim_profile, motion_profile, camera_profile, quality_profile, and `embedding_refs`.
5. THE Annotator SHALL track clip status using values: `pending`, `discarded`, `reviewed`, `in_progress`, `annotated`.
6. THE Annotator SHALL include the full `enum_definitions` object in the output file, listing all Controlled_Vocabulary values for every enum field.

### Requirement 18: Annotation Serialization Round-Trip

**User Story:** As an annotator, I want to export and re-import annotation files without data loss, so that I can safely back up and restore my work.

#### Acceptance Criteria

1. FOR ALL valid annotation project files, THE Annotator SHALL produce an equivalent annotation object when the file is exported to JSON and then re-imported (round-trip property).
2. WHEN an annotation file is exported, THE Annotator SHALL produce valid JSON that conforms to Annotation_Schema version 2.0.
3. WHEN an exported annotation file is re-imported, THE Annotator SHALL restore all clip annotations, source metadata, and project state to their pre-export values.
