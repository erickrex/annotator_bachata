import type { APIRoute } from 'astro';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getAppState, resetAppState, jsonResponse, errorResponse } from '../../../services/app-state.js';

export const POST: APIRoute = async () => {
  try {
    const state = getAppState();
    const projectDir = state.projectDir;
    const sourcesDir = join(projectDir, 'sources');

    // Remove all files in sources/ (includes clips subdirectory)
    await rm(sourcesDir, { recursive: true, force: true });
    await writeFile(join(projectDir, 'sources', '.gitkeep'), '', { recursive: true } as any).catch(() => {});
    // Recreate empty sources dir
    const { mkdir } = await import('node:fs/promises');
    await mkdir(sourcesDir, { recursive: true });

    // Reset project.json
    const emptyProject = {
      schema_version: '2.0',
      project: {
        name: 'Bachata Clip Library',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      sources: [],
      enum_definitions: {},
      clips: [],
      virtual_clips: [],
      cycle_hierarchies: [],
      analysis_results: [],
    };
    await writeFile(join(projectDir, 'project.json'), JSON.stringify(emptyProject, null, 2));

    // Reset manifest.json
    const emptyManifest = {
      project_name: 'Bachata Clip Library',
      created_at: emptyProject.project.created_at,
      updated_at: emptyProject.project.updated_at,
      sources_count: 0,
      clips_total: 0,
      clips_by_status: { pending: 0, discarded: 0, reviewed: 0, in_progress: 0, annotated: 0 },
      annotation_completeness: 0,
      sources: [],
    };
    await writeFile(join(projectDir, 'manifest.json'), JSON.stringify(emptyManifest, null, 2));

    // Reset in-memory state
    resetAppState();

    return jsonResponse({ success: true, message: 'All videos and clips deleted' });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to reset project', 500);
  }
};
