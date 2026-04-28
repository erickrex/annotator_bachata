// Export Service — wraps Remotion renderMedia() for clip export.
// Uses dynamic import for @remotion/renderer to avoid issues if not fully configured.

import type { VirtualClipDef } from '../types/index.js';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getAppState } from './app-state.js';

let bundleLocationPromise: Promise<string> | null = null;

async function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    bundleLocationPromise = (async () => {
      const { bundle } = await import('@remotion/renderer');
      return bundle({
        entryPoint: join(getAppState().projectDir, 'src', 'remotion', 'index.ts'),
        onProgress: () => {},
      });
    })();
  }

  return bundleLocationPromise;
}

/**
 * Export a single virtual clip to an MP4 file using Remotion's renderMedia().
 * Returns the output file path on success.
 */
export async function exportClip(
  clip: VirtualClipDef,
  sourceVideoPath: string,
  outputDir: string,
  energyProfile: number[] = [],
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, `${clip.clipId}.mp4`);

  const state = getAppState();
  const source = state.annotationService.getSource(clip.sourceId);
  const sourceAudioPath =
    source?.audio_file != null && source.audio_file.length > 0
      ? join(state.projectDir, source.audio_file)
      : undefined;

  // Dynamic import to avoid hard dependency at module load time
  const { renderMedia } = await import('@remotion/renderer');
  const bundleLocation = await getBundleLocation();

  await renderMedia({
    composition: {
      id: 'VirtualClip',
      width: 1920,
      height: 1080,
      fps: clip.remotion.fps,
      durationInFrames: clip.remotion.durationInFrames,
      defaultProps: {
        src: sourceVideoPath,
        audioSrc: sourceAudioPath,
        startFrame: clip.remotion.fromFrame,
        durationInFrames: clip.remotion.durationInFrames,
        beatMarkers: clip.beatMarkerFrames,
        energyProfile,
      },
      defaultCodec: 'h264',
      props: {},
    },
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    frameRange: [0, clip.remotion.durationInFrames - 1],
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
  resolveSourceData: (clip: VirtualClipDef) => { sourceVideoPath: string; energyProfile: number[] },
  outputDir: string,
  onProgress: (clipId: string, percent: number) => void,
): AsyncGenerator<{ clipId: string; outputPath: string }> {
  const eligible = clips.filter((c) => c.status !== 'discarded');

  for (let i = 0; i < eligible.length; i++) {
    const clip = eligible[i];
    onProgress(clip.clipId, 0);

    const { sourceVideoPath, energyProfile } = resolveSourceData(clip);
    const outputPath = await exportClip(clip, sourceVideoPath, outputDir, energyProfile);

    onProgress(clip.clipId, 100);
    yield { clipId: clip.clipId, outputPath };
  }
}
