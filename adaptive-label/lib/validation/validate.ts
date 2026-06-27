import type { LabelField, WorkspaceSchema } from "@/lib/schemas/workspace";

/**
 * The set of validation rules the generic validator can report. Kept open with
 * a string union so future rules can be added without breaking consumers.
 */
export type ValidationRule = "required" | "enum" | "range" | "unknown_field";

/**
 * A single validation failure. `field` is the schema field `key`, `rule` is the
 * rule that failed, and `message` is a human-readable explanation.
 */
export interface ValidationError {
  field: string;
  rule: ValidationRule;
  message: string;
}

/**
 * Field types whose values participate in numeric range (`min`/`max`)
 * validation when a bound is set on the field.
 */
const RANGE_FIELD_TYPES = new Set<LabelField["type"]>([
  "number",
  "slider",
  "time_range",
  "timeline_marker",
]);

/**
 * Field types that carry a single enum value drawn from `options`.
 */
const SINGLE_ENUM_FIELD_TYPES = new Set<LabelField["type"]>(["select", "radio"]);

/**
 * Returns true when a value is considered "absent" for required-presence
 * purposes. Booleans (e.g. checkboxes) are always considered present because
 * `false` is a meaningful value; empty strings and empty arrays are absent.
 */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Extracts the numeric components of a value for range checking. Handles single
 * numbers (`number`/`slider`/`timeline_marker`) as well as the two common
 * shapes of a `time_range` value: a `[start, end]` tuple or a
 * `{ start, end }` object. Non-numeric pieces are ignored.
 */
function numericComponents(value: unknown): number[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
  }
  if (value && typeof value === "object") {
    const out: number[] = [];
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
    return out;
  }
  return [];
}

function checkRequired(field: LabelField, value: unknown): ValidationError | null {
  if (!field.required) return null;
  if (isEmpty(value)) {
    return {
      field: field.key,
      rule: "required",
      message: `Required field "${field.key}" is missing or empty`,
    };
  }
  return null;
}

function checkEnum(field: LabelField, value: unknown): ValidationError[] {
  if (field.options === null) return [];
  if (isEmpty(value)) return [];

  const allowed = field.options;

  // multiselect: every selected value must be a member of options.
  if (field.type === "multiselect") {
    if (!Array.isArray(value)) {
      return [
        {
          field: field.key,
          rule: "enum",
          message: `Field "${field.key}" expects a list of options`,
        },
      ];
    }
    const invalid = value.filter((v) => !allowed.includes(v as string));
    if (invalid.length > 0) {
      return [
        {
          field: field.key,
          rule: "enum",
          message: `Field "${field.key}" has values not in options: ${invalid
            .map((v) => JSON.stringify(v))
            .join(", ")}`,
        },
      ];
    }
    return [];
  }

  // select / radio: single value must be a member of options.
  if (SINGLE_ENUM_FIELD_TYPES.has(field.type)) {
    if (!allowed.includes(value as string)) {
      return [
        {
          field: field.key,
          rule: "enum",
          message: `"${String(value)}" is not a valid option for "${field.key}"`,
        },
      ];
    }
  }

  return [];
}

function checkRange(field: LabelField, value: unknown): ValidationError[] {
  if (!RANGE_FIELD_TYPES.has(field.type)) return [];
  if (field.min === null && field.max === null) return [];
  if (isEmpty(value)) return [];

  const components = numericComponents(value);
  const errors: ValidationError[] = [];
  for (const n of components) {
    if (field.min !== null && n < field.min) {
      errors.push({
        field: field.key,
        rule: "range",
        message: `Value ${n} for "${field.key}" is below minimum ${field.min}`,
      });
    }
    if (field.max !== null && n > field.max) {
      errors.push({
        field: field.key,
        rule: "range",
        message: `Value ${n} for "${field.key}" is above maximum ${field.max}`,
      });
    }
  }
  return errors;
}

/**
 * Validates an annotation `values` object against a `WorkspaceSchema`. For each
 * field it checks, in order:
 *
 * 1. required presence — `required` fields must have a non-empty value;
 * 2. enum membership — `select`/`radio` values must be one of `options`, and
 *    every selected `multiselect` value must be in `options`;
 * 3. numeric range — `number`/`slider`/`time_range`/`timeline_marker` values
 *    must fall within `[min, max]` when those bounds are set.
 *
 * Optional fields with absent values skip enum and range checks. Keys in
 * `values` that are not part of the schema are ignored here (the
 * values-keys-subset invariant is enforced at persistence; see
 * {@link extraneousValueKeys}). Returns an empty array when the annotation is
 * valid.
 */
export function validateAnnotation(
  schema: WorkspaceSchema,
  values: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    const value = values[field.key];

    const requiredError = checkRequired(field, value);
    if (requiredError) {
      // If a required value is missing entirely, downstream enum/range checks
      // are not meaningful, so move on to the next field.
      errors.push(requiredError);
      continue;
    }

    errors.push(...checkEnum(field, value));
    errors.push(...checkRange(field, value));
  }

  return errors;
}

/**
 * Returns the keys present in `values` that are not defined by any field in the
 * schema. An empty array means `values`' keys are a subset of the schema's
 * field keys (Property 4). Persistence should reject or drop extraneous keys.
 */
export function extraneousValueKeys(
  schema: WorkspaceSchema,
  values: Record<string, unknown>,
): string[] {
  const fieldKeys = new Set(schema.fields.map((f) => f.key));
  return Object.keys(values).filter((k) => !fieldKeys.has(k));
}

/**
 * True when every key in `values` corresponds to a field key in the schema.
 */
export function isValuesSubsetOfSchema(
  schema: WorkspaceSchema,
  values: Record<string, unknown>,
): boolean {
  return extraneousValueKeys(schema, values).length === 0;
}
