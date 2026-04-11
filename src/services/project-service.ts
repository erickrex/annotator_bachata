// Project Service — reads/writes project.json and manifest.json,
// computes manifest summaries, and provides debounced auto-save.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CLIP_STATUS_VALUES } from '../types/enums.js';
import type { ClipStatus } from '../types/enums.js';
import type {
  AnnotationProjectFile,
  AudioAnalysisResult,
  ClipAnnotation,
  CycleHierarchy,
  ProjectManifest,
  VirtualClipDef,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Extended Project File — adds optional runtime state to the annotation format
// ---------------------------------------------------------------------------

export interface ExtendedProjectFile extends AnnotationProjectFile {
  virtual_clips?: VirtualClipDef[];
  cycle_hierarchies?: Array<[string, CycleHierarchy]>;
  analysis_results?: Array<[string, AudioAnalysisResult]>;
}

// ---------------------------------------------------------------------------
// Manifest Computation (pure)
// ---------------------------------------------------------------------------

/**
 * Compute a ProjectManifest from the current project state.
 *
 * `calculateCompleteness` is injected so this function stays pure and
 * decoupled from AnnotationService internals.
 */
export function computeManifest(
  projectFile: AnnotationProjectFile,
  calculateCompleteness: (clip: ClipAnnotation) => number,
): ProjectManifest {
  const clips = projectFile.clips;

  // clips_by_status — initialise every status to 0
  const clipsByStatus = {} as Record<ClipStatus, number>;
  for (const status of CLIP_STATUS_VALUES) {
    clipsByStatus[status] = 0;
  }
  for (const clip of clips) {
    if (clip.status in clipsByStatus) {
      clipsByStatus[clip.status]++;
    }
  }

  // annotation_completeness — average across all clips (0 when empty)
  let annotationCompleteness = 0;
  if (clips.length > 0) {
    const total = clips.reduce((sum, clip) => sum + calculateCompleteness(clip), 0);
    annotationCompleteness = total / clips.length;
  }

  return {
    project_name: projectFile.project.name,
    created_at: projectFile.project.created_at,
    updated_at: projectFile.project.updated_at,
    sources_count: projectFile.sources.length,
    clips_total: clips.length,
    clips_by_status: clipsByStatus,
    annotation_completeness: annotationCompleteness,
    sources: projectFile.sources.map((s) => s.source_id),
  };
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

const JSON_INDENT = 2;

/** Write project.json to `projectDir`. */
export async function saveProject(
  projectDir: string,
  projectFile: AnnotationProjectFile,
): Promise<void> {
  const filePath = join(projectDir, 'project.json');
  await writeFile(filePath, JSON.stringify(projectFile, null, JSON_INDENT), 'utf-8');
}

/** Write manifest.json to `projectDir`. */
export async function saveManifest(
  projectDir: string,
  manifest: ProjectManifest,
): Promise<void> {
  const filePath = join(projectDir, 'manifest.json');
  await writeFile(filePath, JSON.stringify(manifest, null, JSON_INDENT), 'utf-8');
}

/** Write the extended project format (annotations + runtime state) to project.json. */
export async function saveFullState(
  projectDir: string,
  extendedFile: ExtendedProjectFile,
): Promise<void> {
  const filePath = join(projectDir, 'project.json');
  await writeFile(filePath, JSON.stringify(extendedFile, null, JSON_INDENT), 'utf-8');
}

/** Read project.json from `projectDir`. Returns null if not found. */
export async function loadProject(
  projectDir: string,
): Promise<ExtendedProjectFile | null> {
  try {
    const filePath = join(projectDir, 'project.json');
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ExtendedProjectFile;
  } catch {
    return null;
  }
}

/** Read manifest.json from `projectDir`. Returns null if not found. */
export async function loadManifest(
  projectDir: string,
): Promise<ProjectManifest | null> {
  try {
    const filePath = join(projectDir, 'manifest.json');
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ProjectManifest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Debounced Saver
// ---------------------------------------------------------------------------

export interface DebouncedSaver {
  /** Schedule a save. Resets the timer if called again within the delay. */
  save(projectFile: ExtendedProjectFile): void;
  /** Schedule a manifest save alongside the project save. */
  saveManifest(manifest: ProjectManifest): void;
  /** Flush any pending save immediately. */
  flush(): Promise<void>;
  /** Cancel any pending save without writing. */
  cancel(): void;
}

/**
 * Create a debounced saver that writes project.json and manifest.json
 * after `delayMs` milliseconds of inactivity.
 */
export function createDebouncedSaver(
  projectDir: string,
  delayMs = 1000,
): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingProject: ExtendedProjectFile | null = null;
  let pendingManifest: ProjectManifest | null = null;

  async function doSave(): Promise<void> {
    const project = pendingProject;
    const manifest = pendingManifest;
    pendingProject = null;
    pendingManifest = null;

    const writes: Promise<void>[] = [];
    if (project) writes.push(saveFullState(projectDir, project));
    if (manifest) writes.push(saveManifest(projectDir, manifest));
    await Promise.all(writes);
  }

  function scheduleFlush(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void doSave().catch((error) => {
        console.error('Failed to persist project state', error);
      });
    }, delayMs);
  }

  return {
    save(projectFile: ExtendedProjectFile): void {
      pendingProject = projectFile;
      scheduleFlush();
    },

    saveManifest(manifest: ProjectManifest): void {
      pendingManifest = manifest;
      scheduleFlush();
    },

    async flush(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await doSave();
    },

    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingProject = null;
      pendingManifest = null;
    },
  };
}
