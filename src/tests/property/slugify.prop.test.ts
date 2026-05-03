// Feature: configurable-beat-count, Property 6: Slugification correctness
// **Validates: Requirements 8.1, 8.2, 8.3, 8.5**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { slugify } from '../../services/slug-utils.js';

describe('Property 6: Slugification correctness', () => {
  it('output contains only lowercase alphanumeric characters and underscores', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = slugify(input);
        expect(result).toMatch(/^[a-z0-9_]*$/);
      }),
      { numRuns: 100 }
    );
  });

  it('output contains no consecutive underscores', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = slugify(input);
        expect(result).not.toContain('__');
      }),
      { numRuns: 100 }
    );
  });

  it('output has no leading or trailing underscores (unless result is empty)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = slugify(input);
        if (result.length > 0) {
          expect(result[0]).not.toBe('_');
          expect(result[result.length - 1]).not.toBe('_');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('output has length at most 60 characters', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = slugify(input);
        expect(result.length).toBeLessThanOrEqual(60);
      }),
      { numRuns: 100 }
    );
  });

  it('if input contains at least one alphanumeric character, output is non-empty', () => {
    const stringWithAlphanumeric = fc
      .string()
      .filter((s) => /[a-zA-Z0-9]/.test(s));

    fc.assert(
      fc.property(stringWithAlphanumeric, (input) => {
        const result = slugify(input);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
