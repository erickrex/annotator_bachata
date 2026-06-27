import * as React from "react";

import { cn } from "@/lib/utils";
import type { LabelField } from "@/lib/schemas/workspace";

interface FieldShellProps {
  field: LabelField;
  /** The DOM id of the control this label points at. */
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Renders the label, required marker, and help text around a field's control.
 * Pure presentation: every string it renders comes from validated schema
 * configuration and is rendered as text, never executed.
 */
export function FieldShell({
  field,
  htmlFor,
  children,
  className,
}: FieldShellProps) {
  const helpId = field.help ? `${htmlFor}-help` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-foreground"
      >
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
      {children}
    </div>
  );
}
