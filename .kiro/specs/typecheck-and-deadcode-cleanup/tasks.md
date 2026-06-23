# Implementation Plan: Type-Check and Dead-Code Cleanup

## Overview

Work in dependency order: restore the type-check baseline first (this makes the remaining real errors visible and removes ~120 noise errors), then remove dead Remotion code, fix the broken integration test, correct documentation drift, and fix the genuine type errors. Once `astro check` is clean and tests are green, apply the behavior-preserving service-layer refactors (shared subprocess runner, app-state hydration dedup, shared required-field constant, stale-comment cleanup), each verified against the now-green baseline. Each phase ends by re-running `astro check`, with `npm run test` gates to prevent regressions.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "dependsOn": [] },
    { "wave": 2, "tasks": ["2"], "dependsOn": ["1"] },
    { "wave": 3, "tasks": ["3", "4"], "dependsOn": ["2"] },
    { "wave": 4, "tasks": ["5"], "dependsOn": ["3", "4"] },
    { "wave": 5, "tasks": ["6"], "dependsOn": ["5"] },
    { "wave": 6, "tasks": ["7"], "dependsOn": ["6"] },
    { "wave": 7, "tasks": ["8", "9", "10"], "dependsOn": ["7"] },
    { "wave": 8, "tasks": ["11"], "dependsOn": ["8", "9", "10"] }
  ]
}
```

- Task 1 must complete first: it removes ~120 noise errors and re-scopes the genuine ones.
- Tasks 3 and 4 both depend on the baseline (Task 2 checkpoint) and are independent of each other (same wave).
- Task 7 (genuine type bugs) depends on docs/dead-code cleanup so the only remaining `astro check` errors are real type bugs.
- Tasks 8, 9, and 10 are the behavior-preserving refactors; they depend on a green baseline (Task 7) and are independent of each other, but each must re-verify tests after its change.
- Task 11 is the final green-baseline gate.

## Tasks

- [x] 1. Restore the type-check baseline
  - [x] 1.1 Add `@types/node` as a devDependency in `package.json`
    - Add `"@types/node": "^20.x"` to `devDependencies`
    - Run `npm install` to install it and update `package-lock.json`
    - _Requirements: 1.1_
  - [x] 1.2 Update `tsconfig.json` `compilerOptions.types`
    - Change `"types": ["vitest/globals"]` to `"types": ["vitest/globals", "node"]`
    - _Requirements: 1.2_
  - [x] 1.3 Re-run `npx astro check` and confirm `node:*` / `process` / `Buffer` errors are resolved
    - Capture the remaining error list to re-scope Phase 5
    - Confirm `npm run test` still passes
    - _Requirements: 1.3, 1.4_

- [x] 2. Checkpoint - type-check baseline restored
  - Confirm the `node:*`, `process`, and `Buffer` errors are gone and tests still pass; ask the user if questions arise.

- [x] 3. Remove dead Remotion code
  - [x] 3.1 Delete the `src/remotion/` directory
    - Remove `Root.tsx`, `VirtualClip.tsx`, `BeatOverlay.tsx`, `EnergyOverlay.tsx`, `index.ts`
    - _Requirements: 2.1_
  - [x] 3.2 Remove the `remotion` dependency from `package.json` and update the lockfile
    - Delete `"remotion": "^4.0.0"` from `dependencies`
    - Run `npm install` to update `package-lock.json`
    - _Requirements: 2.2, 2.4_
  - [x] 3.3 Verify no remaining references to Remotion compositions or the package
    - Grep `src/**` for `remotion`/`Remotion`/`VirtualClip`/`BeatOverlay`/`EnergyOverlay`
    - Confirm only `clip.remotion.*` domain timing fields remain (not the package)
    - _Requirements: 2.3_
  - [x] 3.4 Confirm the export pipeline still works without Remotion
    - Run the export-service tests; confirm they pass with ffmpeg only
    - _Requirements: 3.1, 3.2, 2.5_

- [x] 4. Fix the broken integration test block
  - [x] 4.1 Remove the "Remotion renderer" describe block from `src/tests/integration/subprocess-pipelines.test.ts`
    - Delete both `it` cases and the imports of `@remotion/renderer` and `../../remotion/index.js`
    - _Requirements: 4.1, 4.2_
  - [x] 4.2 Update integration test comments and describe labels from `librosa` to `beat_this`
    - Update the file header comment and the analyzer describe label/comments
    - _Requirements: 4.3_
  - [x] 4.3 (Optional, if `uv` + `ffmpeg` available) Run `INTEGRATION=1 npx vitest run src/tests/integration/`
    - Confirm no missing-module failure for `@remotion/renderer`
    - _Requirements: 4.4_

- [x] 5. Correct librosa documentation drift (behavior-neutral)
  - [x] 5.1 Update `README.md` stack and prose to describe `beat_this`
    - Replace "Rendering/export: Remotion" with ffmpeg
    - Replace the `librosa, numpy` Python stack line with `beat_this`, `torch`, `torchaudio`, `numpy`, `scipy`, `soundfile`
    - Reword any "librosa analyzer" prose to "beat_this analyzer"
    - _Requirements: 5.1_
  - [x] 5.2 Update `src/services/audio-analysis-service.ts` doc comments
    - "librosa analyzer" → "beat_this analyzer"
    - _Requirements: 5.2_
  - [x] 5.3 Reword the `analyzer/analyze.py` energy-profile comment
    - Keep parameter values; reword "Matches librosa's default behavior" to reference the preserved parameter values for output compatibility
    - Do not change any numeric constants or logic
    - _Requirements: 5.3, 5.4_

- [x] 6. Checkpoint - dead code and docs cleaned
  - Confirm `astro check` error count dropped and `npm run test` passes; ask the user if questions arise.

- [x] 7. Fix genuine type errors surfaced by the restored type-check
  - [x] 7.1 Fix `export-service.test.ts` invalid `Style` enum value
    - Replace `style: 'dominicana'` with a valid `Style` value
    - _Requirements: 6.1_
  - [x] 7.2 Fix `ReviewApp.tsx` `Map<unknown, unknown>` typing for annotations and sources
    - Type the `.map()` entries so `new Map(...)` infers the correct `Map<string, T>`
    - _Requirements: 6.2_
  - [x] 7.3 Fix `validation-crossfield.prop.test.ts` `DancerState` construction
    - Ensure required fields (e.g. `hold`) keep their non-optional types
    - _Requirements: 6.3_
  - [x] 7.4 Resolve `noUnusedLocals` / `noUnusedParameters` errors
    - Remove `BEATS_PER_CYCLE` in `cycle-builder.ts`, `hasSource` in `ClipPreviewPlayer.tsx`, unused `annotations` param in `ClipGrid.tsx` (verify callers first), and unused test imports/locals (`React`, `vi`, `result`, `_promise`, `a`)
    - _Requirements: 6.4_
  - [x] 7.5 Resolve remaining type errors without weakening type safety
    - Address the `deepMerge` cast in `annotation-service.ts` and any residual implicit-`any` subprocess parameters
    - _Requirements: 6.5_
  - [x] 7.6 Re-run `npx astro check` and confirm zero project-source errors
    - _Requirements: 6.6, 11.1_

- [x] 8. Consolidate duplicated subprocess plumbing
  - [x] 8.1 Create a `Process_Runner` helper (e.g. `src/services/process-utils.ts`)
    - Implement `runProcess(cmd, args, opts)` that spawns, enforces a timeout (SIGKILL), buffers stdout/stderr, rejects on spawn error/timeout, and resolves `{ stdout, stderr, code }`
    - _Requirements: 7.1_
  - [x] 8.2 Extract the yt-dlp error classifier in `ingestion-service.ts`
    - Create one `classifyYtDlpError(message, code)` used by both the metadata fetch and download paths
    - _Requirements: 7.4_
  - [x] 8.3 Adopt `runProcess` in the non-streaming subprocess calls, one service at a time
    - `ffprobe()`, `fetchVideoInfo()`, `extractAudio()` in `ingestion-service.ts`; `analyze()` in `audio-analysis-service.ts`; `runFfmpeg()` in `clip-extraction-service.ts`
    - Keep each caller's parsing and exit-code-to-error logic; share only the spawn/timeout/buffering shell
    - Run that service's tests after each adoption
    - _Requirements: 7.2, 7.3, 7.5, 7.6_
  - [x] 8.4 Confirm behavior is preserved
    - Run the ingestion/analysis/extraction/export tests; assertions must pass unchanged
    - _Requirements: 7.5, 7.6_

- [x] 9. Deduplicate app-state hydration logic
  - [x] 9.1 Route `getAppState()` startup-restore through `hydrateRuntimeState()`
    - Replace the inline clip/cycle/analysis loading with a call to the shared routine inside the existing `importProject` success branch
    - _Requirements: 8.1, 8.2_
  - [x] 9.2 Confirm restore behavior is unchanged
    - Run the `app-state` tests; assertions must pass unchanged
    - _Requirements: 8.3_

- [x] 10. Single source of truth for required fields and stale-comment cleanup
  - [x] 10.1 Define `REQUIRED_FIELDS` once and import it in both consumers
    - Move the 10-item list to one module; import it in `annotation-service.ts` and `schema-validator.ts`; derive `TOTAL_REQUIRED_FIELDS` from `.length`
    - Preserve the exact field set and ordering
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 10.2 Confirm completeness/validation behavior is unchanged
    - Run the annotation-service, schema-validator, and related property tests; assertions must pass unchanged
    - _Requirements: 9.4_
  - [x] 10.3 Remove stale requirement-reference comments
    - Remove/replace outdated `// Requirements: ...` headers (e.g. `clip-manager.ts`) with an accurate one-line description; comment-only
    - _Requirements: 10.1, 10.2_

- [x] 11. Final verification
  - [x] 11.1 Run `npx astro check` — expect zero errors
    - _Requirements: 11.1_
  - [x] 11.2 Run `npm run test` — expect all previously-passing tests to pass (assertions unchanged)
    - _Requirements: 11.2_
  - [x] 11.3 Run `uv run pytest` — confirm analyzer behavior unchanged
    - _Requirements: 11.3_
  - [x] 11.4 Remove any temporary files created during verification
    - _Requirements: 11.4_

## Notes

- Task 1 is expected to eliminate the majority of the 162 errors (the `node:*`, `process`, `Buffer`, and many implicit-`any` diagnostics). Re-scope Task 7 against the actual post-Task-1 error list rather than the original 162.
- Documentation/comment changes in Task 5 are behavior-neutral; `uv run pytest` in Task 11 guards against accidental analyzer changes.
- Tasks 8–10 are behavior-preserving refactors. The contract is that they pass the **existing** tests **without editing assertions** — if a test needs its assertion changed, behavior changed and the refactor must be reconsidered.
- Specs under `.kiro/specs/**` are historical records and are intentionally left untouched even though they mention `librosa`/`remotion`.
- Each checkpoint is a natural stopping point to confirm direction with the user.
