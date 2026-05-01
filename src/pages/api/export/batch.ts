// POST /api/export/batch — Export all non-discarded clips.
// Requirements: 2.1, 2.4

import type { APIRoute } from 'astro';
import { join } from 'node:path';
import { exportBatch } from '../../../services/export-service.js';
import { getAppState, jsonResponse, errorResponse } from '../../../services/app-state.js';

export const POST: APIRoute = async () => {
  const state = getAppState();
  const allClips = Array.from(state.clips.values());

  if (allClips.length === 0) {
    return errorResponse('No clips available for export', 400);
  }

  const outputDir = join(state.projectDir, 'exports');

  // Collect clip/annotation pairs for batch export
  const pairs: Array<{ clip: typeof allClips[0]; annotation: NonNullable<ReturnType<typeof state.annotationService.getAnnotation>> }> = [];
  for (const clip of allClips) {
    const annotation = state.annotationService.getAnnotation(clip.clipId);
    if (annotation) {
      pairs.push({ clip, annotation });
    }
  }

  if (pairs.length === 0) {
    return errorResponse('No clips with annotations available for export', 400);
  }

  try {
    const results: Array<{ clipId: string; outputPath: string; sidecarPath: string }> = [];
    const gen = exportBatch(pairs, outputDir);

    for await (const result of gen) {
      results.push(result);
    }

    return jsonResponse({ exported: results, count: results.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Batch export failed: ${message}`, 500);
  }
};
