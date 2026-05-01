// Export Service — uses ffmpeg for clip trimming and export.
// Replaces the previous Remotion-based export with direct ffmpeg subprocess calls.

import type { VirtualClipDef, ClipAnnotation } from '../types/index.js';
import { join } from 'node:path';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface ExportOptions {
  clip: VirtualClipDef;
  annotation: ClipAnnotation;
  outputDir: string;
}

export interface ExportResult {
  clipId: string;
  outputPath: string;    // path to trimmed MP4
  sidecarPath: string;   // path to annotation JSON
}

// ---------------------------------------------------------------------------
// Trim Range Computation
// ---------------------------------------------------------------------------

/**
 * Compute the ffmpeg seek position and duration for a clip export.
 * Falls back to handleBefore-based defaults when inPoint/outPoint are not set.
 */
export function computeTrimRange(clip: VirtualClipDef): { seekPosition: number; duration: number } {
  const clipDuration = clip.remotion.durationInFrames / clip.remotion.fps;
  const handleBefore = clip.handleBefore ?? 0;

  const seekPosition = clip.inPoint ?? handleBefore;
  const outPoint = clip.outPoint ?? (handleBefore + clipDuration);
  const duration = outPoint - seekPosition;

  return { seekPosition, duration };
}

// ---------------------------------------------------------------------------
// Sidecar JSON
// ---------------------------------------------------------------------------

interface SidecarData {
  clip_id: string;
  source_id: string;
  move_name: string;
  difficulty: string;
  style: string;
  tags: string[];
  duration_seconds: number;
  trim: {
    inPoint: number;
    outPoint: number;
  };
}

function buildSidecarData(clip: VirtualClipDef, annotation: ClipAnnotation, trimRange: { seekPosition: number; duration: number }): SidecarData {
  return {
    clip_id: clip.clipId,
    source_id: clip.sourceId,
    move_name: annotation.move_name,
    difficulty: annotation.difficulty,
    style: annotation.style,
    tags: annotation.tags,
    duration_seconds: trimRange.duration,
    trim: {
      inPoint: trimRange.seekPosition,
      outPoint: trimRange.seekPosition + trimRange.duration,
    },
  };
}

// ---------------------------------------------------------------------------
// Export Functions
// ---------------------------------------------------------------------------

/**
 * Export a single virtual clip to a trimmed MP4 file using ffmpeg.
 * Also writes a sidecar JSON with annotation metadata.
 */
export async function exportClip(options: ExportOptions): Promise<ExportResult> {
  const { clip, annotation, outputDir } = options;

  // Validate extracted file exists
  if (!clip.extractedFile) {
    throw new Error(`Clip ${clip.clipId} has no extracted file path set`);
  }

  const extractedFile = clip.extractedFile;

  try {
    await access(extractedFile);
  } catch {
    throw new Error(`Extracted file not found for clip ${clip.clipId}: ${extractedFile}`);
  }

  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, `${clip.clipId}.mp4`);
  const sidecarPath = join(outputDir, `${clip.clipId}.json`);

  // Compute trim range
  const trimRange = computeTrimRange(clip);

  // Run ffmpeg
  try {
    await execFile('ffmpeg', [
      '-y',
      '-ss', String(trimRange.seekPosition),
      '-t', String(trimRange.duration),
      '-i', extractedFile,
      '-c', 'copy',
      outputPath,
    ]);
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const lastChars = stderr.slice(-500);
    throw new Error(`ffmpeg export failed for clip ${clip.clipId}: ${lastChars}`);
  }

  // Write sidecar JSON (non-fatal on failure)
  const sidecarData = buildSidecarData(clip, annotation, trimRange);
  try {
    await writeFile(sidecarPath, JSON.stringify(sidecarData, null, 2), 'utf-8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Failed to write sidecar JSON for clip ${clip.clipId}: ${message}`);
  }

  return { clipId: clip.clipId, outputPath, sidecarPath };
}

/**
 * Export a batch of clips as trimmed MP4 files with sidecar JSONs.
 * Yields each completed export result. Skips discarded clips.
 */
export async function* exportBatch(
  clips: Array<{ clip: VirtualClipDef; annotation: ClipAnnotation }>,
  outputDir: string,
  onProgress?: (clipId: string, percent: number) => void,
): AsyncGenerator<ExportResult> {
  const eligible = clips.filter((c) => c.clip.status !== 'discarded');

  for (let i = 0; i < eligible.length; i++) {
    const { clip, annotation } = eligible[i];
    onProgress?.(clip.clipId, 0);

    const result = await exportClip({ clip, annotation, outputDir });

    onProgress?.(clip.clipId, 100);
    yield result;
  }
}
