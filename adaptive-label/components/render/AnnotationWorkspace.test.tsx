import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import { AnnotationWorkspace } from "@/components/render/AnnotationWorkspace";
import type { WorkspaceSchema } from "@/lib/schemas/workspace";

/**
 * Component test for the WorkspaceForm submit wiring (Task 10.2): on submit it
 * calls the injected transport, surfaces returned validation errors inline on
 * failure, and shows a confirmation on success.
 */

const SCHEMA: WorkspaceSchema = {
  domain: "bachata",
  workspaceName: "Bachata Move Annotation",
  timelineMode: "beat_grid",
  workflowStages: ["draft", "submitted"],
  fields: [
    {
      key: "move_name",
      label: "Move name",
      help: null,
      type: "text",
      required: true,
      options: null,
      min: null,
      max: null,
      group: "Identification",
    },
    {
      key: "move_category",
      label: "Category",
      help: null,
      type: "select",
      required: false,
      options: ["basic", "turn"],
      min: null,
      max: null,
      group: "Identification",
    },
    {
      key: "difficulty",
      label: "Difficulty",
      help: null,
      type: "slider",
      required: false,
      options: null,
      min: 1,
      max: 10,
      group: "Assessment",
    },
  ],
};

describe("AnnotationWorkspace", () => {
  it("calls submit with current values and reports success", async () => {
    const submit = vi.fn().mockResolvedValue({
      ok: true,
      annotation: { id: "a1", source: "human" },
    });
    const onSubmitted = vi.fn();

    render(
      <AnnotationWorkspace
        taskId="task-1"
        schema={SCHEMA}
        initialValues={{ move_name: "" }}
        submit={submit}
        onSubmitted={onSubmitted}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Move name/), {
      target: { value: "cambré" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit annotation" }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith("task-1", {
        values: expect.objectContaining({ move_name: "cambré" }),
        status: "submitted",
      });
    });

    expect(await screen.findByTestId("annotation-saved")).toBeInTheDocument();
    expect(onSubmitted).toHaveBeenCalledWith({ id: "a1", source: "human" });
    expect(screen.queryByTestId("annotation-errors")).not.toBeInTheDocument();
  });

  it("surfaces returned validation errors inline and blocks (no success shown)", async () => {
    const submit = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      message: "Annotation failed validation.",
      errors: [
        {
          field: "move_name",
          rule: "required",
          message: 'Required field "move_name" is missing or empty',
        },
      ],
    });
    const onSubmitted = vi.fn();

    render(
      <AnnotationWorkspace
        taskId="task-1"
        schema={SCHEMA}
        submit={submit}
        onSubmitted={onSubmitted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit annotation" }));

    const alert = await screen.findByTestId("annotation-errors");
    expect(alert).toHaveTextContent("move_name");
    expect(alert).toHaveTextContent("is missing or empty");
    expect(screen.queryByTestId("annotation-saved")).not.toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("clears prior errors after a subsequent successful submit", async () => {
    const submit = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        message: "Annotation failed validation.",
        errors: [
          { field: "move_name", rule: "required", message: "missing" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        annotation: { id: "a1", source: "human" },
      });

    render(
      <AnnotationWorkspace taskId="task-1" schema={SCHEMA} submit={submit} />,
    );

    const button = screen.getByRole("button", { name: "Submit annotation" });

    fireEvent.click(button);
    expect(await screen.findByTestId("annotation-errors")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Move name/), {
      target: { value: "cambré" },
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByTestId("annotation-errors")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("annotation-saved")).toBeInTheDocument();
  });
});
