import { describe, it, expect } from "vitest";

import {
  serializeJsonl,
  serializeJsonlLine,
  type ExportRecord,
} from "./jsonl";

/**
 * Unit tests for the pure JSONL export serializer (Requirements 6.1, 6.2).
 *
 * These exercise the serializer directly (no DB / network): one line per
 * record, each line standalone-valid JSON, every line carrying the clip
 * reference, schema version, values, and status; and the empty-input case.
 */

function makeRecord(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    clip: {
      id: "clip-1",
      index: 3,
      title: "Cambré sequence",
      domain: "bachata",
    },
    schemaVersion: 2,
    status: "submitted",
    values: { move_name: "cambré", energy: 7 },
    ...overrides,
  };
}

describe("serializeJsonl", () => {
  it("produces one line per record", () => {
    const records = [makeRecord(), makeRecord({ clip: { id: "clip-2", index: 4, title: null, domain: "bachata" } })];
    const out = serializeJsonl(records);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("emits empty output for empty input", () => {
    expect(serializeJsonl([])).toBe("");
  });

  it("makes every line a standalone valid JSON object", () => {
    const records = [makeRecord(), makeRecord({ status: "approved" })];
    const out = serializeJsonl(records);
    for (const line of out.split("\n")) {
      expect(() => JSON.parse(line)).not.toThrow();
      expect(typeof JSON.parse(line)).toBe("object");
    }
  });

  it("includes the clip reference, schema version, values, and status", () => {
    const out = serializeJsonl([makeRecord()]);
    const parsed = JSON.parse(out);

    // Clip reference (Req 6.2).
    expect(parsed.clip_id).toBe("clip-1");
    expect(parsed.clip_index).toBe(3);
    expect(parsed.clip_title).toBe("Cambré sequence");
    expect(parsed.clip_domain).toBe("bachata");
    // Schema version (Req 6.2).
    expect(parsed.schema_version).toBe(2);
    // Status (Req 6.2).
    expect(parsed.status).toBe("submitted");
    // Values (Req 6.2).
    expect(parsed.values).toEqual({ move_name: "cambré", energy: 7 });
  });

  it("preserves a null clip title", () => {
    const out = serializeJsonl([
      makeRecord({ clip: { id: "c", index: 0, title: null, domain: "bachata" } }),
    ]);
    const parsed = JSON.parse(out);
    expect(parsed.clip_title).toBeNull();
  });

  it("includes source when provided and omits it otherwise", () => {
    const withSource = JSON.parse(
      serializeJsonlLine(makeRecord({ source: "human" })),
    );
    expect(withSource.source).toBe("human");

    const withoutSource = JSON.parse(serializeJsonlLine(makeRecord()));
    expect("source" in withoutSource).toBe(false);
  });

  it("defaults missing values to an empty object", () => {
    const record = makeRecord();
    // Force values undefined to model a record built without values.
    (record as { values?: Record<string, unknown> }).values = undefined;
    const parsed = JSON.parse(serializeJsonlLine(record));
    expect(parsed.values).toEqual({});
  });

  it("does not add a trailing newline", () => {
    const out = serializeJsonl([makeRecord(), makeRecord()]);
    expect(out.endsWith("\n")).toBe(false);
  });
});
