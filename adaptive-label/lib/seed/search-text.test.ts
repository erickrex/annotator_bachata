import { describe, it, expect } from "vitest";

import { buildSearchText } from "@/lib/seed/search-text";

describe("buildSearchText (examples)", () => {
  it("concatenates title, domain, and sorted attributes", () => {
    const text = buildSearchText({
      title: "Basic step — closed position",
      domain: "bachata",
      searchAttributes: {
        move_name: "Basic step",
        move_category: "basic",
        on_beat: true,
        difficulty: 2,
        footwork_patterns: ["side_step", "tap"],
      },
    });

    expect(text).toBe(
      "Basic step — closed position | domain: bachata | " +
        "difficulty: 2 | footwork_patterns: side_step, tap | " +
        "move_category: basic | move_name: Basic step | on_beat: yes",
    );
  });

  it("omits an empty title but always includes the domain", () => {
    const text = buildSearchText({
      title: "",
      domain: "sign_language",
      searchAttributes: {},
    });
    expect(text).toBe("domain: sign_language");
  });

  it("renders array and boolean attributes readably", () => {
    const text = buildSearchText({
      title: "Greeting",
      domain: "sign_language",
      searchAttributes: {
        sign_type: ["lexical", "fingerspelled"],
        two_handed: false,
      },
    });
    expect(text).toBe(
      "Greeting | domain: sign_language | " +
        "sign_type: lexical, fingerspelled | two_handed: no",
    );
  });

  it("skips null/undefined and empty attribute values", () => {
    const text = buildSearchText({
      title: "T",
      domain: "d",
      searchAttributes: {
        a: null,
        b: undefined,
        c: "",
        d: "kept",
      },
    });
    expect(text).toBe("T | domain: d | d: kept");
  });
});
