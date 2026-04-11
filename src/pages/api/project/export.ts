// POST /api/project/export — Export full project JSON.
// Requirements: 13.2, 17.1, 18.1

import type { APIRoute } from 'astro';
import { getAppState, jsonResponse } from '../../../services/app-state.js';

export const POST: APIRoute = async () => {
  const state = getAppState();
  const projectFile = state.annotationService.exportProject();
  return jsonResponse(projectFile);
};
