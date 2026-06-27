"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

/** Multi-line free-text input. */
export function TextAreaField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  return (
    <FieldShell field={field} htmlFor={controlId}>
      <textarea
        id={controlId}
        required={field.required}
        rows={4}
        value={typeof value === "string" ? value : ""}
        aria-describedby={field.help ? `${controlId}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
    </FieldShell>
  );
}
