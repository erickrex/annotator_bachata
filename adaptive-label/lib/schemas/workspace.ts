import { z } from "zod";

/**
 * Allowed field types for a generated labeling workspace. Each value maps to a
 * single trusted, pre-built component in the deterministic renderer.
 */
export const FieldType = z.enum([
  "text",
  "textarea",
  "select",
  "multiselect",
  "checkbox",
  "radio",
  "slider",
  "number",
  "time_range",
  "timeline_marker",
]);
export type FieldType = z.infer<typeof FieldType>;

/**
 * A single field in a workspace schema. `key` is the stable identifier used to
 * key annotation values; it must match `^[a-z0-9_]+$` and be unique within a
 * schema (uniqueness is enforced on `WorkspaceSchema`).
 */
export const LabelField = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  help: z.string().nullable(),
  type: FieldType,
  required: z.boolean().default(false),
  options: z.array(z.string()).nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  group: z.string().nullable(),
});
export type LabelField = z.infer<typeof LabelField>;

/**
 * Selects which timeline module the renderer mounts for a workspace.
 */
export const TimelineMode = z.enum(["beat_grid", "phase_rep", "gloss_segments"]);
export type TimelineMode = z.infer<typeof TimelineMode>;

/**
 * The single source of truth for generated workspace configuration. AI output
 * is validated against this schema before any persistence or rendering.
 *
 * Beyond the base shape, the schema enforces that field `key`s are unique
 * within a schema (Property 1). The base design schema only constrains the
 * field-array length and the per-field `key` regex, so uniqueness is added here
 * via `superRefine`.
 */
export const WorkspaceSchema = z
  .object({
    domain: z.string(),
    workspaceName: z.string(),
    timelineMode: TimelineMode,
    fields: z.array(LabelField).min(3).max(24),
    workflowStages: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate field key: ${field.key}`,
          path: ["fields", index, "key"],
        });
      }
      seen.add(field.key);
    });
  });
export type WorkspaceSchema = z.infer<typeof WorkspaceSchema>;

/**
 * Deterministic, domain-appropriate presets used as the live-generation
 * fallback (Req 1.9) and for seeding. Each preset is a valid `WorkspaceSchema`.
 */
export const PRESETS: Record<"bachata" | "sign_language", WorkspaceSchema> = {
  // Bachata dance: a musical beat-grid timeline.
  bachata: {
    domain: "bachata",
    workspaceName: "Bachata Move Annotation",
    timelineMode: "beat_grid",
    workflowStages: ["draft", "submitted", "approved"],
    fields: [
      {
        key: "move_name",
        label: "Move name",
        help: "The canonical name of the figure being danced.",
        type: "text",
        required: true,
        options: null,
        min: null,
        max: null,
        group: "Identification",
      },
      {
        key: "move_category",
        label: "Move category",
        help: "Broad category the move belongs to.",
        type: "select",
        required: true,
        options: ["basic", "turn", "footwork", "dip", "sensual", "musicality"],
        min: null,
        max: null,
        group: "Identification",
      },
      {
        key: "lead_follow_role",
        label: "Role emphasis",
        help: "Whose action the clip primarily showcases.",
        type: "radio",
        required: false,
        options: ["lead", "follow", "both"],
        min: null,
        max: null,
        group: "Identification",
      },
      {
        key: "difficulty",
        label: "Difficulty",
        help: "Relative difficulty from 1 (beginner) to 10 (advanced).",
        type: "slider",
        required: false,
        options: null,
        min: 1,
        max: 10,
        group: "Assessment",
      },
      {
        key: "phrase_count",
        label: "Phrase length (counts)",
        help: "Number of counts the move spans (e.g. 8, 16, 32).",
        type: "number",
        required: false,
        options: null,
        min: 1,
        max: 64,
        group: "Timing",
      },
      {
        key: "footwork_patterns",
        label: "Footwork patterns",
        help: "Footwork elements present in the clip.",
        type: "multiselect",
        required: false,
        options: ["tap", "syncopation", "side_step", "cross_body", "hammer"],
        min: null,
        max: null,
        group: "Assessment",
      },
      {
        key: "on_beat",
        label: "On beat",
        help: "Whether the dancers stay on the musical beat.",
        type: "checkbox",
        required: false,
        options: null,
        min: null,
        max: null,
        group: "Timing",
      },
      {
        key: "beat_marker",
        label: "Move start marker",
        help: "Marks the beat where the move begins on the timeline.",
        type: "timeline_marker",
        required: false,
        options: null,
        min: null,
        max: null,
        group: "Timing",
      },
      {
        key: "styling_notes",
        label: "Styling notes",
        help: "Free-text notes on styling, musicality, or execution.",
        type: "textarea",
        required: false,
        options: null,
        min: null,
        max: null,
        group: "Notes",
      },
    ],
  },

  // Sign language: a gloss-segment timeline (dataset annotation, not translation).
  sign_language: {
    domain: "sign_language",
    workspaceName: "Sign Language Gloss Annotation",
    timelineMode: "gloss_segments",
    workflowStages: ["draft", "submitted", "approved"],
    fields: [
      {
        key: "gloss",
        label: "Gloss",
        help: "Written label for the single sign in this segment.",
        type: "text",
        required: true,
        options: null,
        min: null,
        max: null,
        group: "Sign",
      },
      {
        key: "sign_type",
        label: "Sign type",
        help: "Lexical category of the sign.",
        type: "select",
        required: true,
        options: ["lexical", "fingerspelled", "classifier", "pointing", "gesture"],
        min: null,
        max: null,
        group: "Sign",
      },
      {
        key: "dominant_hand",
        label: "Dominant hand",
        help: "Which hand carries the sign.",
        type: "radio",
        required: false,
        options: ["right", "left", "both"],
        min: null,
        max: null,
        group: "Articulation",
      },
      {
        key: "handshapes",
        label: "Handshapes",
        help: "Handshapes observed during the sign.",
        type: "multiselect",
        required: false,
        options: ["flat", "fist", "open_8", "index", "cupped", "claw"],
        min: null,
        max: null,
        group: "Articulation",
      },
      {
        key: "two_handed",
        label: "Two-handed",
        help: "Whether the sign is articulated with both hands.",
        type: "checkbox",
        required: false,
        options: null,
        min: null,
        max: null,
        group: "Articulation",
      },
      {
        key: "non_manual_markers",
        label: "Non-manual markers",
        help: "Facial expression, head, or body markers accompanying the sign.",
        type: "textarea",
        required: false,
        options: null,
        min: null,
        max: null,
        group: "Articulation",
      },
      {
        key: "segment_marker",
        label: "Segment boundary",
        help: "Marks the start boundary of this gloss segment on the timeline.",
        type: "timeline_marker",
        required: false,
        options: null,
        min: null,
        max: null,
        group: "Timing",
      },
      {
        key: "clarity",
        label: "Clarity",
        help: "Annotator confidence in the gloss from 1 (unclear) to 5 (clear).",
        type: "slider",
        required: false,
        options: null,
        min: 1,
        max: 5,
        group: "Assessment",
      },
    ],
  },
};
