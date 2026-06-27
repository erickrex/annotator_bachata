import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { TimelineForMode } from "@/components/render/timeline";
import type {
  BeatGridMetadata,
  GlossSegmentsMetadata,
} from "@/lib/seed/types";
import type { TimelineMode } from "@/lib/schemas/workspace";

/**
 * Representative seeded beat-grid metadata, mirroring the shape produced by the
 * offline analyzer (see `seed/clips.bachata.json`). 16 beats, downbeat at index
 * 0, 8 beats per cycle → 2 base cycles, one 16-count phrase, zero 32-count
 * phrases.
 */
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

/** Representative seeded gloss-segment metadata (see `seed/clips.sign_language.json`). */
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
        non_manual_markers: "brow raise, smile",
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
      {
        index: 2,
        gloss: "MEET-YOU",
        sign_type: "lexical",
        dominant_hand: "both",
        two_handed: true,
        handshapes: ["index"],
        non_manual_markers: "eye gaze to addressee",
        clarity: 5,
        startSeconds: 2.1,
        endSeconds: 3.4,
        startFrame: 63,
        endFrame: 102,
        phrase: 1,
      },
    ],
    phrases: [
      {
        phrase: 1,
        label: "HELLO NICE MEET-YOU",
        startSeconds: 0.2,
        endSeconds: 3.4,
        glossIndices: [0, 1, 2],
      },
    ],
    provenance: "hand-authored",
  };
}

describe("TimelineForMode", () => {
  it("mounts the beat-grid timeline for beat_grid mode with markers and phrases from seeded data", () => {
    const metadata = beatGridFixture();
    render(<TimelineForMode timelineMode="beat_grid" metadata={metadata} />);

    const timeline = screen.getByTestId("beat-grid-timeline");
    expect(timeline).toBeInTheDocument();

    // Beat markers derived from seeded beat_timestamps (16 beats).
    expect(within(timeline).getAllByTestId("beat-marker")).toHaveLength(16);
    expect(screen.getByTestId("beat-count")).toHaveTextContent("16 beats");

    // Grid math reuses buildCycles: 16 beats / 8 per cycle = 2 cycles,
    // one 16-count phrase, zero 32-count phrases.
    expect(screen.getByTestId("cycle-count")).toHaveTextContent(
      "2 × 8-count cycles",
    );
    expect(screen.getByTestId("phrase16-count")).toHaveTextContent(
      "1 × 16-count phrases",
    );
    expect(screen.getByTestId("phrase32-count")).toHaveTextContent(
      "0 × 32-count phrases",
    );
    expect(screen.getByText("120 BPM")).toBeInTheDocument();

    // No other domain's timeline leaked in.
    expect(screen.queryByTestId("gloss-segment-timeline")).toBeNull();
    expect(screen.queryByTestId("phase-rep-timeline")).toBeNull();
  });

  it("mounts the gloss-segment timeline for gloss_segments mode with segments and phrase grouping", () => {
    const metadata = glossFixture();
    render(
      <TimelineForMode timelineMode="gloss_segments" metadata={metadata} />,
    );

    const timeline = screen.getByTestId("gloss-segment-timeline");
    expect(timeline).toBeInTheDocument();

    // Sign boundaries, one per seeded gloss segment.
    expect(within(timeline).getAllByTestId("gloss-segment")).toHaveLength(3);
    expect(screen.getByTestId("segment-count")).toHaveTextContent("3 signs");

    // Phrase grouping.
    const phrases = within(timeline).getAllByTestId("gloss-phrase");
    expect(phrases).toHaveLength(1);
    expect(screen.getByTestId("phrase-count")).toHaveTextContent("1 phrases");
    expect(screen.getByText("HELLO NICE MEET-YOU")).toBeInTheDocument();
    expect(screen.getByText("HELLO")).toBeInTheDocument();
    expect(screen.getByText("MEET-YOU")).toBeInTheDocument();

    expect(screen.queryByTestId("beat-grid-timeline")).toBeNull();
  });

  it("mounts the phase_rep stub with a 'not available in demo' placeholder", () => {
    render(<TimelineForMode timelineMode="phase_rep" />);

    const stub = screen.getByTestId("phase-rep-timeline");
    expect(stub).toBeInTheDocument();
    expect(stub).toHaveTextContent(/not available in the demo/i);
  });

  it("selects the correct module per mode from the SAME component (adaptivity, Req 3.1/3.2)", () => {
    // Same renderer, different stored configuration → different domain UI.
    const beat = render(
      <TimelineForMode timelineMode="beat_grid" metadata={beatGridFixture()} />,
    );
    expect(screen.getByTestId("beat-grid-timeline")).toBeInTheDocument();
    expect(screen.queryByTestId("gloss-segment-timeline")).toBeNull();
    beat.unmount();

    const gloss = render(
      <TimelineForMode
        timelineMode="gloss_segments"
        metadata={glossFixture()}
      />,
    );
    expect(screen.getByTestId("gloss-segment-timeline")).toBeInTheDocument();
    expect(screen.queryByTestId("beat-grid-timeline")).toBeNull();
    gloss.unmount();
  });

  it("renders a safe fallback (nothing) for an unknown timeline mode", () => {
    const { container } = render(
      <TimelineForMode
        timelineMode={"hologram" as unknown as TimelineMode}
        metadata={beatGridFixture()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the mode and metadata discriminant mismatch", () => {
    // beat_grid mode but gloss metadata → guarded, renders nothing rather than
    // coercing the wrong shape.
    const { container } = render(
      <TimelineForMode
        timelineMode="beat_grid"
        metadata={glossFixture()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
