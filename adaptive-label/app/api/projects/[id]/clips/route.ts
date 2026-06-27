import {
  getProjectById,
  listClipsForProject,
  listTasksForProject,
} from "@/lib/db";

/**
 * GET /api/projects/:id/clips (design.md → API surface; Requirement 3).
 *
 * Returns a project's seeded clips in clip-index order, each paired with the
 * id of its queued labeling task (when one exists) and its seeded timeline
 * metadata (`metadata_json` — a beat grid for bachata or gloss segments for
 * sign language). Read-only over the typed query layer; no embedding is read
 * out and no media/AI work happens here (Requirement 8.4). The stored vector is
 * intentionally not exposed.
 *
 * Outcomes:
 * - success: 200 `{ projectId, clips: [...] }`.
 * - unknown project: 404.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;

  const project = await getProjectById(projectId);
  if (!project) {
    return Response.json(
      { error: `Project ${projectId} not found.` },
      { status: 404 },
    );
  }

  const [clips, tasks] = await Promise.all([
    listClipsForProject(projectId),
    listTasksForProject(projectId),
  ]);

  // Map each clip to its (first) labeling task id, if any.
  const taskByClip = new Map<string, string>();
  for (const task of tasks) {
    if (!taskByClip.has(task.clip_id)) {
      taskByClip.set(task.clip_id, task.id);
    }
  }

  return Response.json({
    projectId,
    clips: clips.map((clip) => ({
      id: clip.id,
      taskId: taskByClip.get(clip.id) ?? null,
      clipIndex: clip.clip_index,
      title: clip.title,
      domain: clip.domain,
      startSeconds: clip.start_seconds === null ? null : Number(clip.start_seconds),
      endSeconds: clip.end_seconds === null ? null : Number(clip.end_seconds),
      metadata: clip.metadata_json,
    })),
  });
}
