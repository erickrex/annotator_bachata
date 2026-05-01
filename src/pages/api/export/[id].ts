// POST /api/export/:id — Export single clip to MP4.
// Requirements: 2.1, 2.4

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

  const annotation = state.annotationService.getAnnotation(id);
  if (!annotation) {
    return errorResponse(`Annotation not found for clip: ${id}`, 404);
  }

  const outputDir = join(state.projectDir, 'exports');

  try {
    const result = await exportClip({ clip, annotation, outputDir });
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Export failed: ${message}`, 500);
  }
};
