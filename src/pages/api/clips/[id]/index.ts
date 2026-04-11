// GET /api/clips/:id — Get clip definition + annotation.
// Requirements: 5.3

import type { APIRoute } from 'astro';
import { getAppState, jsonResponse, errorResponse } from '../../../../services/app-state.js';

export const GET: APIRoute = async ({ params }) => {
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
  const completeness = annotation
    ? state.annotationService.calculateCompleteness(annotation)
    : 0;

  return jsonResponse({ clip, annotation, completeness });
};
