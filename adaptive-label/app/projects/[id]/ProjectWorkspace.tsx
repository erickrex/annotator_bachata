"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { WorkspaceSchema } from "@/lib/schemas/workspace";
import type { TimelineMetadata } from "@/components/render/timeline/types";
import { TimelineForMode } from "@/components/render/timeline";
import { AnnotationWorkspace } from "@/components/render/AnnotationWorkspace";
import { ProjectMediaPanel } from "@/components/ProjectMediaPanel";
import { RemotionClipPlayer } from "@/components/RemotionClipPlayer";
import { SimilarClipsPanel } from "@/components/SimilarClipsPanel";
import type {
  FetchSimilarClipsResult,
  SimilarClip,
} from "@/lib/client/similar-clips";
import type { SubmitAnnotationResult } from "@/lib/client/annotations";
import { cn } from "@/lib/utils";

/** A clip as the workspace needs it: queue entry + video + seeded timeline. */
export interface WorkspaceClip {
  id: string;
  /** The queued labeling task for this clip, or null if none exists. */
  taskId: string | null;
  clipIndex: number;
  title: string | null;
  domain: string;
  startSeconds: number | null;
  endSeconds: number | null;
  startFrame?: number | null;
  endFrame?: number | null;
  /** Resolved public video URL, or null when storage isn't configured. */
  videoSrc: string | null;
  /** Frame rate for the timeline modules, when known. */
  fps: number | null;
  width?: number | null;
  height?: number | null;
  beatMarkerFrames?: number[];
  /** Seeded timeline metadata (beat grid or gloss segments). */
  metadata: TimelineMetadata | null;
}

export interface WorkspaceMediaAsset {
  id: string;
  filename: string;
  status: string;
  sourceType: string;
  errorMessage: string | null;
}

export interface ProjectWorkspaceProps {
  project: { id: string; name: string; domain: string };
  /** The active schema, reconstructed from stored rows (same renderer engine). */
  schema: WorkspaceSchema;
  clips: WorkspaceClip[];
  mediaAssets?: WorkspaceMediaAsset[];
  /** Injectable transports (default to the real network helpers) for testing. */
  submit?: (
    taskId: string,
    request: { values: Record<string, unknown>; status?: "draft" | "submitted" },
  ) => Promise<SubmitAnnotationResult>;
  fetchSimilarClips?: (
    clipId: string,
    request: { crossDomain?: boolean; limit?: number },
  ) => Promise<FetchSimilarClipsResult>;
}

/**
 * The labeling workspace (Task 13 / Requirements 3.1–3.3).
 *
 * Composes the queue, the clip video, the deterministic `TimelineForMode`, the
 * adaptive `WorkspaceForm` (via `AnnotationWorkspace`), and the
 * `SimilarClipsPanel` for one project. The SAME components render every domain:
 * only the stored `schema.timelineMode` and the per-clip seeded `metadata`
 * differ, so a bachata project shows the beat grid and a sign-language project
 * shows the gloss timeline without any domain-specific branching here
 * (Requirement 3.3).
 */
export function ProjectWorkspace({
  project,
  schema,
  clips,
  mediaAssets = [],
  submit,
  fetchSimilarClips,
}: ProjectWorkspaceProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(
    clips[0]?.id ?? null,
  );

  const selected = React.useMemo(
    () => clips.find((clip) => clip.id === selectedId) ?? null,
    [clips, selectedId],
  );

  // When a neighbor is chosen: stay in-page if it belongs to this project,
  // otherwise navigate to its project's workspace (cross-domain, Req 5.4).
  const handleSelectSimilar = React.useCallback(
    (clip: SimilarClip) => {
      const local = clips.find((c) => c.id === clip.id);
      if (local) {
        setSelectedId(local.id);
        return;
      }
      router.push(`/projects/${clip.projectId}`);
    },
    [clips, router],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{project.domain}</span> ·{" "}
            {schema.timelineMode} · {clips.length} clip
            {clips.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← All projects
        </Link>
      </header>

      <ProjectMediaPanel
        projectId={project.id}
        timelineMode={schema.timelineMode}
        initialMediaAssets={mediaAssets}
      />

      {clips.length === 0 ? (
        <p
          data-testid="workspace-empty"
          className="rounded-md border border-input p-6 text-sm text-muted-foreground"
        >
          This project has no seeded clips yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_18rem]">
          {/* Queue */}
          <aside
            data-testid="clip-queue"
            aria-label="Clip queue"
            className="flex flex-col gap-1 rounded-lg border border-border p-3"
          >
            <h2 className="px-1 pb-1 text-sm font-semibold">Queue</h2>
            <ul className="flex flex-col gap-1">
              {clips.map((clip) => {
                const isActive = clip.id === selectedId;
                return (
                  <li key={clip.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(clip.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "w-full truncate rounded-md px-2 py-1.5 text-left text-sm",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/60",
                      )}
                    >
                      <span className="mr-2 font-mono text-xs text-muted-foreground">
                        #{clip.clipIndex}
                      </span>
                      {clip.title ?? `Clip ${clip.clipIndex}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Video + timeline + adaptive form */}
          <section className="flex flex-col gap-5">
            <div
              data-testid="clip-video"
              className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-black/90 text-sm text-white/70"
            >
              {selected?.videoSrc ? (
                typeof selected.startFrame === "number" &&
                typeof selected.endFrame === "number" &&
                typeof selected.fps === "number" ? (
                  <RemotionClipPlayer
                    key={selected.id}
                    videoSrc={selected.videoSrc}
                    startFrame={selected.startFrame}
                    endFrame={selected.endFrame}
                    fps={selected.fps}
                    width={selected.width ?? undefined}
                    height={selected.height ?? undefined}
                    beatMarkerFrames={selected.beatMarkerFrames ?? []}
                  />
                ) : (
                  <video
                    key={selected.id}
                    src={selected.videoSrc}
                    controls
                    className="h-full w-full"
                  />
                )
              ) : (
                <span>
                  {selected
                    ? `${selected.title ?? `Clip ${selected.clipIndex}`} (video unavailable)`
                    : "Select a clip"}
                </span>
              )}
            </div>

            {selected?.metadata ? (
              <div className="rounded-lg border border-border p-4">
                <TimelineForMode
                  timelineMode={schema.timelineMode}
                  metadata={selected.metadata}
                  fps={selected.fps ?? undefined}
                />
              </div>
            ) : null}

            <div className="rounded-lg border border-border p-4">
              {selected?.taskId ? (
                <AnnotationWorkspace
                  key={selected.taskId}
                  taskId={selected.taskId}
                  schema={schema}
                  submit={submit}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No labeling task is queued for this clip.
                </p>
              )}
            </div>
          </section>

          {/* Find similar movements */}
          <aside className="flex flex-col gap-3">
            {selected ? (
              <SimilarClipsPanel
                key={selected.id}
                clipId={selected.id}
                onSelect={handleSelectSimilar}
                fetchSimilarClips={fetchSimilarClips}
              />
            ) : null}
          </aside>
        </div>
      )}
    </main>
  );
}
