import {
  FieldType,
  LabelField,
  WorkspaceSchema,
} from "@/lib/schemas/workspace";

/**
 * One partially-streamed field. `type` is intentionally `unknown`: while an
 * object stream is in flight the enum value can be absent or temporarily
 * invalid, and the preview's job is to tolerate that safely.
 */
export type PartialLabelField = Omit<Partial<LabelField>, "type"> & {
  type?: unknown;
};

/**
 * A deeply-partial view of a `WorkspaceSchema`, matching what the streaming
 * wizard receives from `useObject` while generation is in progress
 * (Requirement 1.8). Every property — and every field entry — may be missing
 * or only half-populated mid-stream, so each is optional and fields may be
 * `undefined`.
 */
export interface PartialWorkspaceSchema {
  domain?: string;
  workspaceName?: string;
  timelineMode?: string;
  fields?: (PartialLabelField | undefined)[];
  workflowStages?: (string | undefined)[];
}

/** The set of allowed field-type values, taken from the Zod enum. */
const FIELD_TYPE_VALUES = new Set<string>(FieldType.options);

/**
 * Normalizes a single partial field (as streamed) into a render-safe
 * `LabelField`, or returns `null` when the entry is too incomplete to render.
 *
 * A field is renderable once it has a non-empty `key` and a `type` that is a
 * known `FieldType` (the deterministic renderer only mounts known types). All
 * other properties are filled with safe defaults so the renderer never reads
 * `undefined` for a value it expects.
 */
export function toRenderableField(
  field: PartialLabelField | undefined,
): LabelField | null {
  if (!field) return null;

  const key = typeof field.key === "string" ? field.key.trim() : "";
  const type = field.type;
  if (key.length === 0) return null;
  if (typeof type !== "string" || !FIELD_TYPE_VALUES.has(type)) return null;

  return {
    key,
    label: typeof field.label === "string" && field.label.length > 0
      ? field.label
      : key,
    help: typeof field.help === "string" ? field.help : null,
    type: type as LabelField["type"],
    required: field.required === true,
    options: Array.isArray(field.options)
      ? field.options.filter((o): o is string => typeof o === "string")
      : null,
    min: typeof field.min === "number" ? field.min : null,
    max: typeof field.max === "number" ? field.max : null,
    group: typeof field.group === "string" ? field.group : null,
  };
}

/**
 * Maps a partial schema's `fields` to the subset that can be rendered safely
 * right now (Requirement 1.8). Incomplete entries (missing key/type) are
 * skipped — they reappear once enough of the field has streamed in. Order is
 * preserved so the preview grows top-to-bottom as fields arrive.
 */
export function toRenderableFields(
  partial: PartialWorkspaceSchema | undefined,
): LabelField[] {
  if (!partial?.fields) return [];
  const out: LabelField[] = [];
  for (const field of partial.fields) {
    const renderable = toRenderableField(field);
    if (renderable) out.push(renderable);
  }
  return out;
}

/**
 * Decides whether a streamed partial object is a complete, valid
 * `WorkspaceSchema` (Requirement 1.2). Returns the parsed, typed schema when it
 * validates, or `null` otherwise. This is the single gate the wizard uses to
 * enable the "Accept" action — activation must never be offered for a partial
 * or invalid schema.
 */
export function parseCompleteWorkspaceSchema(
  partial: PartialWorkspaceSchema | undefined,
): WorkspaceSchema | null {
  if (!partial) return null;
  const result = WorkspaceSchema.safeParse(partial);
  return result.success ? result.data : null;
}

/** Convenience predicate over {@link parseCompleteWorkspaceSchema}. */
export function isCompleteWorkspaceSchema(
  partial: PartialWorkspaceSchema | undefined,
): boolean {
  return parseCompleteWorkspaceSchema(partial) !== null;
}
