// PUT /api/clips/:id/boundary — Adjust clip boundary.
// Requirements: 5.9

import type { APIRoute } from 'astro';
import { adjustBoundary } from '../../../../services/clip-manager.js';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../../services/app-state.js';

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return errorResponse('Missing clip id parameter');
  }

  let body: { newFromFrame?: number | null; newEndFrame?: number | null };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const newFromFrame = body.newFromFrame ?? null;
  const newEndFrame = body.newEndFrame ?? null;

  if (newFromFrame === null && newEndFrame === null) {
    return errorResponse('At least one of newFromFrame or newEndFrame must be provided');
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

  const adjusted = adjustBoundary(clip, newFromFrame, newEndFrame, source.beat_grid_frames);

  // Replace clip
  state.clips.delete(id);
  state.clips.set(adjusted.clipId, adjusted);

  autoSave();

  return jsonResponse({ clip: adjusted });
};
