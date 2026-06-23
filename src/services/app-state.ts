// App State Singleton — shared state across API routes.
// Holds the AnnotationServiceImpl instance, clip definitions,
// cycle hierarchies, and analysis results for the active project.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AnnotationServiceImpl } from './annotation-service.js';
import { computeManifest, createDebouncedSaver } from './project-service.js';
import type { DebouncedSaver, ExtendedProjectFile } from './project-service.js';
import { registerShutdownHandlers } from './shutdown-handler.js';
import type {
  ClipAnnotation,
  AudioAnalysisResult,
  CycleHierarchy,
  ProjectManifest,
  SourceMetadata,
  VirtualClipDef,
} from '../types/index.js';

export interface AppState {
  annotationService: AnnotationServiceImpl;
  clips: Map<string, VirtualClipDef>;
  cycles: Map<string, CycleHierarchy>;
  analysisResults: Map<string, AudioAnalysisResult>;
  sourceMetadata: Map<string, SourceMetadata>;
  projectDir: string;
  debouncedSaver: DebouncedSaver;
}

let instance: AppState | null = null;

function resolveProjectDir(): string {
  return process.env.PROJECT_DIR ?? process.cwd();
}

function cloneAnnotation(annotation: ClipAnnotation): ClipAnnotation {
  return JSON.parse(JSON.stringify(annotation)) as ClipAnnotation;
}

function clipToAnnotationFields(clip: VirtualClipDef): Partial<ClipAnnotation> {
  return {
    clip_id: clip.clipId,
    source_id: clip.sourceId,
    status: clip.status,
    remotion: {
      from_frame: clip.remotion.fromFrame,
      duration_in_frames: clip.remotion.durationInFrames,
      fps: clip.remotion.fps,
    },
  };
}

function hydrateRuntimeState(state: AppState, projectFile: ExtendedProjectFile): void {
  state.clips.clear();
  state.cycles.clear();
  state.analysisResults.clear();

  if (projectFile.virtual_clips) {
    for (const clip of projectFile.virtual_clips) {
      state.clips.set(clip.clipId, clip);
    }
  }

  if (projectFile.cycle_hierarchies) {
    for (const [key, hierarchy] of projectFile.cycle_hierarchies) {
      state.cycles.set(key, hierarchy);
    }
  }

  if (projectFile.analysis_results) {
    for (const [key, result] of projectFile.analysis_results) {
      state.analysisResults.set(key, result);
    }
  }
}

/** Reset the singleton (for testing only). */
export function resetAppState(): void {
  instance = null;
}

export function getAppState(): AppState {
  if (!instance) {
    const projectDir = resolveProjectDir();
    const annotationService = new AnnotationServiceImpl('Bachata Clip Library');

    // Build the state first so startup-restore can reuse the shared
    // hydrateRuntimeState routine (the same one restoreProjectState uses).
    const state: AppState = {
      annotationService,
      clips: new Map<string, VirtualClipDef>(),
      cycles: new Map<string, CycleHierarchy>(),
      analysisResults: new Map<string, AudioAnalysisResult>(),
      sourceMetadata: new Map(),
      projectDir,
      debouncedSaver: createDebouncedSaver(projectDir),
    };

    // Restore from project.json if it exists on disk
    const projectJsonPath = join(projectDir, 'project.json');
    if (existsSync(projectJsonPath)) {
      try {
        const raw = readFileSync(projectJsonPath, 'utf-8');
        const saved = JSON.parse(raw) as ExtendedProjectFile;

        const result = annotationService.importProject(saved, projectDir);
        if (result.success) {
          hydrateRuntimeState(state, saved);
        } else {
          console.error('Failed to restore project state due to missing files', result.missingFiles);
        }
      } catch (error) {
        console.error('Failed to restore project state from project.json', error);
      }
    }

    instance = state;
    registerShutdownHandlers(instance.debouncedSaver);
  }
  return instance;
}

export function getFullProjectState(): ExtendedProjectFile {
  const state = getAppState();
  const projectFile = state.annotationService.exportProject();

  // Derive ClipAnnotation.remotion from VirtualClipDef at serialization time
  // (VirtualClipDef is the single source of truth for timing fields)
  const clips = projectFile.clips.map((annotation) => {
    const clipDef = state.clips.get(annotation.clip_id);
    if (clipDef) {
      const derived = clipToAnnotationFields(clipDef);
      return { ...annotation, remotion: derived.remotion! };
    }
    return annotation;
  });

  return {
    ...projectFile,
    clips,
    virtual_clips: Array.from(state.clips.values()),
    cycle_hierarchies: Array.from(state.cycles.entries()),
    analysis_results: Array.from(state.analysisResults.entries()),
  };
}

export function restoreProjectState(projectFile: ExtendedProjectFile) {
  const state = getAppState();
  const result = state.annotationService.importProject(projectFile, state.projectDir);
  if (!result.success) {
    return result;
  }

  hydrateRuntimeState(state, projectFile);
  return result;
}

export function upsertClip(clip: VirtualClipDef, baseAnnotation: ClipAnnotation | null = null): void {
  const state = getAppState();
  state.clips.set(clip.clipId, clip);

  const annotation = baseAnnotation ? cloneAnnotation(baseAnnotation) : null;
  state.annotationService.updateAnnotation(clip.clipId, {
    ...(annotation ?? {}),
    ...clipToAnnotationFields(clip),
  });
}

export function removeClip(clipId: string): void {
  const state = getAppState();
  state.clips.delete(clipId);
  state.annotationService.deleteAnnotation(clipId);
}

export function replaceClipsForSource(sourceId: string, newClips: VirtualClipDef[]): void {
  const state = getAppState();
  const existingAnnotations = new Map<string, ClipAnnotation>();

  for (const clip of state.clips.values()) {
    if (clip.sourceId !== sourceId) {
      continue;
    }

    const annotation = state.annotationService.getAnnotation(clip.clipId);
    if (annotation) {
      existingAnnotations.set(clip.clipId, cloneAnnotation(annotation));
    }
  }

  for (const clip of Array.from(state.clips.values())) {
    if (clip.sourceId === sourceId) {
      removeClip(clip.clipId);
    }
  }

  for (const clip of newClips) {
    upsertClip(clip, existingAnnotations.get(clip.clipId) ?? null);
  }
}

/** Trigger auto-save of project state. */
export function autoSave(): void {
  const state = getAppState();
  const projectFile = state.annotationService.exportProject();
  const extendedFile = getFullProjectState();

  state.debouncedSaver.save(extendedFile);

  // Also write manifest.json synchronously to keep it in sync
  const manifest = computeManifest(projectFile, (clip) =>
    state.annotationService.calculateCompleteness(clip),
  );
  state.debouncedSaver.saveManifest(manifest);
}

/** Compute the current project manifest. */
export function getManifest(): ProjectManifest {
  const state = getAppState();
  const projectFile = state.annotationService.exportProject();
  return computeManifest(projectFile, (clip) =>
    state.annotationService.calculateCompleteness(clip),
  );
}

/** JSON response helper. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Error response helper. */
export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
