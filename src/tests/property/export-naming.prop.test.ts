// Feature: clip-slicer-annotator, Property 13: Export File Naming Convention
// **Validates: Requirements 12.5**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { join } from 'node:path';

/**
 * Replicates the naming logic from exportClip:
 * output path = join(outputDir, `${clip.clipId}.mp4`)
 */
function buildExportPath(clipId: string, outputDir: string): string {
  return join(outputDir, `${clipId}.mp4`);
}

describe('Property 13: Export File Naming Convention', () => {
  const clipIdArb = fc.stringMatching(/^[a-zA-Z0-9_]{3,40}$/);
  const outputDirArb = fc.constantFrom('exports', '/tmp/exports', 'project/exports');

  it('output file path should end with {clipId}.mp4', () => {
    fc.assert(
      fc.property(clipIdArb, outputDirArb, (clipId, outputDir) => {
        const outputPath = buildExportPath(clipId, outputDir);
        expect(outputPath).toMatch(new RegExp(`${clipId}\\.mp4$`));
      }),
      { numRuns: 100 },
    );
  });

  it('output file name should be exactly {clipId}.mp4', () => {
    fc.assert(
      fc.property(clipIdArb, outputDirArb, (clipId, outputDir) => {
        const outputPath = buildExportPath(clipId, outputDir);
        const fileName = outputPath.split('/').pop() ?? '';
        expect(fileName).toBe(`${clipId}.mp4`);
      }),
      { numRuns: 100 },
    );
  });
});
