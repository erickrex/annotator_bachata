export {
  generateWorkspaceSchema,
  SCHEMA_GENERATION_SYSTEM_PROMPT,
  type GenerateTextFn,
  type GenerateWorkspaceSchemaDeps,
} from "./generateWorkspaceSchema";
export {
  generateWorkspaceSchemaStream,
  type StreamTextFn,
  type StreamErrorHandler,
  type GenerateWorkspaceSchemaStreamDeps,
} from "./generateWorkspaceSchemaStream";
export { SchemaValidationError } from "./errors";
export {
  selectFallbackDomain,
  selectFallbackPreset,
  type FallbackDomain,
} from "./fallback";
