"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

/** Numeric input honoring `field.min`/`field.max`. */
export function NumberField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  return (
    <FieldShell field={field} htmlFor={controlId}>
      <input
        id={controlId}
        type="number"
        required={field.required}
        min={field.min ?? undefined}
        max={field.max ?? undefined}
        value={typeof value === "number" ? value : ""}
        aria-describedby={field.help ? `${controlId}-help` : undefined}
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
