"use client";

import * as React from "react";

import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

/** Range slider honoring `field.min`/`field.max`. */
export function SliderField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  // Keep the control within bounds; default to the minimum when unset.
  const current = typeof value === "number" ? value : min;
  return (
    <FieldShell field={field} htmlFor={controlId}>
      <div className="flex items-center gap-3">
        <input
          id={controlId}
          type="range"
          min={min}
          max={max}
          value={current}
          required={field.required}
          aria-describedby={field.help ? `${controlId}-help` : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
          {current}
        </span>
      </div>
    </FieldShell>
  );
}
