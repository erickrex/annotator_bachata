"use client";

import * as React from "react";
import { RefreshCw, Upload, Video } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface ProjectMediaAsset {
  id: string;
  filename: string;
  status: string;
  sourceType: string;
  errorMessage: string | null;
}

interface MediaStatusResponse {
  mediaAsset: { id: string; filename: string; status: string; error_message: string | null };
  latestJob: { status: string; progress: string | number; error_message: string | null } | null;
  analysis: { bpm: number; confidence: number; beatCount: number } | null;
  generatedClipCount: number;
}

export interface ProjectMediaPanelProps {
  projectId: string;
  timelineMode: string;
  initialMediaAssets: ProjectMediaAsset[];
}

function isProcessing(status: string): boolean {
  return !["ready", "failed"].includes(status);
}

export function ProjectMediaPanel({
  projectId,
  timelineMode,
  initialMediaAssets,
}: ProjectMediaPanelProps) {
  const router = useRouter();
  const [mediaAssets, setMediaAssets] = React.useState(initialMediaAssets);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialMediaAssets[0]?.id ?? null,
  );
  const [status, setStatus] = React.useState<MediaStatusResponse | null>(null);
  const [youtubeUrl, setYoutubeUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedStatus = status?.mediaAsset.status;

  const refreshStatus = React.useCallback(async () => {
    if (!selectedId) return;
    const response = await fetch(`/api/media/${selectedId}/status`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const next = (await response.json()) as MediaStatusResponse;
    setStatus(next);
    setMediaAssets((current) => {
      const exists = current.some((asset) => asset.id === next.mediaAsset.id);
      const mapped = current.map((asset) =>
        asset.id === next.mediaAsset.id
          ? {
              ...asset,
              filename: next.mediaAsset.filename,
              status: next.mediaAsset.status,
              errorMessage: next.mediaAsset.error_message,
            }
          : asset,
      );
      return exists
        ? mapped
        : [
            {
              id: next.mediaAsset.id,
              filename: next.mediaAsset.filename,
              status: next.mediaAsset.status,
              sourceType: "runtime",
              errorMessage: next.mediaAsset.error_message,
            },
            ...mapped,
          ];
    });
    if (next.mediaAsset.status === "ready") router.refresh();
  }, [router, selectedId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  React.useEffect(() => {
    if (!selectedId || !selectedStatus || !isProcessing(selectedStatus)) return;
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, selectedId, selectedStatus]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("file");
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.set("file", input.files[0]);
    const response = await fetch(`/api/projects/${projectId}/media/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json();
    setUploading(false);
    if (!response.ok) {
      setError(body.error ?? "Upload failed.");
      return;
    }
    const asset = body.mediaAsset as { id: string; filename: string; status: string; source_type: string; error_message: string | null };
    setSelectedId(asset.id);
    setMediaAssets((current) => [
      {
        id: asset.id,
        filename: asset.filename,
        status: asset.status,
        sourceType: asset.source_type,
        errorMessage: asset.error_message,
      },
      ...current,
    ]);
  }

  async function handleYoutube(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/media/youtube`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: youtubeUrl }),
    });
    const body = await response.json();
    setUploading(false);
    if (!response.ok) {
      setError(body.error ?? "YouTube import failed.");
      return;
    }
    setYoutubeUrl("");
    const asset = body.mediaAsset as { id: string; filename: string; status: string; source_type: string; error_message: string | null };
    setSelectedId(asset.id);
    setMediaAssets((current) => [
      {
        id: asset.id,
        filename: asset.filename,
        status: asset.status,
        sourceType: asset.source_type,
        errorMessage: asset.error_message,
      },
      ...current,
    ]);
  }

  async function regenerate(beatCounts: number[]) {
    if (!selectedId) return;
    setUploading(true);
    setError(null);
    const response = await fetch(`/api/media/${selectedId}/generate-clips`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ beatCounts }),
    });
    const body = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok) {
      setError(body.error ?? "Clip regeneration failed.");
      return;
    }
    await refreshStatus();
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Media analysis</h2>
          <p className="text-sm text-muted-foreground">
            {timelineMode === "beat_grid"
              ? "Upload or import a video to generate beat-aligned clips."
              : "Runtime beat analysis is available for beat-grid projects."}
          </p>
        </div>
        {selectedId ? (
          <Button type="button" variant="outline" size="sm" onClick={refreshStatus}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <form onSubmit={handleUpload} className="flex min-w-0 gap-2">
          <input
            name="file"
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="min-w-0 flex-1 rounded-md border border-input px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={uploading || timelineMode !== "beat_grid"}>
            <Upload aria-hidden="true" />
            Upload
          </Button>
        </form>

        <form onSubmit={handleYoutube} className="flex min-w-0 gap-2">
          <input
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="min-w-0 flex-1 rounded-md border border-input px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={uploading || timelineMode !== "beat_grid"}>
            <Video aria-hidden="true" />
            Import
          </Button>
        </form>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {mediaAssets.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {mediaAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelectedId(asset.id)}
                className={`min-w-48 rounded-md border px-3 py-2 text-left text-sm ${
                  asset.id === selectedId ? "border-primary bg-accent" : "border-border"
                }`}
              >
                <span className="block truncate font-medium">{asset.filename}</span>
                <span className="text-xs text-muted-foreground">{asset.status}</span>
              </button>
            ))}
          </div>

          <div className="rounded-md border border-border p-3 text-sm">
            {status ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="font-medium">{status.mediaAsset.status}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Progress</div>
                  <div className="font-medium">{Number(status.latestJob?.progress ?? 0)}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Analysis</div>
                  <div className="font-medium">
                    {status.analysis
                      ? `${Math.round(status.analysis.bpm)} BPM · ${status.analysis.beatCount} beats`
                      : "Pending"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Clips</div>
                  <div className="font-medium">{status.generatedClipCount}</div>
                </div>
                {status.mediaAsset.error_message ? (
                  <p className="sm:col-span-4 text-destructive">
                    {status.mediaAsset.error_message}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 sm:col-span-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading || status.mediaAsset.status !== "ready"}
                    onClick={() => regenerate([8, 16, 32])}
                  >
                    Regenerate 8/16/32
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading || status.mediaAsset.status !== "ready"}
                    onClick={() => regenerate([8])}
                  >
                    8-count only
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Select an imported media asset.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
