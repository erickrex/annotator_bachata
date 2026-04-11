// POST /api/export/:id — Export single clip to MP4.
// Requirements: 12.1

import type { APIRoute } from 'astro';
import { join } from 'node:path';
import { exportClip } from '../../../services/export-service.js';
import { getAppState, jsonResponse, errorResponse } from '../../../services/app-state.js';

export const POST: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) {
    return errorResponse('Missing clip id parameter');
  }

  const state = getAppState();
  const clip = state.clips.get(id);
  if (!clip) {
    return errorResponse(`Clip not found: ${id}`, 404);
  }

  const source = state.annotationService.getSource(clip.sourceId);
  if (!source) {
    return errorResponse(`Source not found: ${clip.sourceId}`, 404);
  }

  const sourceVideoPath = join(state.projectDir, source.video_file);
  const outputDir = join(state.projectDir, 'exports');

  try {
    const outputPath = await exportClip(clip, sourceVideoPath, outputDir);
    return jsonResponse({ clipId: id, outputPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Export failed: ${message}`, 500);
  }
};
