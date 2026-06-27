"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

/**
 * A single timeline position marker (beat/frame/second index). The full
 * timeline-aware picker is wired by the timeline modules (Task 8.3); this is the
 * trusted form control that captures and edits the marker's numeric position
 * and honors `field.min`/`field.max`.
 */
export function TimelineMarkerField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  const current = typeof value === "number" ? value : "";
  return (
    <FieldShell field={field} htmlFor={controlId}>
      <input
        id={controlId}
        type="number"
        inputMode="numeric"
        required={field.required}
        min={field.min ?? undefined}
        max={field.max ?? undefined}
        value={current}
        aria-describedby={field.help ? `${controlId}-help` : undefined}
        placeholder="marker position"
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === "" ? null : Number(next));
        }}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
    </FieldShell>
  );
}
