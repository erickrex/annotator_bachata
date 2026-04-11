// POST /api/project/import — Import project JSON with source file verification.
// Requirements: 13.3, 13.4

import type { APIRoute } from 'astro';
import { getAppState, autoSave, jsonResponse, errorResponse } from '../../../services/app-state.js';
import type { AnnotationProjectFile } from '../../../types/index.js';

export const POST: APIRoute = async ({ request }) => {
  let projectJson: AnnotationProjectFile;
  try {
    projectJson = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!projectJson.schema_version || !projectJson.clips || !projectJson.sources) {
    return errorResponse('Invalid project file format. Expected schema_version, sources, and clips.');
  }

  const state = getAppState();
  const result = state.annotationService.importProject(projectJson, state.projectDir);

  if (!result.success) {
    return jsonResponse(
      {
        success: false,
        error: 'Missing source files',
        missingFiles: result.missingFiles,
      },
      400,
    );
  }

  autoSave();

  return jsonResponse({
    success: true,
    clipsLoaded: result.clipsLoaded,
    sourcesLoaded: projectJson.sources.length,
  });
};
