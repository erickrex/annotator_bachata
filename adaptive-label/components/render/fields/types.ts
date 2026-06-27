import type { LabelField } from "@/lib/schemas/workspace";

/**
 * Common props every trusted field component receives. The renderer owns the
 * current value and the change handler; components are presentational and never
 * execute any value coming from the schema or the data.
 */
export interface FieldComponentProps {
  /** The validated field configuration from the active schema. */
  field: LabelField;
  /** The current annotation value for this field (may be undefined). */
  value: unknown;
  /** Called with the next value when the control changes. */
  onChange: (value: unknown) => void;
  /** Optional DOM id override for the control (defaults to the field key). */
  id?: string;
}
