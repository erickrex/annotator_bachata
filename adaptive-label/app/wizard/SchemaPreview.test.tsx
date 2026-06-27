import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { SchemaPreview } from "./SchemaPreview";
import type { PartialWorkspaceSchema } from "./wizard-helpers";

describe("SchemaPreview", () => {
  it("shows an empty placeholder before anything streams in", () => {
    render(<SchemaPreview schema={undefined} />);
    expect(screen.getByTestId("preview-empty")).toBeInTheDocument();
  });

  it("renders metadata as soon as it arrives, before fields", () => {
    const partial: PartialWorkspaceSchema = {
      workspaceName: "Bachata Move Annotation",
      domain: "bachata",
      timelineMode: "beat_grid",
      fields: [],
    };
    render(<SchemaPreview schema={partial} streaming />);

    expect(
      screen.getByRole("heading", { name: "Bachata Move Annotation" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("meta-domain")).toHaveTextContent("bachata");
    expect(screen.getByTestId("meta-timeline-mode")).toHaveTextContent(
      "beat_grid",
    );
    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("preview-awaiting-fields")).toBeInTheDocument();
  });

  it("renders only the renderable fields, grouped, as they stream", () => {
    const partial: PartialWorkspaceSchema = {
      workspaceName: "WS",
      domain: "bachata",
      timelineMode: "beat_grid",
      fields: [
        { key: "move_name", label: "Move name", type: "text", group: "Identification" },
        // Incomplete field (no type yet) must be skipped without throwing.
        { key: "difficulty" },
        { key: "phrase_count", label: "Phrases", type: "number", group: "Timing" },
      ],
    };
    render(<SchemaPreview schema={partial} />);

    const ident = screen.getByRole("group", { name: "Identification" });
    expect(within(ident).getByText("Move name")).toBeInTheDocument();

    const timing = screen.getByRole("group", { name: "Timing" });
    expect(within(timing).getByText("Phrases")).toBeInTheDocument();

    // The incomplete "difficulty" field has not been rendered yet.
    expect(screen.queryByText("difficulty")).not.toBeInTheDocument();

    // Field count chip reflects only the renderable fields.
    expect(screen.getByTestId("meta-fields")).toHaveTextContent("2");
  });

  it("does not throw on a half-streamed field with an unknown type", () => {
    const partial: PartialWorkspaceSchema = {
      workspaceName: "WS",
      fields: [{ key: "x", type: "tex" }], // partial enum value mid-stream
    };
    expect(() => render(<SchemaPreview schema={partial} />)).not.toThrow();
    expect(screen.getByTestId("meta-fields")).toHaveTextContent("0");
  });
});
