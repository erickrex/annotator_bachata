/**
 * Clip Extraction Service — extracts individual clip MP4 files from the source video
 * using ffmpeg. Each clip is extracted with configurable "handles" (extra footage on
 * each side) so boundary adjustments can be made without re-extraction.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { VirtualClipDef } from '../types/index.js';
import { runProcess } from './process-utils.js';

/** Default handle duration in seconds added before and after each clip. */
export const DEFAULT_HANDLE_SECONDS = 1.0;

/** Timeout for a single ffmpeg extraction (60 seconds per clip). */
const FFMPEG_TIMEOUT_MS = 60_000;

export interface ExtractionResult {
  clipId: string;
  /** Path to the extracted MP4 relative to project root. */
  extractedFile: string;
  /** The handle (in seconds) added before the clip's logical start. */
  handleBefore: number;
  /** The handle (in seconds) added after the clip's logical end. */
  handleAfter: number;
  /** Total duration of the extracted file in seconds. */
  extractedDuration: number;
}

/**
 * Extract a single clip from the source video using ffmpeg.
 *
 * The extracted file includes `handleSeconds` of extra footage on each side
 * (clamped to the source boundaries). The file starts with a keyframe for
 * instant, smooth playback.
 */
export async function extractClip(
  clip: VirtualClipDef,
  sourceVideoPath: string,
  sourceAudioPath: string | undefined,
  outputDir: string,
  sourceDurationSeconds: number,
  handleSeconds: number = DEFAULT_HANDLE_SECONDS,
): Promise<ExtractionResult> {
  await mkdir(outputDir, { recursive: true });

  const fps = clip.remotion.fps;
  const clipStartSeconds = clip.remotion.fromFrame / fps;
  const clipDurationSeconds = clip.remotion.durationInFrames / fps;
  const clipEndSeconds = clipStartSeconds + clipDurationSeconds;

  // Compute handles clamped to source boundaries
  const handleBefore = Math.min(handleSeconds, clipStartSeconds);
  const handleAfter = Math.min(handleSeconds, Math.max(0, sourceDurationSeconds - clipEndSeconds));

  const extractStart = clipStartSeconds - handleBefore;
  const extractDuration = handleBefore + clipDurationSeconds + handleAfter;

  const outputPath = join(outputDir, `${clip.clipId}.mp4`);

  await runFfmpeg(sourceVideoPath, sourceAudioPath, extractStart, extractDuration, outputPath);

  return {
    clipId: clip.clipId,
    extractedFile: outputPath,
    handleBefore,
    handleAfter,
    extractedDuration: extractDuration,
  };
}

/**
 * Extract all clips for a source. Yields results as each clip completes.
 */
export async function* extractAllClips(
  clips: VirtualClipDef[],
  sourceVideoPath: string,
  sourceAudioPath: string | undefined,
  outputDir: string,
  sourceDurationSeconds: number,
  handleSeconds: number = DEFAULT_HANDLE_SECONDS,
): AsyncGenerator<ExtractionResult> {
  for (const clip of clips) {
    const result = await extractClip(
      clip,
      sourceVideoPath,
      sourceAudioPath,
      outputDir,
      sourceDurationSeconds,
      handleSeconds,
    );
    yield result;
  }
}

/**
 * Run ffmpeg to extract a segment with re-encoding for keyframe-accurate start.
 * Uses -ss before -i for fast seeking, then re-encodes a short segment.
 */
async function runFfmpeg(
  videoPath: string,
  audioPath: string | undefined,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
): Promise<void> {
  const args: string[] = [
    '-y',
    '-ss', startSeconds.toFixed(4),
    '-i', videoPath,
  ];

  // If separate audio, add it as a second input
  if (audioPath) {
    args.push('-ss', startSeconds.toFixed(4), '-i', audioPath);
  }

  args.push(
    '-t', durationSeconds.toFixed(4),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    // Force keyframe at the very start
    '-force_key_frames', '0',
    '-movflags', '+faststart',
  );

  if (audioPath) {
    // Map video from first input, audio from second input
    args.push('-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k');
  } else {
    // Use audio from the video file
    args.push('-c:a', 'aac', '-b:a', '192k');
  }

  args.push(outputPath);

  let stderr: string;
  let code: number | null;
  try {
    ({ stderr, code } = await runProcess('ffmpeg', args, {
      timeoutMs: FFMPEG_TIMEOUT_MS,
      timeoutMessage: `ffmpeg timed out extracting clip to ${outputPath}`,
    }));
  } catch (err) {
    const message = (err as Error).message;
    // The timeout rejection already carries the exact desired message; re-throw as-is.
    // Only spawn errors get the caller-specific "failed to start" prefix.
    if (message.startsWith('ffmpeg timed out')) {
      throw err;
    }
    throw new Error(`ffmpeg failed to start: ${message}`);
  }

  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`);
  }
}
