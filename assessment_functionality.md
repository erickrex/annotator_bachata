# Functionality Assessment

## Verdict

The project is **not fully functional** as it stands.

The pure logic layer is in better shape than the integrated application:

- `npm test` passed with 213 tests
- `uv run pytest` passed with 14 tests
- `npm run build` failed

The main ingest -> analyze -> generate -> review workflow is not wired together end to end, and there are several persistence and runtime integration issues that prevent the app from behaving like a complete product.

## Major Findings

### 1. Core user flow is broken

The ingest page only calls `/api/ingest` and then links to `/review`. The review app only fetches existing clips. No client code triggers:

- `/api/analyze/:sourceId`
- `/api/clips/generate`

That means a successful download still leads to an empty review screen unless those API routes are manually called elsewhere.

Relevant files:

- `src/pages/index.astro`
- `src/components/ReviewApp.tsx`
- `src/pages/api/analyze/[sourceId].ts`
- `src/pages/api/clips/generate.ts`

### 2. Clip preview is not actually wired

`ReviewApp` renders the player with:

- `sourceVideoPath=""`

So the selected clip has no real source video path. It also does not pass:

- `onFrameChange`
- `onNextClip`
- `onPrevClip`

As a result:

- preview playback is not correctly connected to a source file
- split-at-frame is not connected to real current frame updates
- next/previous clip keyboard navigation is not connected

Relevant files:

- `src/components/ReviewApp.tsx`
- `src/components/ClipPreviewPlayer.tsx`
- `src/components/ClipGrid.tsx`

### 3. Annotation cannot start naturally for new clips

The annotation form only renders if an annotation already exists for the selected clip. But clip generation only creates clip records in memory; it does not seed annotations.

So newly generated clips can appear without any editable annotation form.

Additionally, the fallback annotation skeleton is not seeded from the selected clip/source metadata, so the first annotation update starts from an incomplete base model.

Relevant files:

- `src/components/ReviewApp.tsx`
- `src/pages/api/clips/generate.ts`
- `src/pages/api/clips/[id]/annotation.ts`
- `src/services/annotation-service.ts`

### 4. Persistence is incomplete and restore is effectively broken

The app auto-saves `annotationService.exportProject()`, but that export only contains:

- sources
- annotations

It does **not** persist the live `state.clips` map, cycle hierarchy, or other in-memory structures needed to restore working state.

Consequences:

- generated but unannotated clips are lost
- merge/split outcomes can be lost
- some status changes are only partially preserved
- restarting the server clears working state even if `project.json` exists

Also, startup never reloads saved project state into `getAppState()`, and project import hydrates only the annotation service, not the live clip/cycle state used by the UI and APIs.

Relevant files:

- `src/services/app-state.ts`
- `src/services/project-service.ts`
- `src/services/annotation-service.ts`
- `src/pages/api/project/import.ts`

### 5. Beat overlays use the wrong frame space

`BeatOverlay` expects beat marker frames relative to clip start. But `createClips()` stores beat markers using source-frame positions.

That means beat overlays become inaccurate for any clip that does not begin at frame 0.

Relevant files:

- `src/remotion/BeatOverlay.tsx`
- `src/remotion/VirtualClip.tsx`
- `src/services/clip-manager.ts`

### 6. Build/deployment is currently broken

`astro build` fails with:

- `NoAdapterInstalled`

The project is configured with:

- `output: 'server'`

but no Astro adapter is installed/configured.

There are also strict TypeScript issues when running:

- `npx tsc --noEmit`

including type errors in the export path and unused declarations across the codebase/tests.

Relevant files:

- `astro.config.mjs`
- `src/services/export-service.ts`

### 7. Ingest error handling is flawed

The ingest page checks:

- `if (!res.ok && !res.body)`

That means a failing response with a body can fall through into SSE parsing instead of surfacing the JSON error cleanly. This can leave the UI in a confusing or stuck state.

Relevant file:

- `src/pages/index.astro`

## Is It Fully Functional?

No.

What does work reasonably well:

- many pure service-layer functions
- schema validation logic
- property-based and unit-style test coverage
- Python analyzer tests

What does not work as a complete product:

- end-to-end user workflow
- persistent project restoration
- review/preview wiring
- production build/deployment

## Simplification Opportunities

There is significant room for simplification and improvement.

### 1. Use a single source of truth for project state

Right now state is split between:

- `annotationService`
- `state.clips`
- `state.cycles`
- `state.analysisResults`
- `state.sourceMetadata`

This creates sync problems and persistence gaps.

A much cleaner design would use one persisted project model containing:

- sources
- analysis results
- clips
- annotations
- manifest/derived summaries

Then derive everything else from that model.

### 2. Make the workflow explicit in the UI

The app should drive the user through:

1. ingest
2. analyze
3. generate clips
4. review
5. annotate
6. export

Right now those backend capabilities exist, but the frontend does not orchestrate them.

### 3. Seed annotations when clips are created

If each clip had an initial annotation record created at generation time, the form could always open for a selected clip and the app would behave much more predictably.

### 4. Remove duplicated logic

Completeness logic is duplicated in the UI and service layer. That should live in one place only.

Relevant file:

- `src/components/ClipGrid.tsx`

### 5. Revisit export integration

The Remotion export service currently has both typing issues and questionable runtime assumptions. It should be validated against the actual renderer API and integrated only after the main workflow is stable.

## Overall Assessment

This project looks like a strong prototype with solid logic/test intent, but it is not yet a fully integrated, production-ready application.

The biggest gaps are not in isolated algorithms. They are in:

- orchestration
- persistence
- UI wiring
- deployment readiness

Those should be addressed before treating the system as complete or fully functional.
