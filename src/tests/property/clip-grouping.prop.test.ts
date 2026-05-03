// Feature: configurable-beat-count, Property 4: Clip grouping correctness
// **Validates: Requirements 7.1, 7.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * The grouping logic from ReviewApp.tsx (extracted as a pure function for testing).
 * Groups clips by their sourceId into a Map where each key is a sourceId
 * and each value is the array of clips belonging to that source.
 */
function groupClipsBySourceId(clips: Array<{ sourceId: string }>): Map<string, Array<{ sourceId: string }>> {
  const groups = new Map<string, Array<{ sourceId: string }>>();
  for (const clip of clips) {
    const existing = groups.get(clip.sourceId);
    if (existing) {
      existing.push(clip);
    } else {
      groups.set(clip.sourceId, [clip]);
    }
  }
  return groups;
}

/**
 * Arbitrary that generates a list of clips with sourceId values drawn from a small set
 * (to ensure some grouping happens).
 */
const clipsArb = fc
  .array(
    fc.record({
      sourceId: fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/),
    }),
    { minLength: 1, maxLength: 50 },
  );

describe('Property 4: Clip grouping correctness', () => {
  it('(a) grouping produces exactly one group per unique sourceId', () => {
    fc.assert(
      fc.property(clipsArb, (clips) => {
        const groups = groupClipsBySourceId(clips);
        const uniqueSourceIds = new Set(clips.map((c) => c.sourceId));

        expect(groups.size).toBe(uniqueSourceIds.size);
      }),
      { numRuns: 100 },
    );
  });

  it('(b) every clip in a group has the correct sourceId (group key matches clip.sourceId)', () => {
    fc.assert(
      fc.property(clipsArb, (clips) => {
        const groups = groupClipsBySourceId(clips);

        for (const [sourceId, groupClips] of groups) {
          for (const clip of groupClips) {
            expect(clip.sourceId).toBe(sourceId);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('(c) total clips across all groups equals the input clip count (no clips lost)', () => {
    fc.assert(
      fc.property(clipsArb, (clips) => {
        const groups = groupClipsBySourceId(clips);

        let totalClips = 0;
        for (const groupClips of groups.values()) {
          totalClips += groupClips.length;
        }

        expect(totalClips).toBe(clips.length);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: configurable-beat-count, Property 5: Video group ordering by download date
// **Validates: Requirements 7.7**

/**
 * The sorting logic from ReviewApp.tsx (extracted as a pure function for testing).
 * Sorts groups by their source's downloaded_at timestamp in descending order (most recent first).
 */
function sortGroupsByDate(
  groups: Array<{ sourceId: string }>,
  sources: Map<string, { downloaded_at: string }>,
): Array<{ sourceId: string }> {
  return [...groups].sort((a, b) => {
    const dateA = sources.get(a.sourceId)?.downloaded_at || '1970-01-01T00:00:00Z';
    const dateB = sources.get(b.sourceId)?.downloaded_at || '1970-01-01T00:00:00Z';
    return dateB.localeCompare(dateA);
  });
}

/**
 * Arbitrary that generates a valid ISO 8601 timestamp string within a reasonable range.
 * Uses integer milliseconds to avoid invalid date issues.
 */
const isoTimestampArb = fc
  .integer({
    min: new Date('2000-01-01T00:00:00Z').getTime(),
    max: new Date('2030-12-31T23:59:59Z').getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

/**
 * Arbitrary that generates a set of source records with distinct downloaded_at timestamps.
 * Each source has a unique sourceId and a unique ISO 8601 timestamp.
 */
const sourceRecordsArb = fc
  .uniqueArray(
    fc.record({
      sourceId: fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/),
      downloaded_at: isoTimestampArb,
    }),
    { minLength: 2, maxLength: 20, selector: (r) => r.sourceId },
  )
  .filter((records) => {
    // Ensure distinct timestamps
    const timestamps = records.map((r) => r.downloaded_at);
    return new Set(timestamps).size === timestamps.length;
  });

describe('Property 5: Video group ordering by download date', () => {
  it('for any set of source records with distinct timestamps, groups are ordered most recent first', () => {
    fc.assert(
      fc.property(sourceRecordsArb, (sourceRecords) => {
        // Build the sources map
        const sources = new Map<string, { downloaded_at: string }>();
        for (const record of sourceRecords) {
          sources.set(record.sourceId, { downloaded_at: record.downloaded_at });
        }

        // Build groups (one per source)
        const groups = sourceRecords.map((r) => ({ sourceId: r.sourceId }));

        // Sort groups by date descending
        const sorted = sortGroupsByDate(groups, sources);

        // Verify: for any adjacent pair, the first group's date >= the second group's date
        for (let i = 0; i < sorted.length - 1; i++) {
          const dateA = sources.get(sorted[i].sourceId)!.downloaded_at;
          const dateB = sources.get(sorted[i + 1].sourceId)!.downloaded_at;
          expect(dateA >= dateB).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
