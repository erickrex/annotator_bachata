import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { ProjectWorkspace, type WorkspaceClip } from "./ProjectWorkspace";
import { PRESETS } from "@/lib/schemas/workspace";
import type {
  BeatGridMetadata,
  GlossSegmentsMetadata,
} from "@/lib/seed/types";

// The workspace uses the App Router's `useRouter` for cross-domain navigation;
// stub it so the component can mount outside a Next.js router context.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

/**
 * Workspace composition test (Task 13 / Requirements 3.1, 3.2, 3.3).
 *
 * The point of these tests is adaptivity: the SAME `ProjectWorkspace` (queue +
 * video + TimelineForMode + WorkspaceForm + similar panel), driven only by the
 * stored schema + seeded clip metadata, renders the bachata beat grid for one
 * project and the sign-language gloss timeline for the other.
 *
 * Network transports are injected so no live HTTP occurs.
 */

const noopSimilar = vi
  .fn()
  .mockResolvedValue({ ok: true, results: [], crossDomain: false });

function beatGridFixture(): BeatGridMetadata {
  const beat_timestamps = Array.from({ length: 16 }, (_, i) =>
    Number((0.2 + i * 0.5).toFixed(3)),
  );
  const beat_frames = beat_timestamps.map((t) => Math.round(t * 30));
  return {
    timelineMode: "beat_grid",
    beatGrid: {
      bpm: 120,
      bpm_confidence: 1,
      downbeat_offset_seconds: 0.2,
      beat_timestamps,
      beat_frames,
      energy_profile: beat_timestamps.map(() => 0.5),
    },
    phrasing: {
      beatsPerCycle: 8,
      downbeatIndex: 0,
      countsPerPhrase16: 16,
      countsPerPhrase32: 32,
    },
    provenance: "analyzer",
  };
}

function glossFixture(): GlossSegmentsMetadata {
  return {
    timelineMode: "gloss_segments",
    glossSegments: [
      {
        index: 0,
        gloss: "HELLO",
        sign_type: "lexical",
        dominant_hand: "right",
        two_handed: false,
        handshapes: ["flat"],
        non_manual_markers: "brow raise",
        clarity: 5,
        startSeconds: 0.2,
        endSeconds: 1,
        startFrame: 6,
        endFrame: 30,
        phrase: 1,
      },
      {
        index: 1,
        gloss: "NICE",
        sign_type: "lexical",
        dominant_hand: "right",
        two_handed: true,
        handshapes: ["flat"],
        non_manual_markers: "neutral",
        clarity: 4,
        startSeconds: 1.1,
        endSeconds: 2,
        startFrame: 33,
        endFrame: 60,
        phrase: 1,
      },
    ],
    phrases: [
      {
        phrase: 1,
        label: "HELLO NICE",
        startSeconds: 0.2,
        endSeconds: 2,
        glossIndices: [0, 1],
      },
    ],
    provenance: "hand-authored",
  };
}

function bachataClips(): WorkspaceClip[] {
  return [
    {
      id: "clip-b1",
      taskId: "task-b1",
      clipIndex: 1,
      title: "Basic step",
      domain: "bachata",
      startSeconds: 0,
      endSeconds: 8,
      videoSrc: null,
      fps: 30,
      metadata: beatGridFixture(),
    },
    {
      id: "clip-b2",
      taskId: "task-b2",
      clipIndex: 2,
      title: "Cross body lead",
      domain: "bachata",
      startSeconds: 0,
      endSeconds: 8,
      videoSrc: null,
      fps: 30,
      metadata: beatGridFixture(),
    },
  ];
}

function signClips(): WorkspaceClip[] {
  return [
    {
      id: "clip-s1",
      taskId: "task-s1",
      clipIndex: 1,
      title: "Greeting",
      domain: "sign_language",
      startSeconds: 0,
      endSeconds: 4,
      videoSrc: null,
      fps: 30,
      metadata: glossFixture(),
    },
  ];
}

describe("ProjectWorkspace adaptivity (Req 3.1/3.2/3.3)", () => {
  it("renders the bachata beat-grid timeline plus the adaptive form and queue", () => {
    render(
      <ProjectWorkspace
        project={{ id: "p-bachata", name: "Bachata", domain: "bachata" }}
        schema={PRESETS.bachata}
        clips={bachataClips()}
        submit={vi.fn()}
        fetchSimilarClips={noopSimilar}
      />,
    );

    // Beat-grid timeline from the shared TimelineForMode.
    expect(screen.getByTestId("beat-grid-timeline")).toBeInTheDocument();
    expect(screen.queryByTestId("gloss-segment-timeline")).toBeNull();

    // Queue lists both clips; the adaptive form shows a bachata-specific field.
    const queue = screen.getByTestId("clip-queue");
    expect(within(queue).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByLabelText(/Move name/)).toBeInTheDocument();

    // The similarity panel is mounted for the selected clip.
    expect(screen.getByTestId("similar-clips-panel")).toBeInTheDocument();
  });

  it("renders the sign-language gloss timeline from the SAME component", () => {
    render(
      <ProjectWorkspace
        project={{ id: "p-sign", name: "Sign Language", domain: "sign_language" }}
        schema={PRESETS.sign_language}
        clips={signClips()}
        submit={vi.fn()}
        fetchSimilarClips={noopSimilar}
      />,
    );

    expect(screen.getByTestId("gloss-segment-timeline")).toBeInTheDocument();
    expect(screen.queryByTestId("beat-grid-timeline")).toBeNull();

    // Adaptive form shows a sign-language-specific field (gloss), not bachata's.
    // The required marker appends "*" to the label text; the regex matches the
    // field label without also matching the "Gloss-segment timeline" aria-label.
    expect(screen.getByLabelText(/^Gloss\*?$/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Move name/)).toBeNull();
  });

  it("switches the mounted timeline when a different clip is selected", () => {
    render(
      <ProjectWorkspace
        project={{ id: "p-bachata", name: "Bachata", domain: "bachata" }}
        schema={PRESETS.bachata}
        clips={bachataClips()}
        submit={vi.fn()}
        fetchSimilarClips={noopSimilar}
      />,
    );

    const queue = screen.getByTestId("clip-queue");
    fireEvent.click(within(queue).getByText("Cross body lead"));

    // Still the same renderer/timeline for the newly selected clip.
    expect(screen.getByTestId("beat-grid-timeline")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no clips", () => {
    render(
      <ProjectWorkspace
        project={{ id: "p-empty", name: "Empty", domain: "bachata" }}
        schema={PRESETS.bachata}
        clips={[]}
        submit={vi.fn()}
        fetchSimilarClips={noopSimilar}
      />,
    );

    expect(screen.getByTestId("workspace-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("clip-queue")).toBeNull();
  });
});
