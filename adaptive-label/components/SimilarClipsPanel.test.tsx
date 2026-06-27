import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { SimilarClipsPanel } from "./SimilarClipsPanel";
import type { FetchSimilarClipsResult } from "@/lib/client/similar-clips";

/**
 * Tests for the "Find similar movements" panel. The fetch transport is injected
 * so no network is used; we assert neighbors render in the order received, the
 * cross-domain toggle re-queries with the flag, and the no-embedding/empty case
 * is surfaced as a message.
 */

const NEIGHBORS = [
  { id: "b1", projectId: "p", clipIndex: 1, title: "Basic step", domain: "bachata", distance: 0.12 },
  { id: "b2", projectId: "p", clipIndex: 2, title: "Cross body", domain: "bachata", distance: 0.34 },
];

function ok(
  results: typeof NEIGHBORS,
  crossDomain = false,
  message?: string,
): FetchSimilarClipsResult {
  return { ok: true, results, crossDomain, message };
}

describe("SimilarClipsPanel", () => {
  it("lists neighbors with their distance in the received order", async () => {
    const fetchSimilarClips = vi.fn(async () => ok(NEIGHBORS));

    render(
      <SimilarClipsPanel clipId="src" fetchSimilarClips={fetchSimilarClips} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Basic step")).toBeInTheDocument();
    });
    expect(screen.getByText("Cross body")).toBeInTheDocument();
    expect(screen.getByText("0.1200")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Basic step");
    expect(items[1]).toHaveTextContent("Cross body");
  });

  it("re-queries with crossDomain when the toggle is checked", async () => {
    const fetchSimilarClips = vi.fn(async () => ok(NEIGHBORS));

    render(
      <SimilarClipsPanel clipId="src" fetchSimilarClips={fetchSimilarClips} />,
    );

    await waitFor(() => {
      expect(fetchSimilarClips).toHaveBeenCalledWith("src", {
        crossDomain: false,
        limit: 10,
      });
    });

    fireEvent.click(screen.getByLabelText("Include other domains"));

    await waitFor(() => {
      expect(fetchSimilarClips).toHaveBeenCalledWith("src", {
        crossDomain: true,
        limit: 10,
      });
    });
  });

  it("surfaces the no-embedding message when results are empty", async () => {
    const fetchSimilarClips = vi.fn(async () =>
      ok([], false, "This clip has no embedding yet."),
    );

    render(
      <SimilarClipsPanel clipId="src" fetchSimilarClips={fetchSimilarClips} />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("similar-clips-empty"),
      ).toHaveTextContent("This clip has no embedding yet.");
    });
  });

  it("shows an error message when the fetch fails", async () => {
    const fetchSimilarClips = vi.fn(
      async (): Promise<FetchSimilarClipsResult> => ({
        ok: false,
        status: 500,
        message: "Server error",
      }),
    );

    render(
      <SimilarClipsPanel clipId="src" fetchSimilarClips={fetchSimilarClips} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("similar-clips-error")).toHaveTextContent(
        "Server error",
      );
    });
  });
});
