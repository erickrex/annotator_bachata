// Export Service — wraps Remotion renderMedia() for clip export.
// Uses dynamic import for @remotion/renderer to avoid issues if not fully configured.

import type { VirtualClipDef } from '../types/index.js';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

/**
 * Export a single virtual clip to an MP4 file using Remotion's renderMedia().
 * Returns the output file path on success.
 */
export async function exportClip(
  clip: VirtualClipDef,
  sourceVideoPath: string,
  outputDir: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, `${clip.clipId}.mp4`);

  // Dynamic import to avoid hard dependency at module load time
  const { renderMedia, bundle } = await import('@remotion/renderer');

  // Bundle the Remotion project (assumes a Root.tsx entry point exists)
  const bundleLocation = await bundle({
    entryPoint: join(process.cwd(), 'src', 'remotion', 'index.ts'),
    onProgress: () => {},
  });

  await renderMedia({
    composition: {
      id: 'VirtualClip',
      width: 1920,
      height: 1080,
      fps: clip.remotion.fps,
      durationInFrames: clip.remotion.durationInFrames,
      defaultProps: {
        src: sourceVideoPath,
        startFrame: clip.remotion.fromFrame,
        durationInFrames: clip.remotion.durationInFrames,
        beatMarkers: clip.beatMarkerFrames,
        energyProfile: [],
      },
      defaultCodec: 'h264',
      props: {},
    },
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    frameRange: [clip.remotion.fromFrame, clip.remotion.fromFrame + clip.remotion.durationInFrames - 1],
  });

  return outputPath;
}

/**
 * Export all non-discarded clips as MP4 files.
 * Accepts a `resolveSourceVideoPath` callback so each clip can resolve
 * to its own source video path (multi-source support).
 * Yields each completed export result and calls onProgress for each clip.
 */
export async function* exportBatch(
  clips: VirtualClipDef[],
  resolveSourceVideoPath: (clip: VirtualClipDef) => string,
  outputDir: string,
  onProgress: (clipId: string, percent: number) => void,
): AsyncGenerator<{ clipId: string; outputPath: string }> {
  const eligible = clips.filter((c) => c.status !== 'discarded');

  for (let i = 0; i < eligible.length; i++) {
    const clip = eligible[i];
    onProgress(clip.clipId, 0);

    const sourceVideoPath = resolveSourceVideoPath(clip);
    const outputPath = await exportClip(clip, sourceVideoPath, outputDir);

    onProgress(clip.clipId, 100);
    yield { clipId: clip.clipId, outputPath };
  }
}
