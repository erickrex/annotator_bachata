// PUT /api/clips/:id/status — Update clip status.
// Requirements: 5.6

import type { APIRoute } from 'astro';
import { CLIP_STATUS_VALUES } from '../../../../types/enums.js';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../../services/app-state.js';

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return errorResponse('Missing clip id parameter');
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { status } = body;
  if (!status || !CLIP_STATUS_VALUES.includes(status as any)) {
    return errorResponse(`Invalid status. Must be one of: ${CLIP_STATUS_VALUES.join(', ')}`);
  }

  const state = getAppState();
  const clip = state.clips.get(id);
  if (!clip) {
    return errorResponse(`Clip not found: ${id}`, 404);
  }

  // Update clip status
  clip.status = status as typeof clip.status;
  state.clips.set(id, clip);

  // Also update annotation status if annotation exists
  const annotation = state.annotationService.getAnnotation(id);
  if (annotation) {
    state.annotationService.updateAnnotation(id, { status: status as any });
  }

  autoSave();

  return jsonResponse({ clipId: id, status: clip.status });
};
