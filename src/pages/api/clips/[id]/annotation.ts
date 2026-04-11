// PUT /api/clips/:id/annotation — Update annotation fields, trigger validation + auto-save.
// Requirements: 13.1, 13.5, 14.16

import type { APIRoute } from 'astro';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../../services/app-state.js';
import type { ClipAnnotation } from '../../../../types/index.js';

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return errorResponse('Missing clip id parameter');
  }

  let fields: Partial<ClipAnnotation>;
  try {
    fields = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const state = getAppState();
  const clip = state.clips.get(id);
  if (!clip) {
    return errorResponse(`Clip not found: ${id}`, 404);
  }

  const validationResult = state.annotationService.updateAnnotation(id, fields);
  const annotation = state.annotationService.getAnnotation(id);
  const completeness = annotation
    ? state.annotationService.calculateCompleteness(annotation)
    : 0;

  autoSave();

  return jsonResponse({
    success: validationResult.valid,
    validationResult,
    completeness,
    annotation,
  });
};
