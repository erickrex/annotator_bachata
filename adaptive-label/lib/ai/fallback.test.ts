import { describe, it, expect } from "vitest";

import { selectFallbackDomain, selectFallbackPreset } from "./fallback";
import { PRESETS } from "@/lib/schemas/workspace";

/**
 * The fallback preset selection must honour the same domain → timeline mapping
 * the model is instructed to follow: rhythmic/musical → beat_grid (Req 1.4),
 * sign language → gloss_segments (Req 1.5).
 */
describe("selectFallbackDomain", () => {
  it("maps rhythmic/musical descriptions to the bachata (beat_grid) domain", () => {
    const descriptions = [
      "A dataset of bachata dance moves with beat timing",
      "Salsa choreography clips annotated by phrase and footwork",
      "Short clips of dancers stepping on the musical beat",
    ];
    for (const description of descriptions) {
      expect(selectFallbackDomain(description)).toBe("bachata");
    }
  });

  it("maps sign-language descriptions to the gloss_segments domain", () => {
    const descriptions = [
      "ASL sign language clips labeled with glosses",
      "A dataset for annotating signing with handshapes and non-manual markers",
      "Fingerspelling and gloss segmentation for a deaf community corpus",
    ];
    for (const description of descriptions) {
      expect(selectFallbackDomain(description)).toBe("sign_language");
    }
  });

  it("prefers sign language when both signals appear (more specific)", () => {
    expect(
      selectFallbackDomain("sign language clips with rhythm and beat cues"),
    ).toBe("sign_language");
  });

  it("defaults to bachata (beat_grid) when the description is ambiguous", () => {
    expect(selectFallbackDomain("a pile of generic video clips")).toBe(
      "bachata",
    );
  });
});

describe("selectFallbackPreset", () => {
  it("returns the beat_grid preset for a rhythmic description", () => {
    const preset = selectFallbackPreset("bachata dance dataset");
    expect(preset.timelineMode).toBe("beat_grid");
    expect(preset.domain).toBe(PRESETS.bachata.domain);
  });

  it("returns the gloss_segments preset for a sign-language description", () => {
    const preset = selectFallbackPreset("ASL gloss annotation dataset");
    expect(preset.timelineMode).toBe("gloss_segments");
    expect(preset.domain).toBe(PRESETS.sign_language.domain);
  });

  it("returns a deep copy that does not alias the shared PRESETS", () => {
    const preset = selectFallbackPreset("bachata dance dataset");
    expect(preset).not.toBe(PRESETS.bachata);
    preset.fields.push({
      key: "injected",
      label: "Injected",
      help: null,
      type: "text",
      required: false,
      options: null,
      min: null,
      max: null,
      group: null,
    });
    expect(PRESETS.bachata.fields).not.toHaveLength(preset.fields.length);
  });
});
