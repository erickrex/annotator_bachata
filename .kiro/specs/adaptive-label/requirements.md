# Requirements Document

## Introduction

AdaptiveLabel is a B2B web application that generates task-specific video
labeling workspaces from a plain-English dataset description. An AI model
produces a validated configuration object (a schema), and a deterministic
renderer turns that configuration into a working labeling studio with a
domain-appropriate timeline. The product is demonstrated on two contrasting
human-movement domains — bachata dance (a musical beat-grid timeline) and sign
language (a gloss-segment timeline) — both driven by the same engine and the
same database schema.

The application is built with Next.js, deployed on Vercel, and backed by Aurora
PostgreSQL (with the pgvector extension) as the primary database. The Vercel AI
SDK is used for schema generation, optional pre-labeling, and offline embedding
generation. This is a time-boxed hackathon build; requirements are organized so
that the Tier 1 "core spine" can ship completely before any Tier 2 work begins.

This document is derived from `adaptive_label_hackathon.md` (the implementation
plan). Where the two differ, the plan's tiered scope governs priority.

### Priority tiers
- **Tier 1 (core spine):** Requirements 1–8. Must ship.
- **Tier 2 (should-have):** Requirements 9–11. Only after Tier 1 is deployed.

### Global constraints (apply to all requirements)
- AI generation MUST produce validated configuration/structured data that feeds
  trusted, hand-built components. The system MUST NOT generate or execute UI code
  at runtime.
- The runtime MUST NOT perform live media processing (no ffmpeg, Remotion, or
  Python at request time). All media-derived data and embeddings are pre-computed
  offline and seeded.
- Embeddings MUST NOT be computed in the request path.
- Sign language MUST be framed as a dataset annotation workspace, not a
  translator or recognizer.

---

---

## Glossary

- **WorkspaceSchema:** the Zod-validated configuration object describing a
  labeling workspace (domain, name, timeline mode, fields, workflow stages).
- **Timeline mode:** an enum (`beat_grid`, `phase_rep`, `gloss_segments`) that
  selects which timeline module the renderer mounts.
- **Deterministic renderer:** the fixed component switch that turns a validated
  schema into UI without executing generated code.
- **Gloss:** a written label for a single sign in sign-language annotation.
- **pgvector:** the PostgreSQL extension used in Aurora for vector similarity
  search over clip embeddings.
- **Seeded data:** media-derived data (beat grids, gloss segments, embeddings)
  computed offline and loaded into Aurora; never produced at request time.

## Requirements

## Requirement 1 — AI Workspace Schema Generation

**User Story:** As a directory/dataset owner, I want to describe my dataset in
plain English and receive a generated labeling schema, so that I can create a
custom workspace without configuring fields by hand.

#### Acceptance Criteria
1. WHEN a user submits a free-text dataset description THEN the system SHALL call
   the AI SDK with the `WorkspaceSchema` Zod schema as the structured output
   contract and return a schema object.
2. WHEN the model returns output THEN the system SHALL validate it against the
   `WorkspaceSchema` Zod schema before any persistence.
3. IF the model output fails Zod validation THEN the system SHALL reject the
   result and surface an error WITHOUT persisting any partial schema.
4. WHEN a description implies a rhythmic/musical movement domain THEN the
   generated schema's `timelineMode` SHALL be `beat_grid`.
5. WHEN a description implies sign language THEN the generated schema's
   `timelineMode` SHALL be `gloss_segments`.
6. WHEN a schema is generated THEN every field SHALL use only the allowed
   `FieldType` enum values, and the field set SHALL contain between 3 and 24
   fields.
7. WHEN the user accepts a generated schema THEN the system SHALL persist it to
   Aurora as an immutable version (a `label_schemas` row plus its `label_fields`
   rows) and record the originating generation prompt.
8. WHERE a streaming wizard is used, WHEN generation is in progress THEN the
   system SHALL stream partial schema fields to the client as they are produced.
9. IF the live model call fails THEN the system SHALL fall back to a deterministic
   preset for the demo domains so the workflow does not hard-fail.

---

## Requirement 2 — Deterministic Schema-Driven Renderer

**User Story:** As an annotator, I want the labeling form and controls to be
generated from the active schema, so that each workspace shows exactly the fields
and controls relevant to its domain.

#### Acceptance Criteria
1. WHEN a workspace is opened THEN the system SHALL read the active schema version
   from Aurora and render its fields.
2. WHEN rendering a field THEN the system SHALL map each `FieldType` to a single
   trusted, pre-built component via a fixed switch (no dynamic code execution).
3. IF a schema references a field type that is not in the allowed set THEN the
   renderer SHALL ignore or safely skip it rather than execute arbitrary content.
4. WHEN fields define a `group` THEN the renderer SHALL render fields organized by
   their group/section.
5. WHEN a field defines `options`, `min`, or `max` THEN the renderer SHALL apply
   those constraints in the rendered control.
6. WHEN the schema specifies a `timelineMode` THEN the renderer SHALL mount the
   corresponding timeline module (see Requirement 3).

---

## Requirement 3 — Multi-Domain Adaptivity (Bachata + Sign Language)

**User Story:** As a viewer of the demo, I want two visibly different domains to
run on the same engine, so that the adaptivity of the platform is obvious.

#### Acceptance Criteria
1. WHEN the active schema's `timelineMode` is `beat_grid` THEN the workspace SHALL
   render the beat-grid timeline (beat markers and 8/16/32-count phrase display)
   for the bachata domain.
2. WHEN the active schema's `timelineMode` is `gloss_segments` THEN the workspace
   SHALL render the gloss-segment timeline (sign boundaries and phrase grouping)
   for the sign-language domain.
3. WHEN switching between the bachata project and the sign-language project THEN
   the system SHALL use the same renderer and the same database schema, differing
   only by the stored configuration.
4. WHEN the bachata workspace is rendered THEN it SHALL use seeded beat-grid data
   produced offline (no live audio analysis at runtime).
5. WHEN the sign-language workspace is rendered THEN it SHALL use seeded
   gloss-segment data produced offline.

---

## Requirement 4 — Annotation Capture and Persistence

**User Story:** As an annotator, I want to label a clip and save my work, so that
annotations are durably stored for export and review.

#### Acceptance Criteria
1. WHEN an annotator edits field values for a clip THEN the system SHALL maintain
   the working annotation state for that clip.
2. WHEN an annotator submits an annotation THEN the system SHALL validate it
   against the active schema (required fields, enum membership, numeric ranges)
   before persisting.
3. IF validation fails THEN the system SHALL block submission and report which
   fields/rules failed.
4. WHEN an annotation passes validation THEN the system SHALL persist it to the
   `annotations` table in Aurora with its source (`human`), schema version, and
   status.
5. WHEN an annotation is saved THEN the stored values SHALL conform to the field
   keys defined by the active schema version.

---

## Requirement 5 — Semantic Clip Retrieval (pgvector)

**User Story:** As a user exploring a dataset, I want to find clips similar to a
given clip, so that I can navigate and curate movement data by similarity.

#### Acceptance Criteria
1. WHERE the database is provisioned, the system SHALL enable the pgvector
   extension and store a `vector` embedding column on clips.
2. WHEN demo data is seeded THEN clip embeddings SHALL be computed offline (via the
   AI SDK embedding model) from each clip's text representation and stored on the
   clip rows.
3. WHEN a user requests "find similar clips" for a given clip THEN the system SHALL
   run a cosine-distance vector query in Aurora and return the nearest clips.
4. WHEN returning similar clips THEN the system SHALL support returning matches
   from across domains (cross-domain similarity), not only the same project.
5. WHEN a similarity query runs THEN the system SHALL NOT compute any embedding in
   the request path.
6. WHERE sufficient rows exist, the system SHALL back the similarity query with a
   vector index (e.g., HNSW) and the `vector(N)` dimension SHALL match the
   embedding model.

---

## Requirement 6 — Dataset Export (JSONL)

**User Story:** As an ML engineer, I want to export labeled annotations as a
machine-readable dataset, so that I can use them to train or evaluate models.

#### Acceptance Criteria
1. WHEN a user requests an export THEN the system SHALL produce a JSONL file where
   each line is one annotation record.
2. WHEN producing an export record THEN it SHALL include the clip reference, the
   schema version, the annotation field values, and the annotation status.
3. WHEN an export is generated THEN the system SHALL make the resulting artifact
   downloadable by the user.
4. WHEN an export is requested THEN the system SHALL record the export request in
   the `exports` table.

---

## Requirement 7 — Deployment and Data Backbone

**User Story:** As a hackathon submitter, I want the app deployed on Vercel and
backed by Aurora, so that judges can use a working public link that demonstrably
uses the required stack.

#### Acceptance Criteria
1. WHEN the application is deployed THEN it SHALL run on Vercel with a public URL.
2. WHEN the deployed application serves requests THEN it SHALL read from and write
   to Aurora PostgreSQL as the primary backend.
3. WHEN connecting to Aurora from serverless functions THEN the system SHALL use a
   connection approach suitable for serverless (e.g., pooling) to avoid connection
   exhaustion.
4. WHEN demo data is required THEN a seed process SHALL populate at least the
   bachata and sign-language projects, their clips, seeded timeline data, and
   embeddings.
5. WHEN environment configuration is needed THEN database URL, AI provider keys,
   and storage configuration SHALL be supplied via environment variables.

---

## Requirement 8 — Trust and Safety Constraints

**User Story:** As the platform owner, I want AI output constrained to validated
configuration and trusted components, so that the system is safe and the
architecture reads as deliberate rather than surface-level.

#### Acceptance Criteria
1. WHEN any AI output is received THEN the system SHALL validate it against a Zod
   schema before use or persistence.
2. The system SHALL NOT execute or render AI-generated executable code (React,
   JS, or CSS) at runtime.
3. WHEN rendering a workspace THEN all UI SHALL be produced from the fixed
   component registry/switch driven by validated configuration.
4. The runtime SHALL NOT invoke ffmpeg, Remotion, or Python during request
   handling.
5. WHEN demo media is presented THEN it SHALL be IP-clean (no copyrighted
   footage/music or third-party trademarks).

---

## Requirement 9 — Review and Approval Workflow (Tier 2, should-have)

**User Story:** As a reviewer, I want to approve or reject submitted annotations,
so that only quality-checked annotations are exported.

#### Acceptance Criteria
1. WHEN an annotation is submitted THEN it SHALL appear in a review queue.
2. WHEN a reviewer approves, requests changes, or rejects an annotation THEN the
   system SHALL update the annotation status accordingly.
3. WHEN a review decision is made THEN the system SHALL write an audit event
   (actor, decision, entity, timestamp) to the `audit_events` table.
4. WHERE review is enabled, WHEN exporting THEN the user SHALL be able to limit the
   export to approved annotations only.

---

## Requirement 10 — AI Pre-Labeling (Tier 2, should-have)

**User Story:** As an annotator, I want AI-drafted field values with confidence,
so that I can start from a draft instead of a blank form.

#### Acceptance Criteria
1. WHEN a user requests AI pre-labeling for a clip THEN the system SHALL send the
   active schema fields and seeded frame references to the AI SDK and request a
   structured array of field drafts.
2. WHEN drafts are returned THEN each draft SHALL include a field key, a value, a
   confidence between 0 and 1, and an evidence note.
3. WHEN drafts are stored THEN they SHALL be persisted as an annotation with
   source `ai_draft`, separate from human-submitted annotations.
4. WHEN a draft's confidence is low THEN the workspace SHALL visually highlight
   that field for human review.
5. WHEN a draft key does not match a field in the active schema THEN the system
   SHALL discard that draft entry.

---

## Requirement 11 — Additional Export Formats (Tier 2, should-have)

**User Story:** As an ML engineer, I want CSV and project-JSON exports in addition
to JSONL, so that I can consume the dataset in different toolchains.

#### Acceptance Criteria
1. WHEN a user selects CSV export THEN the system SHALL produce a CSV with a
   column per schema field plus clip and status columns.
2. WHEN a user selects project-JSON export THEN the system SHALL produce a single
   JSON document containing the schema version and all included annotations.
3. WHEN any export format is generated THEN it SHALL be recorded in the `exports`
   table and made downloadable.
