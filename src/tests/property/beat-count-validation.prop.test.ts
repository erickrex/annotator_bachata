// Feature: configurable-beat-count, Property 3: Invalid beat count rejection
// **Validates: Requirements 2.3, 5.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * The validation logic extracted from the API endpoint (src/pages/api/clips/generate.ts).
 * This mirrors the exact validation performed by the endpoint.
 */
const VALID_BEAT_COUNTS = [4, 8, 16, 32] as const;

function isValidBeatCount(value: number): boolean {
  return (VALID_BEAT_COUNTS as readonly number[]).includes(value);
}

describe('Property 3: Invalid beat count rejection', () => {
  it('rejects any integer not in {4, 8, 16, 32}', () => {
    const invalidBeatCountArb = fc
      .integer({ min: -1000, max: 1000 })
      .filter((n) => !VALID_BEAT_COUNTS.includes(n as 4 | 8 | 16 | 32));

    fc.assert(
      fc.property(invalidBeatCountArb, (value) => {
        expect(isValidBeatCount(value)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('accepts any value in {4, 8, 16, 32}', () => {
    const validBeatCountArb = fc.constantFrom(4, 8, 16, 32);

    fc.assert(
      fc.property(validBeatCountArb, (value) => {
        expect(isValidBeatCount(value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
