"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { LabelField, WorkspaceSchema } from "@/lib/schemas/workspace";
import { FieldRenderer } from "./FieldRenderer";

/** A working annotation: values keyed by field `key` (Req 2.1, 4.1). */
export type AnnotationValues = Record<string, unknown>;

/** Payload reported by both the change and submit callbacks. */
export interface WorkspaceFormState {
  /** Current working values, keyed by field `key`. */
  values: AnnotationValues;
  /** Whether the current values differ from the initial values. */
  dirty: boolean;
}

export interface WorkspaceFormProps {
  /**
   * The active workspace schema (fields + metadata). Only `fields` is required
   * for rendering; `workspaceName` is shown as a heading when present.
   */
  schema: Pick<WorkspaceSchema, "fields"> & Partial<WorkspaceSchema>;
  /** Initial annotation values, keyed by field `key`. Defaults to empty. */
  initialValues?: AnnotationValues;
  /** Called whenever a value changes, with the current values and dirtiness. */
  onChange?: (state: WorkspaceFormState) => void;
  /** Called on submit, with the current values and dirtiness. */
  onSubmit?: (state: WorkspaceFormState) => void;
  /** Label for the submit button. */
  submitLabel?: string;
  /** When false, the reset control is hidden. Defaults to true. */
  showReset?: boolean;
}

/** A section of fields that share a `group` (null = ungrouped). */
interface FieldGroup {
  name: string | null;
  fields: LabelField[];
}

/**
 * Buckets fields by their `group`, preserving the order in which groups first
 * appear and the order of fields within each group (Req 2.4). Fields with no
 * `group` are collected into a single ungrouped section (name `null`).
 */
export function groupFields(fields: LabelField[]): FieldGroup[] {
  const order: (string | null)[] = [];
  const byGroup = new Map<string | null, LabelField[]>();
  for (const field of fields) {
    const group = field.group ?? null;
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
      order.push(group);
    }
    byGroup.get(group)!.push(field);
  }
  return order.map((name) => ({ name, fields: byGroup.get(name)! }));
}

/** Stable, order-insensitive-to-undefined comparison of two field values. */
function valueEquals(a: unknown, b: unknown): boolean {
  // Treat `undefined` and missing as equivalent to `null` so an untouched
  // field never reads as dirty.
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Dirty iff any field's current value differs from its initial value. Only the
 * schema's field keys participate, so unrelated keys never affect dirtiness.
 */
function computeDirty(
  current: AnnotationValues,
  initial: AnnotationValues,
  fields: LabelField[],
): boolean {
  return fields.some((field) => !valueEquals(current[field.key], initial[field.key]));
}

/**
 * Renders the active schema's fields grouped by `group`, each via the
 * deterministic `FieldRenderer` (Req 2.1, 2.5). Maintains the working
 * annotation state, tracks dirty state against the initial values, and exposes
 * `onChange`/`onSubmit` callbacks plus a submit button. Backend wiring is Task
 * 10.2; this component only provides the callback surface.
 */
export function WorkspaceForm({
  schema,
  initialValues,
  onChange,
  onSubmit,
  submitLabel = "Submit annotation",
  showReset = true,
}: WorkspaceFormProps) {
  const fields = schema.fields;
  const baseline = React.useMemo(
    () => initialValues ?? {},
    [initialValues],
  );

  const [values, setValues] = React.useState<AnnotationValues>(() => ({
    ...baseline,
  }));

  // Re-sync the working state when the baseline identity changes (e.g. when the
  // workspace switches to a different clip's initial values).
  const prevBaselineRef = React.useRef(baseline);
  React.useEffect(() => {
    if (prevBaselineRef.current !== baseline) {
      prevBaselineRef.current = baseline;
      setValues({ ...baseline });
    }
  }, [baseline]);

  const dirty = React.useMemo(
    () => computeDirty(values, baseline, fields),
    [values, baseline, fields],
  );

  // Notify the parent of changes without firing on the initial mount. Keep the
  // latest `onChange` in a ref (updated in an effect, never during render) so
  // the notification effect does not re-fire when the callback identity changes.
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onChangeRef.current?.({ values, dirty });
  }, [values, dirty]);

  const groups = React.useMemo(() => groupFields(fields), [fields]);

  const handleFieldChange = React.useCallback((key: string, next: unknown) => {
    setValues((prev) => ({ ...prev, [key]: next }));
  }, []);

  const handleReset = React.useCallback(() => {
    setValues({ ...baseline });
  }, [baseline]);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSubmit?.({ values, dirty });
    },
    [onSubmit, values, dirty],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {schema.workspaceName ? (
        <h2 className="text-lg font-semibold text-foreground">
          {schema.workspaceName}
        </h2>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.name ?? "__ungrouped__"}
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
                value={values[field.key]}
                onChange={(next) => handleFieldChange(field.key, next)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3">
        <Button type="submit">{submitLabel}</Button>
        {showReset ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!dirty}
          >
            Reset
          </Button>
        ) : null}
        <span
          data-testid="dirty-indicator"
          data-dirty={dirty ? "true" : "false"}
          className="text-xs text-muted-foreground"
        >
          {dirty ? "Unsaved changes" : "No changes"}
        </span>
      </div>
    </form>
  );
}
