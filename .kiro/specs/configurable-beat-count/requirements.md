# Requirements Document

## Introduction

This feature adds a configurable beat count selector to the ingest/download page, allowing users to choose how many beats each generated clip should span. Currently the system hardcodes 16 beats per clip when calling the clip generation endpoint. The new drop-down lets users select from 4, 8, 16, or 32 beats per clip before initiating the download pipeline, and the selected value flows through to cycle building and clip generation.

## Glossary

- **Ingest_Page**: The first screen of the application (`src/pages/index.astro`) where users enter a YouTube URL and initiate download, analysis, and clip generation.
- **Beat_Count_Selector**: A drop-down UI control on the Ingest_Page that lets the user choose the number of beats per clip.
- **Clip_Generator**: The backend service (`clip-manager.ts` and `/api/clips/generate`) that groups cycles into virtual clips based on a beat count parameter.
- **Cycle_Builder**: The service (`cycle-builder.ts`) that groups raw beats into 8-count cycles and assembles phrase hierarchies.
- **App_State**: The server-side singleton (`app-state.ts`) that holds runtime project state including clips, cycles, and analysis results.
- **Valid_Beat_Count**: One of the allowed beat count values: 4, 8, 16, or 32.
- **Video_Group**: A collapsible folder in the Review_Page that contains all clips originating from a single source video, visually grouping them together.
- **Folder_Name**: The display label for a Video_Group, formatted as `YYYY-MM-DD_slugified_video_title` (e.g., `2026-05-02_bachata_tutorial_beginners`).
- **Review_Page**: The review screen of the application (`src/pages/review.astro` / `ReviewApp.tsx`) where users browse, preview, and annotate generated clips.

## Requirements

### Requirement 1: Beat Count Selector Display

**User Story:** As a user, I want to see a beat count drop-down on the ingest page, so that I can choose how many beats each clip should contain before starting the pipeline.

#### Acceptance Criteria

1. THE Ingest_Page SHALL display a Beat_Count_Selector drop-down with the options 4, 8, 16, and 32.
2. THE Beat_Count_Selector SHALL default to the value 8.
3. THE Beat_Count_Selector SHALL be positioned between the URL input row and the submit button area, clearly labeled "Beats per clip".
4. WHILE the download pipeline is in progress, THE Beat_Count_Selector SHALL be disabled to prevent changes mid-pipeline.

### Requirement 2: Beat Count Passed to Clip Generation

**User Story:** As a user, I want my chosen beat count to be used when generating clips, so that the resulting clips match my preferred length.

#### Acceptance Criteria

1. WHEN the user submits the ingest form, THE Ingest_Page SHALL include the selected beat count value in the request to the clip generation endpoint.
2. WHEN the clip generation endpoint receives a beatCount value of 4, 8, 16, or 32, THE Clip_Generator SHALL group cycles into clips of the specified beat count.
3. IF the clip generation endpoint receives a beatCount value that is not a Valid_Beat_Count, THEN THE Clip_Generator SHALL return an HTTP 400 error with a descriptive message.

### Requirement 3: Support for 4-Beat Clips

**User Story:** As a user, I want to generate 4-beat clips, so that I can work with shorter musical phrases.

#### Acceptance Criteria

1. WHEN beatCount is 4, THE Cycle_Builder SHALL produce cycles of 4 beats from the beat grid (grouping every 4 consecutive beats into one cycle).
2. WHEN beatCount is 4, THE Clip_Generator SHALL create one clip per 4-beat cycle.
3. THE Clip_Generator SHALL assign clip IDs following the existing convention `{sourceId}_c{cycleNumber:03d}_{beatCount:03d}` for 4-beat clips.

### Requirement 4: Cycle Builder Parameterization

**User Story:** As a developer, I want the cycle builder to accept a configurable beats-per-cycle parameter, so that it can produce cycles of any valid size rather than only 8-beat cycles.

#### Acceptance Criteria

1. THE Cycle_Builder SHALL accept a `beatsPerCycle` parameter with allowed values of 4, 8, 16, or 32.
2. WHEN a `beatsPerCycle` parameter is provided, THE Cycle_Builder SHALL group beats into cycles of that size instead of the hardcoded 8.
3. IF `beatsPerCycle` is not provided, THEN THE Cycle_Builder SHALL default to 8 beats per cycle to maintain backward compatibility.
4. THE Cycle_Builder SHALL discard leftover beats that do not form a complete cycle of the specified size.

### Requirement 5: Clip Generation Endpoint Validation

**User Story:** As a developer, I want the clip generation endpoint to validate the beat count parameter, so that invalid values are rejected gracefully.

#### Acceptance Criteria

1. THE Clip_Generator endpoint SHALL accept beatCount values of 4, 8, 16, and 32.
2. IF the beatCount parameter is omitted from the request, THEN THE Clip_Generator endpoint SHALL default to 8.
3. IF the beatCount parameter is present but not a Valid_Beat_Count, THEN THE Clip_Generator endpoint SHALL respond with HTTP 400 and the message "beatCount must be 4, 8, 16, or 32".

### Requirement 6: UI State Persistence Across Page Load

**User Story:** As a user, I want my beat count selection to be remembered if I return to the ingest page, so that I do not have to re-select it each time.

#### Acceptance Criteria

1. WHEN the user selects a beat count value, THE Ingest_Page SHALL store the selection in the browser's localStorage under the key `beatCountPreference`.
2. WHEN the Ingest_Page loads, THE Beat_Count_Selector SHALL initialize its value from localStorage if a previously stored preference exists.
3. IF no stored preference exists, THEN THE Beat_Count_Selector SHALL default to 8.

### Requirement 7: Video Group Organization in Review View

**User Story:** As a user, I want clips in the review view to be grouped by source video in collapsible folders, so that I can tell which clips belong to which video instead of seeing a flat list of all clips mixed together.

#### Acceptance Criteria

1. THE Review_Page SHALL display clips organized into Video_Group folders, one folder per source video.
2. WHEN the Review_Page loads, THE Review_Page SHALL group all clips by their sourceId and render each group inside a collapsible Video_Group.
3. THE Video_Group SHALL display the Folder_Name as its header label.
4. WHEN a user clicks a Video_Group header, THE Video_Group SHALL toggle between collapsed and expanded states.
5. THE Video_Group SHALL default to the expanded state on initial page load.
6. WHEN a Video_Group is collapsed, THE Review_Page SHALL hide all clip cards within that group.
7. THE Review_Page SHALL order Video_Groups by download date, most recent first.

### Requirement 8: Video Folder Naming Convention

**User Story:** As a user, I want each video folder to be labeled with the download date and a slugified video title, so that I can quickly identify the source video and when it was downloaded.

#### Acceptance Criteria

1. THE Folder_Name SHALL follow the format `YYYY-MM-DD_slugified_video_title` where YYYY-MM-DD is the download date of the source video.
2. WHEN generating the slugified video title, THE Review_Page SHALL convert the video title to lowercase, replace spaces and non-alphanumeric characters with underscores, and collapse consecutive underscores into a single underscore.
3. WHEN generating the slugified video title, THE Review_Page SHALL remove leading and trailing underscores from the result.
4. IF the source video title is empty or unavailable, THEN THE Review_Page SHALL use the sourceId as the slug portion of the Folder_Name.
5. THE Folder_Name SHALL truncate the slugified title portion to a maximum of 60 characters to prevent excessively long labels.
