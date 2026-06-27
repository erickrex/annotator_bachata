"use client";

import * as React from "react";

import { FieldRenderer } from "@/components/render/FieldRenderer";
import { groupFields } from "@/components/render/WorkspaceForm";
import {
  toRenderableFields,
  type PartialWorkspaceSchema,
} from "./wizard-helpers";

export interface SchemaPreviewProps {
  /**
   * The partial schema as streamed by `useObject`. May be `undefined` before
   * generation starts and only partially populated mid-stream (Req 1.8).
   */
  schema: PartialWorkspaceSchema | undefined;
  /** Whether the stream is still producing fields (controls the live hint). */
  streaming?: boolean;
}

/** A small labelled metadata chip; renders a placeholder when value is absent. */
function MetaChip({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className="text-sm text-foreground"
        data-testid={`meta-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {value && value.length > 0 ? (
          value
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </div>
  );
}

/**
 * Renders the streamed schema as it arrives (Requirement 1.8): workspace
 * metadata first, then each field via the deterministic `FieldRenderer` as soon
 * as it is complete enough to render. Partial/incomplete fields are skipped
 * until they fill in, so the preview grows live without throwing on
 * half-streamed data.
 *
 * This component is purely presentational: it holds only local preview values
 * (so a viewer can poke at the controls) and performs no network/AI calls.
 */
export function SchemaPreview({ schema, streaming = false }: SchemaPreviewProps) {
  const fields = React.useMemo(() => toRenderableFields(schema), [schema]);
  const groups = React.useMemo(() => groupFields(fields), [fields]);

  // Local, throwaway preview values so the controls are interactive without
  // mutating any real annotation state.
  const [previewValues, setPreviewValues] = React.useState<
    Record<string, unknown>
  >({});
  const handleChange = React.useCallback((key: string, value: unknown) => {
    setPreviewValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasAnything =
    Boolean(schema) &&
    (Boolean(schema?.workspaceName) ||
      Boolean(schema?.domain) ||
      Boolean(schema?.timelineMode) ||
      fields.length > 0);

  if (!hasAnything) {
    return (
      <div
        data-testid="preview-empty"
        className="rounded-lg border border-dashed border-input p-6 text-center text-sm text-muted-foreground"
      >
        Your generated workspace will appear here as it streams in.
      </div>
    );
  }

  return (
    <section
      aria-label="Generated workspace preview"
      className="flex flex-col gap-6 rounded-lg border border-input p-6"
    >
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {schema?.workspaceName && schema.workspaceName.length > 0
              ? schema.workspaceName
              : "Generating workspace…"}
          </h2>
          {streaming ? (
            <span
              data-testid="streaming-indicator"
              className="text-xs text-muted-foreground"
            >
              Streaming…
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <MetaChip label="Domain" value={schema?.domain} />
          <MetaChip label="Timeline mode" value={schema?.timelineMode} />
          <MetaChip label="Fields" value={String(fields.length)} />
        </div>
      </header>

      {fields.length === 0 ? (
        <p
          data-testid="preview-awaiting-fields"
          className="text-sm text-muted-foreground"
        >
          Waiting for fields…
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div
              key={group.name ?? "__ungrouped__"}
              role="group"
              aria-label={group.name ?? "General"}
              className="flex flex-col gap-4"
            >
              {group.name ? (
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                </h3>
              ) : null}
              <div className="flex flex-col gap-4">
                {group.fields.map((field) => (
                  <FieldRenderer
                    key={field.key}
                    field={field}
                    value={previewValues[field.key]}
                    onChange={(next) => handleChange(field.key, next)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
