// POST /api/project/export — Export full project JSON.
// Requirements: 13.2, 17.1, 18.1

import type { APIRoute } from 'astro';
import { getFullProjectState, jsonResponse } from '../../../services/app-state.js';

export const POST: APIRoute = async () => {
  const projectFile = getFullProjectState();
  return jsonResponse(projectFile);
};
