"use client";

import * as React from "react";

import {
  fetchSimilarClips as defaultFetchSimilarClips,
  type FetchSimilarClipsResult,
  type SimilarClip,
} from "@/lib/client/similar-clips";

export interface SimilarClipsPanelProps {
  /** The source clip whose neighbors to show. */
  clipId: string;
  /** Maximum neighbors to request (default 10). */
  limit?: number;
  /** Called when a neighbor is selected (e.g. to navigate the workspace). */
  onSelect?: (clip: SimilarClip) => void;
  /**
   * The fetch transport. Defaults to the real
   * `GET /api/clips/:id/similar` helper; injectable so the panel can be tested
   * without a live network.
   */
  fetchSimilarClips?: (
    clipId: string,
    request: { crossDomain?: boolean; limit?: number },
  ) => Promise<FetchSimilarClipsResult>;
}

/**
 * "Find similar movements" panel (Task 11 / Requirements 5.3, 5.4).
 *
 * Given a clip id, fetches the nearest clips from the pgvector-backed endpoint
 * and lists them in distance order with a cross-domain toggle. The endpoint
 * uses the source clip's stored embedding — this panel never computes one. The
 * empty/no-embedding case is surfaced as a message rather than an error.
 */
export function SimilarClipsPanel({
  clipId,
  limit = 10,
  onSelect,
  fetchSimilarClips = defaultFetchSimilarClips,
}: SimilarClipsPanelProps) {
  const [crossDomain, setCrossDomain] = React.useState(false);
  // Starts loading: the mount effect immediately fetches the first page.
  const [loading, setLoading] = React.useState(true);
  const [results, setResults] = React.useState<SimilarClip[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch whenever the source clip or the cross-domain flag changes. State is
  // only updated inside the promise continuation (never synchronously in the
  // effect body); the loading flag is raised by the mount default and by the
  // toggle handler. A cancellation guard avoids setting state after unmount or
  // a superseded request.
  React.useEffect(() => {
    let active = true;
    fetchSimilarClips(clipId, { crossDomain, limit }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        setError(null);
        setResults(result.results);
        setMessage(
          result.results.length === 0 ? result.message ?? null : null,
        );
        return;
      }
      setResults([]);
      setMessage(null);
      setError(result.message);
    });
    return () => {
      active = false;
    };
  }, [fetchSimilarClips, clipId, crossDomain, limit]);

  const handleToggle = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setLoading(true);
      setError(null);
      setCrossDomain(event.target.checked);
    },
    [],
  );

  return (
    <section
      data-testid="similar-clips-panel"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Find similar movements</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={crossDomain}
            onChange={handleToggle}
            aria-label="Include other domains"
          />
          Cross-domain
        </label>
      </header>

      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Finding similar clips…
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="similar-clips-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {!loading && !error && results.length === 0 ? (
        <p
          data-testid="similar-clips-empty"
          className="text-sm text-muted-foreground"
        >
          {message ?? "No similar clips found."}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {results.map((clip) => (
            <li key={clip.id}>
              <button
                type="button"
                onClick={() => onSelect?.(clip)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">
                  {clip.title ?? `Clip ${clip.clipIndex}`}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {clip.domain}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {clip.distance.toFixed(4)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
