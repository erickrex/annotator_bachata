import type { VirtualClipDef } from '@/lib/domain/types';

/**
 * Recompute beat marker frames for a clip based on its current trim points.
 * Returns frame numbers relative to the trimmed region start (inPoint = frame 0).
 *
 * Algorithm:
 * 1. Compute absolute frame range from inPoint/outPoint × fps + fromFrame offset
 * 2. Filter sourceBeatGridFrames to those within the absolute range
 * 3. Subtract (inPointFrame + fromFrame) to make markers relative to trimmed start
 * 4. Return empty array if no beats fall within range
 */
export function recomputeBeatMarkers(
  clip: VirtualClipDef,
  sourceBeatGridFrames: number[],
): number[] {
  if (sourceBeatGridFrames.length === 0) {
    return [];
  }

  const { fromFrame, durationInFrames, fps } = clip.remotion;

  // Determine inPoint and outPoint in seconds relative to clip start.
  // When not set, default to full clip range.
  const inPointSeconds = clip.inPoint ?? 0;
  const outPointSeconds = clip.outPoint ?? durationInFrames / fps;

  // Convert trim points to frame offsets relative to clip start
  const inPointFrame = Math.round(inPointSeconds * fps);
  const outPointFrame = Math.round(outPointSeconds * fps);

  // Compute source-absolute frame range by adding fromFrame offset
  const absoluteStart = fromFrame + inPointFrame;
  const absoluteEnd = fromFrame + outPointFrame;

  // Filter source beat grid frames to those within the absolute range
  // Using inclusive start, exclusive end (beat at exactly outPoint frame is excluded)
  const beatsInRange = sourceBeatGridFrames.filter(
    (frame) => frame >= absoluteStart && frame < absoluteEnd,
  );

  if (beatsInRange.length === 0) {
    return [];
  }

  // Make markers relative to trimmed start: subtract (inPointFrame + fromFrame)
  const offset = absoluteStart;
  return beatsInRange.map((frame) => frame - offset);
}
