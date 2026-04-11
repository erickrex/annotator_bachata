// App State Singleton — shared state across API routes.
// Holds the AnnotationServiceImpl instance, clip definitions,
// cycle hierarchies, and analysis results for the active project.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AnnotationServiceImpl } from './annotation-service.js';
import { computeManifest, createDebouncedSaver } from './project-service.js';
import type { DebouncedSaver, ExtendedProjectFile } from './project-service.js';
import type {
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

/** Reset the singleton (for testing only). */
export function resetAppState(): void {
  instance = null;
}

export function getAppState(): AppState {
  if (!instance) {
    const projectDir = process.cwd();
    const annotationService = new AnnotationServiceImpl('Bachata Clip Library');
    const clips = new Map<string, VirtualClipDef>();
    const cycles = new Map<string, CycleHierarchy>();
    const analysisResults = new Map<string, AudioAnalysisResult>();

    // Restore from project.json if it exists on disk
    const projectJsonPath = join(projectDir, 'project.json');
    if (existsSync(projectJsonPath)) {
      try {
        const raw = readFileSync(projectJsonPath, 'utf-8');
        const saved = JSON.parse(raw) as ExtendedProjectFile;

        // Import annotations and sources via the annotation service
        annotationService.importProject(saved, projectDir);

        // Hydrate virtual clips
        if (saved.virtual_clips) {
          for (const clip of saved.virtual_clips) {
            clips.set(clip.clipId, clip);
          }
        }

        // Hydrate cycle hierarchies
        if (saved.cycle_hierarchies) {
          for (const [key, hierarchy] of saved.cycle_hierarchies) {
            cycles.set(key, hierarchy);
          }
        }

        // Hydrate analysis results
        if (saved.analysis_results) {
          for (const [key, result] of saved.analysis_results) {
            analysisResults.set(key, result);
          }
        }
      } catch {
        // If restore fails, continue with empty state
      }
    }

    instance = {
      annotationService,
      clips,
      cycles,
      analysisResults,
      sourceMetadata: new Map(),
      projectDir,
      debouncedSaver: createDebouncedSaver(projectDir),
    };
  }
  return instance;
}

/** Trigger auto-save of project state. */
export function autoSave(): void {
  const state = getAppState();
  const projectFile = state.annotationService.exportProject();

  // Build extended project file with full runtime state
  const extendedFile: ExtendedProjectFile = {
    ...projectFile,
    virtual_clips: Array.from(state.clips.values()),
    cycle_hierarchies: Array.from(state.cycles.entries()),
    analysis_results: Array.from(state.analysisResults.entries()),
  };

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
