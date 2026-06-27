"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

interface TimeRange {
  start: number | null;
  end: number | null;
}

function asRange(value: unknown): TimeRange {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return {
      start: typeof v.start === "number" ? v.start : null,
      end: typeof v.end === "number" ? v.end : null,
    };
  }
  return { start: null, end: null };
}

/** A start/end numeric range (in seconds), bounded by `field.min`/`field.max`. */
export function TimeRangeField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  const range = asRange(value);
  const min = field.min ?? undefined;
  const max = field.max ?? undefined;

  const inputClass = cn(
    "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  return (
    <FieldShell field={field} htmlFor={`${controlId}-start`}>
      <div
        className="flex items-center gap-2"
        aria-describedby={field.help ? `${controlId}-help` : undefined}
      >
        <input
          id={`${controlId}-start`}
          type="number"
          aria-label={`${field.label} start`}
          min={min}
          max={max}
          value={range.start ?? ""}
          onChange={(e) =>
            onChange({
              ...range,
              start: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          className={inputClass}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <input
          id={`${controlId}-end`}
          type="number"
          aria-label={`${field.label} end`}
          min={min}
          max={max}
          value={range.end ?? ""}
          onChange={(e) =>
            onChange({
              ...range,
              end: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          className={inputClass}
        />
      </div>
    </FieldShell>
  );
}
