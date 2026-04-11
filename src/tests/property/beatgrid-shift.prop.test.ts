// Feature: clip-slicer-annotator, Property 4: Beat Grid Shift Round-Trip
// **Validates: Requirements 3.6**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shiftBeatGrid } from '../../services/cycle-builder.js';

describe('Property 4: Beat Grid Shift Round-Trip', () => {
  const TOLERANCE = 0.001; // seconds

  // Generators
  const beatGridArb = fc
    .array(fc.float({ min: 0, max: 300, noNaN: true }), { minLength: 1, maxLength: 200 })
    .map((arr) => arr.sort((a, b) => a - b));

  const offsetArb = fc.float({ min: -5000, max: 5000, noNaN: true });
  const fpsArb = fc.integer({ min: 24, max: 60 });

  it('shifting by +offset then -offset produces a grid equivalent to the original', () => {
    fc.assert(
      fc.property(beatGridArb, offsetArb, fpsArb, (grid, offset, fps) => {
        // Shift forward by +offset
        const shifted = shiftBeatGrid(grid, offset, fps);

        // Shift back by -offset
        const restored = shiftBeatGrid(shifted.timestamps, -offset, fps);

        // Each restored timestamp should be within tolerance of the original
        expect(restored.timestamps).toHaveLength(grid.length);
        for (let i = 0; i < grid.length; i++) {
          expect(Math.abs(restored.timestamps[i] - grid[i])).toBeLessThanOrEqual(TOLERANCE);
        }
      }),
      { numRuns: 100 },
    );
  });
});
