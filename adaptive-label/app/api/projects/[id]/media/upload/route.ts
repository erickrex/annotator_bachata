import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { createMediaAsset, getProjectById } from "@/lib/db";
import { createProcessingJob, startMediaProcessing } from "@/lib/media/process";
import { mediaAssetDir } from "@/lib/media/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);

function safeFilename(name: string): string {
  const base = basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
  return base.length > 0 ? base : "source.mp4";
}

export async function POST(
  request: Request,
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

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: "A non-empty multipart field named 'file' is required." },
      { status: 400 },
    );
  }

  const filename = safeFilename(file.name);
  const extension = extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return Response.json(
      { error: "Upload must be an mp4, mov, m4v, webm, or mkv video file." },
      { status: 400 },
    );
  }

  const media = await createMediaAsset({
    projectId,
    filename,
    storageKey: `runtime-upload/${projectId}/${filename}`,
    status: "uploaded",
    sourceType: "upload",
    metadata: {
      originalFilename: filename,
      contentType: file.type || null,
      sizeBytes: file.size,
    },
  });

  const dir = mediaAssetDir(projectId, media.id);
  await mkdir(dir, { recursive: true });
  const localVideoPath = join(dir, `source${extension}`);
  await writeFile(localVideoPath, Buffer.from(await file.arrayBuffer()));

  const updated = await import("@/lib/db").then((db) =>
    db.updateMediaAsset(media.id, { localVideoPath }),
  );
  const job = await createProcessingJob(updated ?? media);
  startMediaProcessing({ mediaAssetId: media.id, jobId: job.id });

  return Response.json(
    { mediaAsset: updated ?? media, job },
    { status: 202 },
  );
}
