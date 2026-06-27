"use client";

import * as React from "react";

import { FieldShell } from "./FieldShell";
import type { FieldComponentProps } from "./types";

/** Single-choice radio group driven by `field.options`. */
export function RadioField({
  field,
  value,
  onChange,
  id,
}: FieldComponentProps) {
  const controlId = id ?? field.key;
  const options = field.options ?? [];
  const current = typeof value === "string" ? value : "";
  return (
    <FieldShell field={field} htmlFor={controlId}>
      <div
        id={controlId}
        role="radiogroup"
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
                type="radio"
                name={controlId}
                value={option}
                checked={current === option}
                onChange={() => onChange(option)}
                className="h-4 w-4 border border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {option}
            </label>
          );
        })}
      </div>
    </FieldShell>
  );
}
