// POST /api/export/batch — Export all non-discarded clips.
// Requirements: 12.2, 15.3, 15.4

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

  // Resolve source video path per clip to support multi-source projects
  const resolveSourceVideoPath = (clip: { sourceId: string }) => {
    const source = state.annotationService.getSource(clip.sourceId);
    if (!source) {
      throw new Error(`Source not found for clip: ${clip.sourceId}`);
    }
    return join(state.projectDir, source.video_file);
  };

  try {
    const results: Array<{ clipId: string; outputPath: string }> = [];
    const gen = exportBatch(allClips, resolveSourceVideoPath, outputDir, () => {});

    for await (const result of gen) {
      results.push(result);
    }

    return jsonResponse({ exported: results, count: results.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Batch export failed: ${message}`, 500);
  }
};
