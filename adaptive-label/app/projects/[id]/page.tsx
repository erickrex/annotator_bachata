import { notFound } from "next/navigation";
import Link from "next/link";

import {
  getActiveSchema,
  getProjectById,
  listClipsForProject,
  listFieldsForSchema,
  listMediaAssetsForProject,
  listTasksForProject,
  workspaceSchemaFromRows,
} from "@/lib/db";
import type { TimelineMetadata } from "@/components/render/timeline/types";
import { mediaUrlForLocalPath } from "@/lib/media/paths";
import {
  ProjectWorkspace,
  type WorkspaceClip,
  type WorkspaceMediaAsset,
} from "./ProjectWorkspace";

/**
 * `/projects/[id]` — the labeling workspace shell (Task 13 / Requirements
 * 3.1–3.3).
 *
 * A Server Component that reads the project, its active schema (reconstructed
 * into the `WorkspaceSchema` shape the renderer consumes), and its clips +
 * labeling tasks from Aurora through the typed query layer, then hands the
 * serializable data to the client `ProjectWorkspace`. All reads are stored
 * data only — no media, AI, or embedding work happens here (Requirement 8.4).
 *
 * The same composition serves every domain: the bachata project renders the
 * beat grid and the sign-language project renders the gloss timeline purely
 * from the stored `timelineMode` and seeded per-clip metadata (Requirement
 * 3.3).
 */
export const dynamic = "force-dynamic";

/** Build a clip's public video URL from configured storage, if available. */
function resolveStorageVideoSrc(storageKey: string | null): string | null {
  const base = process.env.STORAGE_PUBLIC_BASE_URL;
  if (!base || !storageKey) return null;
  return `${base.replace(/\/+$/, "")}/${storageKey.replace(/^\/+/, "")}`;
}

function resolveVideoSrc(media: {
  local_video_path: string | null;
  storage_key: string | null;
} | undefined): string | null {
  return (
    mediaUrlForLocalPath(media?.local_video_path) ??
    resolveStorageVideoSrc(media?.storage_key ?? null)
  );
}

function beatMarkerFrames(metadata: Record<string, unknown>): number[] {
  const clip = metadata.clip;
  if (!clip || typeof clip !== "object") return [];
  const frames = (clip as { beatMarkerFrames?: unknown }).beatMarkerFrames;
  return Array.isArray(frames)
    ? frames.filter((frame): frame is number => typeof frame === "number")
    : [];
}

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await getProjectById(id);
  if (!project) {
    notFound();
  }

  const schemaRow = await getActiveSchema(id);
  if (!schemaRow) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="rounded-md border border-input p-6 text-sm text-muted-foreground">
          This project has no active schema yet. Generate and activate one from
          the{" "}
          <Link className="text-primary underline" href="/wizard">
            wizard
          </Link>
          .
        </p>
      </main>
    );
  }

  const [fields, clipRows, tasks, mediaAssets] = await Promise.all([
    listFieldsForSchema(schemaRow.id),
    listClipsForProject(id),
    listTasksForProject(id),
    listMediaAssetsForProject(id),
  ]);

  const schema = workspaceSchemaFromRows(schemaRow, fields);

  // Index tasks by clip and media assets by id for the per-clip projection.
  const taskByClip = new Map<string, string>();
  for (const task of tasks) {
    if (!taskByClip.has(task.clip_id)) taskByClip.set(task.clip_id, task.id);
  }
  const mediaById = new Map(mediaAssets.map((m) => [m.id, m]));

  const clips: WorkspaceClip[] = clipRows.map((clip) => {
    const media = clip.media_asset_id
      ? mediaById.get(clip.media_asset_id)
      : undefined;
    const fps = media?.fps != null ? Number(media.fps) : null;
    return {
      id: clip.id,
      taskId: taskByClip.get(clip.id) ?? null,
      clipIndex: clip.clip_index,
      title: clip.title,
      domain: clip.domain,
      startSeconds:
        clip.start_seconds === null ? null : Number(clip.start_seconds),
      endSeconds: clip.end_seconds === null ? null : Number(clip.end_seconds),
      startFrame: clip.start_frame,
      endFrame: clip.end_frame,
      videoSrc: resolveVideoSrc(media),
      fps: fps !== null && Number.isFinite(fps) ? fps : null,
      width: media?.width ?? null,
      height: media?.height ?? null,
      beatMarkerFrames: beatMarkerFrames(clip.metadata_json),
      // Stored timeline metadata is a beat grid or gloss segments; the renderer
      // guards the discriminant before mounting a module. An object without a
      // `timelineMode` discriminant is treated as absent.
      metadata:
        clip.metadata_json && "timelineMode" in clip.metadata_json
          ? (clip.metadata_json as unknown as TimelineMetadata)
          : null,
    };
  });

  const workspaceMediaAssets: WorkspaceMediaAsset[] = mediaAssets.map((asset) => ({
    id: asset.id,
    filename: asset.filename,
    status: asset.status,
    sourceType: asset.source_type,
    errorMessage: asset.error_message,
  }));

  return (
    <ProjectWorkspace
      project={{ id: project.id, name: project.name, domain: project.domain }}
      schema={schema}
      clips={clips}
      mediaAssets={workspaceMediaAssets}
    />
  );
}
