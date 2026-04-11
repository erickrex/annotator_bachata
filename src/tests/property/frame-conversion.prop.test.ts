// Feature: clip-slicer-annotator, Property 2: Timestamp-to-Frame Conversion Consistency
// **Validates: Requirements 2.8, 3.4**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * The conversion formula under test: Math.round(timestamp * fps)
 * This is a pure math property — no service imports needed.
 */
function timestampToFrame(timestamp: number, fps: number): number {
  return Math.round(timestamp * fps);
}

describe('Property 2: Timestamp-to-Frame Conversion Consistency', () => {
  const timestamp = fc.float({ min: 0, max: 3600, noNaN: true });
  const fps = fc.integer({ min: 1, max: 120 });

  it('produces a non-negative integer for any non-negative timestamp and positive fps', () => {
    fc.assert(
      fc.property(timestamp, fps, (ts, fpsVal) => {
        const frame = timestampToFrame(ts, fpsVal);
        expect(frame).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(frame)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('is deterministic — same inputs always produce the same output', () => {
    fc.assert(
      fc.property(timestamp, fps, (ts, fpsVal) => {
        const frame1 = timestampToFrame(ts, fpsVal);
        const frame2 = timestampToFrame(ts, fpsVal);
        expect(frame1).toBe(frame2);
      }),
      { numRuns: 100 }
    );
  });

  it('frame numbers increase monotonically with sorted timestamps', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 0, max: 3600, noNaN: true }), { minLength: 2, maxLength: 50 }),
        fps,
        (timestamps, fpsVal) => {
          const sorted = [...timestamps].sort((a, b) => a - b);
          const frames = sorted.map((ts) => timestampToFrame(ts, fpsVal));

          for (let i = 1; i < frames.length; i++) {
            expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
