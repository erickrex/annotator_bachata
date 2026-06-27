"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

/** Single-line text input. */
export function TextField({ field, value, onChange, id }: FieldComponentProps) {
  const controlId = id ?? field.key;
  return (
    <FieldShell field={field} htmlFor={controlId}>
      <input
        id={controlId}
        type="text"
        required={field.required}
        value={typeof value === "string" ? value : ""}
        aria-describedby={field.help ? `${controlId}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
    </FieldShell>
  );
}
