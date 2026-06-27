/**
 * Reconstruct the in-memory `WorkspaceSchema` shape from stored database rows.
 *
 * The renderer and the generic validator (`@/lib/validation`) operate on the
 * `WorkspaceSchema` contract (`@/lib/schemas/workspace`), but persistence
 * stores schemas as a `label_schemas` row plus its `label_fields` rows. This
 * helper bridges the two so a stored, activated schema can be validated against
 * a submitted annotation (Requirement 4.2) without re-fetching the original
 * generated object.
 *
 * Column-shape notes (see `./types`):
 * - `label_fields.options_json` is always an array (`[]` when the field has no
 *   options). The contract uses `string[] | null`, so an empty array maps to
 *   `null` — this is important because the validator only runs enum checks when
 *   `options` is non-null.
 * - `label_fields.min` / `max` are numeric columns the `pg` driver returns as
 *   strings to preserve precision; they are parsed back to `number | null`.
 * - `label_fields.field_type` is stored as text. It is carried through as the
 *   field `type`; unknown types are handled safely downstream (the renderer
 *   skips them and the validator ignores them), so no validation happens here.
 */

import type {
  FieldType,
  LabelField,
  WorkspaceSchema,
} from "@/lib/schemas/workspace";
import type { LabelFieldRow, LabelSchemaRow } from "./types";

/** Parse a numeric column (`pg` returns `numeric` as a string) to a number. */
function parseNumeric(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map one stored `label_fields` row to a `LabelField`. An empty `options_json`
 * array becomes `null` so non-enum fields skip enum validation.
 */
export function labelFieldFromRow(row: LabelFieldRow): LabelField {
  return {
    key: row.key,
    label: row.label,
    help: row.help,
    type: row.field_type as FieldType,
    required: row.required,
    options:
      Array.isArray(row.options_json) && row.options_json.length > 0
        ? row.options_json
        : null,
    min: parseNumeric(row.min),
    max: parseNumeric(row.max),
    group: row.field_group,
  };
}

/**
 * Assemble the `WorkspaceSchema`-shaped object used for rendering/validation
 * from a stored schema row and its field rows. Field rows should already be in
 * `order_index` order (as returned by `listFieldsForSchema`); their order is
 * preserved here.
 *
 * The returned object is structurally a `WorkspaceSchema` but is intentionally
 * *not* re-parsed through Zod: it represents already-persisted data, and the
 * validator/renderer only need the structural shape. `workflowStages` is not
 * stored per-field, so it is returned empty.
 */
export function workspaceSchemaFromRows(
  schema: LabelSchemaRow,
  fields: LabelFieldRow[],
): WorkspaceSchema {
  return {
    domain: schema.name,
    workspaceName: schema.name,
    timelineMode: schema.timeline_mode as WorkspaceSchema["timelineMode"],
    fields: fields.map(labelFieldFromRow),
    workflowStages: [],
  };
}
