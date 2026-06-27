"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { FieldComponentProps } from "./types";

/** A single boolean checkbox. */
export function CheckboxField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  const helpId = field.help ? `${controlId}-help` : undefined;
  const checked = value === true;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="flex items-center gap-2 text-sm font-medium">
        <input
          id={controlId}
          type="checkbox"
          checked={checked}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.checked)}
          className={cn(
            "h-4 w-4 rounded border border-input",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        {field.label}
        {field.required ? (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        ) : null}
      </label>
      {field.help ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}
