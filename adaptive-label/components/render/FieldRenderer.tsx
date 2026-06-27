"use client";

import * as React from "react";

import type { FieldType, LabelField } from "@/lib/schemas/workspace";
import {
  CheckboxField,
  MultiSelectField,
  NumberField,
  RadioField,
  SelectField,
  SliderField,
  TextAreaField,
  TextField,
  TimeRangeField,
  TimelineMarkerField,
  type FieldComponentProps,
} from "./fields";

/**
 * The fixed component registry: a closed mapping from each allowed `FieldType`
 * to a single trusted, pre-built component (Req 2.2, 8.3). This object is the
 * ONLY place a field type is resolved to a component. There is no dynamic
 * lookup keyed by arbitrary data, no `eval`, and no runtime code generation —
 * the schema supplies data, never a component to execute.
 */
const FIELD_COMPONENTS: Record<
  FieldType,
  React.ComponentType<FieldComponentProps>
> = {
  text: TextField,
  textarea: TextAreaField,
  select: SelectField,
  multiselect: MultiSelectField,
  checkbox: CheckboxField,
  radio: RadioField,
  slider: SliderField,
  number: NumberField,
  time_range: TimeRangeField,
  timeline_marker: TimelineMarkerField,
};

/** Field types the renderer knows how to render, as a runtime guard set. */
const KNOWN_FIELD_TYPES = new Set<string>(Object.keys(FIELD_COMPONENTS));

export interface FieldRendererProps {
  /**
   * The field to render. Typed as `LabelField`, but the renderer also defends
   * against data whose `type` is outside the allowed set (Req 2.3): such fields
   * are skipped, never executed.
   */
  field: LabelField;
  value: unknown;
  onChange: (value: unknown) => void;
  id?: string;
}

/**
 * Renders a single schema field by mapping its `type` to a trusted component
 * via a fixed switch. Unknown/unsupported types are SKIPPED safely (render
 * nothing) rather than executed — satisfying render totality (Property 3).
 */
export function FieldRenderer({
  field,
  value,
  onChange,
  id,
}: FieldRendererProps) {
  // Defensive runtime guard: the type may be untrusted data. If it is not a
  // known field type, skip it. We never index the registry with an arbitrary
  // value that could resolve to anything executable.
  const fieldType = field?.type as string | undefined;
  if (!fieldType || !KNOWN_FIELD_TYPES.has(fieldType)) {
    return null;
  }

  // Explicit, exhaustive switch over the allowed FieldType values. Each arm
  // names a concrete, hand-built component — there is no data-driven dispatch.
  switch (fieldType as FieldType) {
    case "text":
      return <TextField field={field} value={value} onChange={onChange} id={id} />;
    case "textarea":
      return (
        <TextAreaField field={field} value={value} onChange={onChange} id={id} />
      );
    case "select":
      return (
        <SelectField field={field} value={value} onChange={onChange} id={id} />
      );
    case "multiselect":
      return (
        <MultiSelectField
          field={field}
          value={value}
          onChange={onChange}
          id={id}
        />
      );
    case "checkbox":
      return (
        <CheckboxField field={field} value={value} onChange={onChange} id={id} />
      );
    case "radio":
      return (
        <RadioField field={field} value={value} onChange={onChange} id={id} />
      );
    case "slider":
      return (
        <SliderField field={field} value={value} onChange={onChange} id={id} />
      );
    case "number":
      return (
        <NumberField field={field} value={value} onChange={onChange} id={id} />
      );
    case "time_range":
      return (
        <TimeRangeField field={field} value={value} onChange={onChange} id={id} />
      );
    case "timeline_marker":
      return (
        <TimelineMarkerField
          field={field}
          value={value}
          onChange={onChange}
          id={id}
        />
      );
    default:
      // Unreachable for valid FieldType values; skip safely for anything else.
      return null;
  }
}

export { FIELD_COMPONENTS, KNOWN_FIELD_TYPES };
