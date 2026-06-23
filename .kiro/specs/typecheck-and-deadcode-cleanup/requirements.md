# Requirements Document

## Introduction

This spec restores a working TypeScript type-check baseline and removes dead code and documentation drift left behind by three completed migrations:

- **Export**: Remotion `renderMedia()` → direct `ffmpeg` trimming (`export-service.ts`).
- **Preview**: Remotion `<Player>` → HTML5 `<video>` + `<canvas>` (`ClipPreviewPlayer.tsx`).
- **Analysis**: `librosa` → `beat_this` / `torch` / `scipy` (`analyzer/analyze.py`, `pyproject.toml`).

The test suite (Vitest) passes, but `npx astro check` reports 162 errors because the project's `tsconfig.json` overrides the automatically-included type packages and `@types/node` is not a declared dependency. Because type errors are invisible to the existing CI/test flow, real type bugs and a broken integration test have accumulated unnoticed.

On top of that baseline cleanup, this spec also removes structural duplication in the service layer that has crept in: repeated subprocess (`spawn`) plumbing across three services, duplicated state-hydration logic in `app-state.ts`, a `REQUIRED_FIELDS` list defined twice that can silently drift, and stale requirement-reference comments. These are behavior-preserving refactors sequenced after the type-check baseline is green so each is verified against a clean `astro check` and a passing test suite.

The goal is a codebase where `astro check` passes cleanly, the Vitest and pytest suites still pass, no dead Remotion code remains, the documentation matches the actual analyzer stack, and the service layer has no needless duplication.

## Glossary

- **Type_Check**: The `astro check` command (TypeScript diagnostics across `src/**`).
- **Node_Types**: The `@types/node` type-definition package providing types for `node:*` builtins, `process`, and `Buffer`.
- **Remotion_Compositions**: The files under `src/remotion/` (`Root.tsx`, `VirtualClip.tsx`, `BeatOverlay.tsx`, `EnergyOverlay.tsx`, `index.ts`).
- **Integration_Suite**: `src/tests/integration/subprocess-pipelines.test.ts`, gated behind `INTEGRATION=1`.
- **Analyzer**: The Python beat-detection module at `analyzer/analyze.py`, now backed by `beat_this`.
- **Subprocess_Services**: The three services that spawn child processes — `ingestion-service.ts`, `audio-analysis-service.ts`, and `clip-extraction-service.ts`.
- **Process_Runner**: A shared helper that encapsulates the common `spawn` + timeout + stdout/stderr buffering + close/error handling pattern.

## Requirements

### Requirement 1: Restore a passing type-check baseline

**User Story:** As a developer, I want `astro check` to run with full type information, so that type errors are visible during development and CI instead of being silently suppressed.

#### Acceptance Criteria

1. THE project SHALL declare `@types/node` as a devDependency in `package.json` at a version compatible with the project's Node runtime.
2. THE `tsconfig.json` `compilerOptions.types` array SHALL include `"node"` alongside `"vitest/globals"` so that `node:*` builtins, `process`, and `Buffer` resolve.
3. WHEN `astro check` is run after the dependency and config changes, THE Type_Check SHALL report zero errors caused by unresolved `node:*` modules, `process`, or `Buffer`.
4. WHEN `npm run test` is run after the changes, THE Vitest suite SHALL continue to pass with no new failures.

### Requirement 2: Remove dead Remotion code

**User Story:** As a developer, I want the unused Remotion composition code removed, so that the codebase surface matches the ffmpeg/HTML5 runtime actually in use.

#### Acceptance Criteria

1. THE system SHALL delete the Remotion_Compositions directory `src/remotion/` and all files within it.
2. THE system SHALL remove the `remotion` dependency from `package.json`.
3. WHEN the Remotion_Compositions are removed, THE system SHALL contain no remaining import or reference to `src/remotion/` or to the `remotion` package across `src/**`.
4. WHEN the dependency is removed, THE system SHALL update the lockfile via `npm install` so `package-lock.json` is consistent.
5. WHEN the Remotion code is removed, THE Vitest suite and Type_Check SHALL pass.

### Requirement 3: Preserve the export pipeline

**User Story:** As a user, I want clip export to keep working after dead-code removal, so that removing Remotion does not break a live feature.

#### Acceptance Criteria

1. WHEN Remotion code and the `remotion` dependency are removed, THE export pipeline (`export-service.ts` and the `/api/export/*` routes) SHALL continue to operate using `ffmpeg` only.
2. THE export-service tests SHALL pass after removal, confirming the export path has no Remotion dependency.

### Requirement 4: Fix the broken integration test block

**User Story:** As a developer, I want the integration suite to reference only tools the project actually uses, so that running it with `INTEGRATION=1` does not fail on a missing package.

#### Acceptance Criteria

1. THE Integration_Suite SHALL NOT import `@remotion/renderer` or `src/remotion/index.js`.
2. THE Integration_Suite SHALL remove the "Remotion renderer" describe block that verifies Remotion imports.
3. THE Integration_Suite comments and describe labels SHALL reference the `beat_this` analyzer rather than `librosa`.
4. WHEN `INTEGRATION=1 npx vitest run src/tests/integration/` is run in an environment with `uv` and `ffmpeg` available, THE Integration_Suite SHALL NOT fail due to a missing `@remotion/renderer` module.

### Requirement 5: Correct librosa documentation drift

**User Story:** As a new contributor, I want the documentation and comments to describe the real analyzer stack, so that I understand what the system uses.

#### Acceptance Criteria

1. THE `README.md` SHALL describe the audio analyzer as `beat_this`-based and SHALL list the actual Python dependencies (`beat_this`, `torch`, `torchaudio`, `numpy`, `scipy`, `soundfile`) instead of `librosa`.
2. THE `audio-analysis-service.ts` file comments SHALL reference the `beat_this` analyzer rather than `librosa`.
3. THE Analyzer source comments that describe behavior as "librosa" SHALL be reworded to describe the equivalent intent without implying librosa is a dependency, OR clearly labeled as "matching the previous librosa parameters" where the parameter values are intentionally preserved.
4. THE changes in this requirement SHALL be documentation/comment-only and SHALL NOT alter analyzer runtime behavior.

### Requirement 6: Fix genuine type errors surfaced by the restored type-check

**User Story:** As a developer, I want the real type errors fixed, so that `astro check` passes and the types reflect actual data shapes.

#### Acceptance Criteria

1. THE `export-service.test.ts` fixture SHALL use a valid `Style` enum value instead of `'dominicana'`.
2. THE `ReviewApp.tsx` state setters for annotations and sources SHALL receive correctly typed `Map<string, ClipAnnotation>` and `Map<string, SourceRecord>` values rather than `Map<unknown, unknown>`.
3. THE `validation-crossfield.prop.test.ts` `DancerState` construction SHALL assign values whose types satisfy `DancerState` without widening required fields to `undefined`.
4. THE system SHALL resolve all `noUnusedLocals` / `noUnusedParameters` errors surfaced by the Type_Check (for example the unused `BEATS_PER_CYCLE` constant in `cycle-builder.ts`, `hasSource` in `ClipPreviewPlayer.tsx`, the unused `annotations` parameter in `ClipGrid.tsx`, and unused test imports) by removing or using the symbols.
5. THE system SHALL resolve the remaining type errors reported by the Type_Check (for example the `deepMerge` cast in `annotation-service.ts` and any `implicitly has an 'any' type` parameters in subprocess handlers) without weakening type safety where a precise type is available.
6. WHEN all fixes are applied, THE Type_Check SHALL report zero errors and zero warnings that originate from project source (excluding third-party deprecation notices outside the project's control).

### Requirement 7: Consolidate duplicated subprocess plumbing

**User Story:** As a developer, I want a single shared subprocess runner, so that timeout, stream buffering, and error handling logic is not copied across services where copies can drift.

#### Acceptance Criteria

1. THE system SHALL introduce a Process_Runner helper that encapsulates the common pattern of spawning a child process, enforcing a timeout, buffering stdout/stderr, and resolving/rejecting on close/error.
2. THE Subprocess_Services SHALL use the Process_Runner for their non-streaming subprocess calls (for example `ffprobe`, the analyzer invocation, audio extraction, and per-clip ffmpeg extraction).
3. THE streaming download path in `ingestion-service.ts` (which yields incremental progress events) MAY retain bespoke handling where the Process_Runner abstraction does not fit, but SHALL reuse shared timeout and error-message helpers where practical.
4. THE duplicated yt-dlp error-classification logic (age-restricted / private / unavailable) in `ingestion-service.ts` SHALL be extracted into a single shared function used by both the metadata fetch and the download paths.
5. WHEN the refactor is complete, THE externally observable behavior of ingestion, analysis, and extraction (success outputs, error messages, timeouts) SHALL be unchanged, as demonstrated by the existing tests passing without modification to their assertions.
6. WHEN the refactor is complete, THE Type_Check SHALL report zero errors and THE Vitest suite SHALL pass.

### Requirement 8: Deduplicate app-state hydration logic

**User Story:** As a developer, I want a single code path for hydrating runtime state from a project file, so that the restore-on-startup and import paths cannot diverge.

#### Acceptance Criteria

1. THE `app-state.ts` startup restore logic in `getAppState()` SHALL reuse the same hydration routine used by `restoreProjectState()` (`hydrateRuntimeState`) rather than duplicating the clip/cycle/analysis loading inline.
2. WHEN state is restored on startup from `project.json`, THE resulting in-memory clips, cycles, and analysis results SHALL be identical to what the shared hydration routine produces.
3. WHEN the refactor is complete, THE existing `app-state` tests SHALL pass without changes to their assertions.

### Requirement 9: Single source of truth for required annotation fields

**User Story:** As a developer, I want the required-field list defined once, so that the annotation service and the schema validator cannot disagree about what is required.

#### Acceptance Criteria

1. THE 10-item required-field list currently duplicated in `annotation-service.ts` and `schema-validator.ts` SHALL be defined in exactly one shared location and imported by both.
2. THE shared definition SHALL preserve the exact current field set and ordering: `clip_id`, `source_id`, `status`, `remotion.from_frame`, `remotion.duration_in_frames`, `remotion.fps`, `move_name`, `difficulty`, `style`, `tags`.
3. THE `TOTAL_REQUIRED_FIELDS` value SHALL be derived from the shared definition.
4. WHEN the refactor is complete, THE completeness and validation tests SHALL pass without changes to their assertions.

### Requirement 10: Remove stale requirement-reference comments

**User Story:** As a developer, I want code comments to reflect the current spec, so that stale traceability references do not mislead readers.

#### Acceptance Criteria

1. THE service files SHALL have outdated inline requirement references (for example `clip-manager.ts`'s "Requirements: 2.2, 3.2, ... 5.9" header and similar stale references in other services) removed or replaced with an accurate brief description.
2. THE changes in this requirement SHALL be comment-only and SHALL NOT alter runtime behavior.

### Requirement 11: Verification

**User Story:** As a developer, I want an explicit green baseline after the cleanup, so that I can trust the changes did not regress anything.

#### Acceptance Criteria

1. WHEN the cleanup is complete, THE `npx astro check` command SHALL exit with zero errors.
2. WHEN the cleanup is complete, THE `npm run test` command SHALL pass all previously-passing tests.
3. WHEN the cleanup is complete, THE `uv run pytest` command SHALL pass (analyzer behavior unchanged).
4. THE final state SHALL leave no temporary files created during verification in the repository.
