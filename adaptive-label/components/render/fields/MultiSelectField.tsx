"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

/** Multi-choice control (checkbox group) driven by `field.options`. */
export function MultiSelectField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  const options = field.options ?? [];
  const selected = Array.isArray(value)
    ? (value.filter((v): v is string => typeof v === "string"))
    : [];

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <FieldShell field={field} htmlFor={controlId}>
      <div
        id={controlId}
        role="group"
        aria-describedby={field.help ? `${controlId}-help` : undefined}
        className="flex flex-col gap-1.5"
      >
        {options.map((option) => {
          const optionId = `${controlId}-${option}`;
          return (
            <label
              key={option}
              htmlFor={optionId}
              className="flex items-center gap-2 text-sm"
            >
              <input
                id={optionId}
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className={cn(
                  "h-4 w-4 rounded border border-input",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              />
              {option}
            </label>
          );
        })}
      </div>
    </FieldShell>
  );
}
