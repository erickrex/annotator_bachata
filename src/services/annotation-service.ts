// Annotation Service — manages annotation CRUD, auto-population,
// validation, completeness tracking, and project import/export.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateClip } from './schema-validator.js';
import { DEFAULT_ENUM_DEFINITIONS } from '../types/enums.js';
import type {
  AnnotationProjectFile,
  ClipAnnotation,
  ImportResult,
  SourceRecord,
  ValidationResult,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Required fields — reduced to 10 dot-paths for completeness scoring
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: string[] = [
  'clip_id',
  'source_id',
  'status',
  'remotion.from_frame',
  'remotion.duration_in_frames',
  'remotion.fps',
  'move_name',
  'difficulty',
  'style',
  'tags',
];

/** Total required fields for completeness calculation. */
export const TOTAL_REQUIRED_FIELDS = REQUIRED_FIELDS.length; // 10

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNestedValue(obj: unknown, dotPath: string): unknown {
  const keys = dotPath.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isFilledValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

/** Deep merge `source` into `target`, returning a new object. */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// AnnotationServiceImpl
// ---------------------------------------------------------------------------

export class AnnotationServiceImpl {
  private annotations = new Map<string, ClipAnnotation>();
  private sources = new Map<string, SourceRecord>();
  private projectName: string;
  private createdAt: string;

  constructor(projectName = 'Untitled Project') {
    this.projectName = projectName;
    this.createdAt = new Date().toISOString();
  }

  // -- Source management (needed for validation context) --------------------

  addSource(source: SourceRecord): void {
    this.sources.set(source.source_id, source);
  }

  getSource(sourceId: string): SourceRecord | undefined {
    return this.sources.get(sourceId);
  }

  // -- Annotation CRUD -----------------------------------------------------

  getAnnotation(clipId: string): ClipAnnotation | null {
    return this.annotations.get(clipId) ?? null;
  }

  deleteAnnotation(clipId: string): void {
    this.annotations.delete(clipId);
  }

  /**
   * Update annotation fields with partial merge.
   * Auto-populates computed fields, validates, and prevents
   * status transition to 'annotated' when validation errors exist.
   */
  updateAnnotation(
    clipId: string,
    fields: Partial<ClipAnnotation>,
  ): ValidationResult {
    let existing = this.annotations.get(clipId);

    if (!existing) {
      // Create a minimal skeleton so we can merge into it
      existing = this.createSkeleton(clipId);
    }

    // Deep merge the incoming fields
    const merged = deepMerge(
      existing as unknown as Record<string, unknown>,
      fields as unknown as Record<string, unknown>,
    ) as ClipAnnotation;

    // Auto-populate computed fields
    this.autoPopulate(merged);

    // Validate
    const result = this.validate(merged);

    // Prevent status transition to 'annotated' if validation errors exist
    if (merged.status === 'annotated' && !result.valid) {
      merged.status = existing.status === 'annotated' ? 'in_progress' : existing.status;
    }

    this.annotations.set(clipId, merged);
    return result;
  }

  // -- Validation ----------------------------------------------------------

  validate(annotation: ClipAnnotation): ValidationResult {
    const allClipIds = new Set<string>();
    for (const [id] of this.annotations) {
      if (id !== annotation.clip_id) {
        allClipIds.add(id);
      }
    }

    const source = this.sources.get(annotation.source_id);
    const sourceTotalFrames = source?.total_frames ?? Infinity;

    const errors = validateClip(
      annotation,
      allClipIds,
      sourceTotalFrames,
    );

    return { valid: errors.length === 0, errors };
  }

  // -- Completeness --------------------------------------------------------

  calculateCompleteness(annotation: ClipAnnotation): number {
    const obj = annotation as unknown as Record<string, unknown>;
    let filled = 0;
    for (const field of REQUIRED_FIELDS) {
      if (isFilledValue(getNestedValue(obj, field))) {
        filled++;
      }
    }
    return filled / TOTAL_REQUIRED_FIELDS;
  }

  // -- Export --------------------------------------------------------------

  exportProject(): AnnotationProjectFile {
    return {
      schema_version: '2.0',
      project: {
        name: this.projectName,
        created_at: this.createdAt,
        updated_at: new Date().toISOString(),
      },
      sources: Array.from(this.sources.values()),
      enum_definitions: { ...DEFAULT_ENUM_DEFINITIONS },
      clips: Array.from(this.annotations.values()),
    };
  }

  // -- Import --------------------------------------------------------------

  importProject(
    json: AnnotationProjectFile,
    projectDir: string,
  ): ImportResult {
    const missingFiles: string[] = [];

    // Verify all source files exist on disk
    for (const source of json.sources) {
      const videoPath = join(projectDir, source.video_file);
      const audioPath = join(projectDir, source.audio_file);
      if (!existsSync(videoPath)) {
        missingFiles.push(source.video_file);
      }
      if (!existsSync(audioPath)) {
        missingFiles.push(source.audio_file);
      }
    }

    if (missingFiles.length > 0) {
      return { success: false, missingFiles, clipsLoaded: 0 };
    }

    // Load sources
    this.sources.clear();
    for (const source of json.sources) {
      this.sources.set(source.source_id, source);
    }

    // Load clips
    this.annotations.clear();
    for (const clip of json.clips) {
      this.annotations.set(clip.clip_id, clip);
    }

    // Update project metadata
    this.projectName = json.project.name;
    this.createdAt = json.project.created_at;

    return {
      success: true,
      missingFiles: [],
      clipsLoaded: json.clips.length,
    };
  }

  // -- Private helpers -----------------------------------------------------

  /**
   * Auto-populate optional computed fields from remotion data and source analysis.
   * These fields are not required for completeness but are useful metadata.
   */
  private autoPopulate(clip: ClipAnnotation): void {
    const { remotion } = clip;
    if (!remotion || !remotion.fps || !remotion.duration_in_frames) return;

    // duration_seconds = duration_in_frames / fps (optional metadata)
    clip.duration_seconds = remotion.duration_in_frames / remotion.fps;

    // estimated_tempo_bpm from source analysis (if not already set by user)
    const source = this.sources.get(clip.source_id);
    if (source && (!clip.estimated_tempo_bpm || clip.estimated_tempo_bpm === 0)) {
      clip.estimated_tempo_bpm = source.detected_bpm;
    }

    // beats_total from BPM and duration (optional metadata)
    if (clip.estimated_tempo_bpm && clip.estimated_tempo_bpm > 0 && clip.duration_seconds > 0) {
      const rawBeats = (clip.estimated_tempo_bpm * clip.duration_seconds) / 60;
      clip.beats_total = Math.round(rawBeats);
    }

    // bars_total = beats_total / 4 (optional metadata)
    if (clip.beats_total && clip.beats_total > 0) {
      clip.bars_total = clip.beats_total / 4;
    }
  }

  private createSkeleton(clipId: string): ClipAnnotation {
    return {
      clip_id: clipId,
      source_id: '',
      status: 'pending',
      remotion: { from_frame: 0, duration_in_frames: 0, fps: 0 },
      move_name: '',
      tags: [],
      difficulty: '' as any,
      style: '' as any,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAnnotationService(
  projectName?: string,
): AnnotationServiceImpl {
  return new AnnotationServiceImpl(projectName);
}
