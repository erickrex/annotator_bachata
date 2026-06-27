import type { z } from "zod";

/**
 * Raised when model output cannot be validated against `WorkspaceSchema`
 * (Requirement 1.3 / 8.1). This is deliberately distinct from a provider/
 * network failure: a validation failure must surface a structured error and
 * persist nothing, whereas a provider failure falls back to a deterministic
 * preset (Requirement 1.9). Callers (e.g. the route handler) branch on this
 * type to decide between a 422 response and the preset fallback.
 */
export class SchemaValidationError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[] = []) {
    super(message);
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}
