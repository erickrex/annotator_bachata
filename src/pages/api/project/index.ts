// GET /api/project — Return project manifest.
// Requirements: 13.7

import type { APIRoute } from 'astro';
import { getManifest, jsonResponse } from '../../../services/app-state.js';

export const GET: APIRoute = async () => {
  const manifest = getManifest();
  return jsonResponse(manifest);
};
