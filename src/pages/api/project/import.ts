// POST /api/project/import — Import project JSON with source file verification.
// Requirements: 13.3, 13.4

import type { APIRoute } from 'astro';
import { autoSave, jsonResponse, errorResponse, restoreProjectState } from '../../../services/app-state.js';
import type { AnnotationProjectFile } from '../../../types/index.js';
import type { ExtendedProjectFile } from '../../../services/project-service.js';

export const POST: APIRoute = async ({ request }) => {
  let projectJson: AnnotationProjectFile | ExtendedProjectFile;
  try {
    projectJson = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!projectJson.schema_version || !projectJson.clips || !projectJson.sources) {
    return errorResponse('Invalid project file format. Expected schema_version, sources, and clips.');
  }

  const result = restoreProjectState(projectJson);

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
