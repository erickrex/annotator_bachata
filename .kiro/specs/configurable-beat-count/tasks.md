# Implementation Plan: Configurable Beat Count

## Overview

Implement a configurable beat count selector (4, 8, 16, 32) on the ingest page, parameterize the cycle builder and clip manager to support all valid beat counts, update the API endpoint validation, and add video grouping to the review page with collapsible folders labeled by date and slugified title.

## Tasks

- [x] 1. Implement slug utility service
  - [x] 1.1 Create `src/services/slug-utils.ts` with `slugify` and `buildFolderName` functions
    - `slugify(title: string): string` — lowercase, replace non-alphanumeric with `_`, collapse consecutive underscores, trim leading/trailing underscores, truncate to 60 chars
    - `buildFolderName(downloadedAt: string, title: string, sourceId: string): string` — extract YYYY-MM-DD from ISO string, apply slugify to title (fallback to sourceId if empty), return `${date}_${slug}`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 1.2 Write property test for slugification (Property 6)
    - **Property 6: Slugification correctness**
    - For any input string, output contains only `[a-z0-9_]`, no consecutive underscores, no leading/trailing underscores, length ≤ 60, non-empty if input has alphanumeric chars
    - Test file: `src/tests/property/slugify.prop.test.ts`
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.5**

  - [x] 1.3 Write unit tests for `slug-utils`
    - Test `slugify` with edge cases: empty string, all-special-chars, long strings, unicode
    - Test `buildFolderName` with empty title fallback, valid ISO dates, missing date
    - Test file: `src/services/slug-utils.test.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Parameterize cycle builder
  - [x] 2.1 Update `buildCycles` in `src/services/cycle-builder.ts` to accept optional `beatsPerCycle` parameter
    - Add `beatsPerCycle: 4 | 8 | 16 | 32 = 8` as fourth parameter
    - Replace internal `BEATS_PER_CYCLE` constant usage with the parameter value
    - Compute `phrases16` and `phrases32` relative to the base cycle size
    - Ensure backward compatibility: omitting the parameter produces identical results to current behavior
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 Write property test for cycle builder sizing (Property 1)
    - **Property 1: Cycle builder produces correctly-sized cycles**
    - For any valid beat grid and any beatsPerCycle in {4, 8, 16, 32}, each cycle spans exactly `beatsPerCycle` beat indices, leftover beats discarded
    - Test file: `src/tests/property/cycle-builder.prop.test.ts`
    - **Validates: Requirements 3.1, 4.2, 4.4**

  - [x] 2.3 Update existing unit tests in `src/services/cycle-builder.test.ts`
    - Add test cases for `beatsPerCycle=4`, `beatsPerCycle=16`, `beatsPerCycle=32`
    - Verify default (no parameter) still produces 8-beat cycles
    - _Requirements: 4.2, 4.3_

- [x] 3. Update clip manager for 4-beat support
  - [x] 3.1 Update `createClips` in `src/services/clip-manager.ts` to accept `beatCount: 4 | 8 | 16 | 32`
    - Widen the type from `8 | 16 | 32` to `4 | 8 | 16 | 32`
    - Simplify logic: since cycle builder now produces cycles at the requested size, each cycle maps 1:1 to a clip
    - Ensure clip IDs follow `{sourceId}_c{cycleNumber:03d}_{beatCount:03d}` pattern
    - _Requirements: 2.2, 3.2, 3.3_

  - [x] 3.2 Write property test for clip creation (Property 2)
    - **Property 2: Clip creation produces correct clips for any valid beat count**
    - For any valid CycleHierarchy and beatCount in {4, 8, 16, 32}: each clip's beatCount matches requested, clipId matches pattern, durationInFrames > 0, clip count equals cycle count
    - Test file: `src/tests/property/clip-creation.prop.test.ts`
    - **Validates: Requirements 2.2, 3.2, 3.3**

- [x] 4. Checkpoint - Ensure service layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update clip generation API endpoint
  - [x] 5.1 Update `src/pages/api/clips/generate.ts` validation and flow
    - Change `validBeatCounts` from `[8, 16, 32]` to `[4, 8, 16, 32]`
    - Change default from `16` to `8`
    - Update error message to `'beatCount must be 4, 8, 16, or 32'`
    - Import `buildCycles` and call it with the requested `beatCount` to produce correctly-sized cycles
    - Pass the rebuilt cycles to `createClips`
    - _Requirements: 2.3, 5.1, 5.2, 5.3_

  - [x] 5.2 Write property test for beat count validation (Property 3)
    - **Property 3: Invalid beat count rejection**
    - For any integer not in {4, 8, 16, 32}, validation logic rejects it
    - Test file: `src/tests/property/beat-count-validation.prop.test.ts`
    - **Validates: Requirements 2.3, 5.3**

- [x] 6. Add beat count selector to ingest page
  - [x] 6.1 Update `src/pages/index.astro` to add the Beat Count Selector UI
    - Add `<select id="beat-count-select">` with options 4, 8, 16, 32 (default: 8), labeled "Beats per clip"
    - Position between the URL input row and the progress/complete sections
    - On page load: read `localStorage.getItem('beatCountPreference')` and set select value (validate it's in {4,8,16,32}, fallback to 8)
    - On change: write `localStorage.setItem('beatCountPreference', value)`
    - Disable select during pipeline execution (same as submit button)
    - Update the clip generation request to use `parseInt(beatCountSelect.value, 10)` instead of hardcoded `16`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 6.1, 6.2, 6.3_

- [x] 7. Add video grouping to review page
  - [x] 7.1 Create `src/components/VideoGroup.tsx` collapsible folder component
    - Props: `sourceId`, `folderName`, `clipCount`, `collapsed`, `onToggle`, `children`
    - Render clickable header with folder name and clip count badge
    - Conditionally render children based on collapsed state
    - Default expanded on initial load
    - _Requirements: 7.4, 7.5, 7.6_

  - [x] 7.2 Update `src/components/ReviewApp.tsx` to group clips by source video
    - After fetching clips and sources, group clips by `sourceId`
    - Sort groups by `downloaded_at` descending (most recent first), fallback to epoch for missing dates
    - Add `collapsedGroups` state (`Set<string>`)
    - Render each group inside a `VideoGroup` component with `ClipGrid` inside
    - Use `buildFolderName` from `slug-utils.ts` to generate folder labels
    - Handle edge case: clips with no matching source record get a fallback folder using sourceId
    - _Requirements: 7.1, 7.2, 7.3, 7.7, 8.1, 8.4_

  - [x] 7.3 Write property test for clip grouping (Property 4)
    - **Property 4: Clip grouping correctness**
    - For any set of clips with varying sourceId values, grouping produces exactly one group per unique sourceId, every clip in a group has the correct sourceId
    - Test file: `src/tests/property/clip-grouping.prop.test.ts`
    - **Validates: Requirements 7.1, 7.2**

  - [x] 7.4 Write property test for video group ordering (Property 5)
    - **Property 5: Video group ordering by download date**
    - For any set of source records with distinct downloaded_at timestamps, groups are ordered most recent first
    - Test file: `src/tests/property/clip-grouping.prop.test.ts`
    - **Validates: Requirements 7.7**

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout; all implementation uses TypeScript
