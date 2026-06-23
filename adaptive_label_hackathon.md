# AdaptiveLabel Hackathon Implementation Plan

Last updated: June 14, 2026

## 1. Executive Summary

AdaptiveLabel is a B2B video annotation platform that creates a task-specific labeling workspace for each dataset type. Instead of forcing every team into one generic labeling UI, the product asks what kind of videos the team needs to label, generates a domain schema, renders the right controls, validates annotations, routes work through review, and exports production-ready datasets.

The strongest hackathon framing is:

> AdaptiveLabel: AI-assisted, schema-driven video labeling workspaces for teams building specialized video datasets.

This is not a generic Label Studio clone. The wedge is adaptive video labeling:

- Dance datasets need beat grids, phrase-aligned clip boundaries, entry/exit state, motion labels, stitchability, and rhythm-aware review.
- Physical therapy datasets need joint range, posture, exercise phase, pain markers, side of body, repetition quality, and clinician review.
- Warehouse safety datasets need incident timing, hazard type, worker posture, PPE compliance, zone, severity, and compliance audit trails.

The app should demonstrate that a single database-backed platform can generate and operate all three labeling workspaces from the same core model.

## 2. Hackathon Fit

H0 requires a full-stack application using Vercel or v0 for the frontend and one of the specified AWS Databases as the primary backend: Aurora PostgreSQL, Aurora DSQL, or DynamoDB. The Devpost page also asks for a published Vercel Project Link, Vercel Team ID, architecture diagram, and proof of AWS Database usage.

Source references:

- H0 overview: https://h01.devpost.com/
- H0 rules: https://h01.devpost.com/rules

Judging criteria to optimize for:

- Technological implementation: deliberate AWS Database data model, clean architecture, Vercel deployment beyond basics.
- Design: intuitive adaptive UX where frontend and backend feel intentionally connected.
- Impact and real-world applicability: solve a meaningful B2B data-labeling problem with a shippable workflow.
- Originality: adaptive labeling workspaces, not another static annotation dashboard.

Recommended track:

- Primary: Track 2, Monetizable B2B App.
- Backup: Track 4, Open Innovation, if the final demo leans more toward creative video workflows than enterprise labeling.

## 3. Realistic Winning Thesis

The winning version is not "v0 generates forms." The winning version is:

> v0 accelerates the design of custom labeling workspaces, while Aurora PostgreSQL stores the durable schema, annotations, review workflow, audit history, and export state.

To be credible, the generated/adaptive UI must be backed by:

- A real tenant/project/user model.
- A database-native schema definition system.
- A renderer that turns schemas into production labeling interfaces.
- A workflow engine for assignment, review, approval, rejection, and export.
- A video processing path for clip generation, thumbnails, waveform/beat metadata, and derived assets.
- A demo showing multiple domains on one platform.

## 4. Product Scope

### MVP Product Promise

Given a description of a video dataset, AdaptiveLabel creates:

- A domain-specific labeling schema.
- A purpose-built labeling UI.
- Validation rules.
- Review workflow.
- Export format.
- Dashboard for progress and quality.

### Demo Domains

Use three domains to prove adaptability:

1. Bachata dance movement labeling
   - Reuses the existing repo's strongest differentiator.
   - Shows beat-aware video segmentation and choreography-specific fields.

2. Physical therapy exercise review
   - Shows high-value B2B/healthcare-adjacent use case.
   - Avoid medical diagnosis claims. Position as dataset labeling and clinician review support.

3. Warehouse safety incident labeling
   - Shows enterprise compliance and operations use case.
   - Easy for judges to understand quickly.

## 5. User Personas

### Dataset Operations Manager

Owns data production for an AI team. Needs fast setup, clear progress, QA, reviewer assignment, and reliable exports.

### Domain Expert Annotator

Labels videos in a specific field. Needs a UI that matches their task vocabulary and minimizes irrelevant fields.

### Reviewer / QA Lead

Approves or rejects annotations, checks consistency, resolves disagreements, and exports approved datasets.

### ML Engineer

Consumes the exported dataset. Needs stable JSONL/CSV exports, media URLs, train/validation/test splits, and schema versioning.

## 6. Core User Flows

### Flow 1: Create Adaptive Workspace

1. User creates an organization and project.
2. User describes the dataset:
   - "I need to label bachata dance clips for movement retrieval and choreography generation."
   - "I need to label physical therapy knee rehab videos."
   - "I need to label warehouse safety incidents."
3. AI suggests:
   - Project name.
   - Label schema.
   - Field types.
   - Validation rules.
   - Workflow stages.
   - Export template.
4. User accepts or edits the generated schema.
5. App persists the schema in Aurora PostgreSQL.
6. The labeling UI is rendered from the schema.

### Flow 2: Upload and Prepare Videos

1. User uploads one or more videos.
2. App stores source media in object storage.
3. App creates media asset records in the database.
4. Worker generates thumbnails, preview clips, duration, fps, dimensions, and optional audio analysis.
5. For dance projects, worker creates beat-aligned clips and phrase metadata.
6. App creates labeling tasks from generated clips or full videos.

### Flow 3: AI Pre-Labeling

1. User clicks "Draft labels."
2. App sends frames, clip metadata, audio/beat metadata, and schema to an AI service.
3. AI returns structured field values, confidence scores, and evidence notes.
4. App validates output against the schema.
5. Low-confidence fields are highlighted for human review.
6. Draft labels are stored separately from approved annotations.

### Flow 4: Human Labeling

1. Annotator opens assigned task.
2. App renders the schema-specific labeling workspace.
3. Annotator reviews video, edits labels, and submits.
4. Validation runs before submission.
5. Task moves to review.

### Flow 5: Review and QA

1. Reviewer opens pending review queue.
2. Reviewer sees original AI draft, annotator edits, validation results, and task history.
3. Reviewer approves, requests changes, or rejects.
4. Audit events are written to the database.
5. Dashboard updates progress and quality metrics.

### Flow 6: Export Dataset

1. User chooses approved labels only or all labels with status.
2. User selects export format:
   - JSONL
   - CSV
   - Project JSON
   - Custom ML manifest
3. App creates an export job.
4. Worker generates export file and stores it.
5. User downloads the export or copies signed URL.

## 7. v0 Strategy

Use v0 for design acceleration and as part of the hackathon story, but do not make the product depend on unsafe runtime code generation.

Recommended implementation:

- Use v0 to scaffold the Next.js/Vercel UI shell.
- Use shadcn/ui-compatible components for consistency.
- Build a deterministic schema renderer for production behavior.
- Let AI generate database-backed schema configuration, not arbitrary live React code.
- Store generated workspace definitions in Aurora PostgreSQL.
- Render UI from trusted field/component types.

Allowed field/component types:

- Text input
- Text area
- Select
- Multi-select
- Checkbox
- Radio group
- Slider
- Number input
- Time range selector
- Timeline segment marker
- Video frame tag
- Beat/phrase marker
- Quality score
- Reviewer decision

Avoid for MVP:

- Runtime execution of AI-generated code.
- Arbitrary CSS/JS generated per customer.
- Multi-user real-time collaboration.
- Full plugin marketplace.

## 8. Existing Repo Reuse Plan

The current `annotator-bachata` repo already has valuable pieces:

- YouTube/video ingestion patterns.
- Audio analysis and beat grid logic.
- Cycle builder for 4/8/16/32 beat phrase segmentation.
- Clip generation.
- Annotation schema and validation concepts.
- Review UI concepts.
- Export concepts.

Recommended reuse:

- Extract service logic into a backend worker package where useful.
- Preserve bachata as the flagship domain preset.
- Reimplement the primary hackathon app as a Vercel-friendly Next.js application.
- Move local JSON persistence into Aurora PostgreSQL.
- Move local media files into object storage.
- Move long-running video work into worker jobs.

Do not rely on the current local-only architecture for the final deployed demo. Vercel functions should not perform long-running ffmpeg or Python analysis directly.

## 9. Target Architecture

### High-Level Components

- Vercel Next.js app
  - Landing/dashboard
  - Schema generation wizard
  - Video labeling workspace
  - Review queue
  - Export dashboard

- Aurora PostgreSQL
  - Source of truth for tenants, users, projects, schemas, tasks, annotations, jobs, exports, and audit events.

- Object storage
  - Stores uploaded videos, thumbnails, extracted clips, export files, and generated preview artifacts.

- Worker runtime
  - Performs video probing, thumbnail generation, optional ffmpeg clip extraction, audio/beat analysis, and export generation.
  - For hackathon MVP, this can be a small separate Node worker or server job runner. For a production architecture diagram, show ECS/Fargate or Lambda depending on implementation feasibility.

- AI service
  - Generates schema drafts.
  - Drafts annotations from video evidence and metadata.
  - Produces field confidence and evidence notes.

### Request Flow

1. User interacts with Vercel-hosted Next.js UI.
2. Next.js API routes read/write Aurora PostgreSQL.
3. Video uploads go to object storage through signed URLs.
4. API creates processing jobs in Aurora PostgreSQL.
5. Worker claims queued jobs, processes media, writes derived assets, and updates job status.
6. Labeling UI renders from schema stored in Aurora PostgreSQL.
7. Annotation submissions write to Aurora PostgreSQL.
8. Export jobs create downloadable dataset files.

## 10. Database Choice

Recommended: Aurora PostgreSQL.

Reasons:

- Strong fit for relational B2B workflow state.
- Good for schema versioning, review history, permissions, and export joins.
- Easier to demonstrate deliberate data modeling than DynamoDB for this use case.
- Better fit for querying annotation progress, task status, project metrics, and exports.

Potential future extension:

- Use pgvector if available and appropriate for label memory or semantic retrieval.
- Keep this optional. Do not make vector search required for the MVP.

## 11. Data Model

### organizations

- id
- name
- slug
- plan
- created_at
- updated_at

### users

- id
- email
- display_name
- created_at
- updated_at

### organization_members

- organization_id
- user_id
- role: owner, admin, annotator, reviewer, viewer
- created_at

### projects

- id
- organization_id
- name
- description
- domain: dance, physical_therapy, warehouse_safety, custom
- status: draft, active, archived
- created_by
- created_at
- updated_at

### label_schemas

- id
- project_id
- version
- name
- description
- status: draft, active, retired
- generation_prompt
- created_by
- created_at
- activated_at

### label_fields

- id
- schema_id
- key
- label
- description
- field_type
- required
- order_index
- config_json
- validation_json

### workflow_stages

- id
- project_id
- key
- label
- order_index
- config_json

### media_assets

- id
- project_id
- original_filename
- storage_key
- media_type
- duration_seconds
- fps
- width
- height
- status: uploaded, processing, ready, failed
- metadata_json
- created_at

### derived_assets

- id
- media_asset_id
- asset_type: thumbnail, preview_clip, waveform, extracted_clip, export
- storage_key
- metadata_json
- created_at

### audio_analysis

- id
- media_asset_id
- bpm
- bpm_confidence
- downbeat_offset_seconds
- beat_grid_json
- beat_grid_frames_json
- energy_profile_json
- created_at

### clips

- id
- project_id
- media_asset_id
- clip_index
- start_frame
- end_frame
- start_seconds
- end_seconds
- duration_seconds
- beat_count
- phrase_index
- status: draft, ready, discarded
- metadata_json
- created_at

### labeling_tasks

- id
- project_id
- media_asset_id
- clip_id
- schema_id
- assigned_to
- status: queued, in_progress, submitted, changes_requested, approved, rejected
- priority
- due_at
- created_at
- updated_at

### annotations

- id
- task_id
- schema_id
- author_id
- source: human, ai_draft, import
- status: draft, submitted, approved, rejected
- values_json
- confidence_json
- validation_json
- created_at
- updated_at

### annotation_reviews

- id
- annotation_id
- reviewer_id
- decision: approved, changes_requested, rejected
- notes
- created_at

### audit_events

- id
- organization_id
- project_id
- actor_id
- event_type
- entity_type
- entity_id
- before_json
- after_json
- created_at

### ai_runs

- id
- project_id
- task_id
- run_type: schema_generation, pre_label, review_assist
- model
- prompt_json
- output_json
- status: queued, running, succeeded, failed
- error_message
- created_at
- completed_at

### jobs

- id
- project_id
- job_type: probe_media, generate_thumbnail, analyze_audio, generate_clips, pre_label, export_dataset
- status: queued, running, succeeded, failed
- input_json
- output_json
- error_message
- created_at
- started_at
- completed_at

### exports

- id
- project_id
- requested_by
- format: jsonl, csv, project_json, custom_manifest
- status: queued, running, succeeded, failed
- storage_key
- filters_json
- created_at
- completed_at

## 12. Domain Presets

### Dance Preset

Purpose: label human movement clips for choreography retrieval, video generation datasets, and instruction products.

Special UI:

- Video player
- Beat markers
- 8/16/32 count phrase display
- Clip trimming by beat
- Entry/exit state sections
- Movement profile
- Camera quality
- Stitchability score

Core fields:

- move_label
- move_family
- style
- difficulty
- energy_level
- entry_hold
- exit_hold
- entry_position
- exit_position
- rotation_direction
- travel_direction
- spin_count
- bodywave
- dip
- visibility_score
- stitchability

### Physical Therapy Preset

Purpose: label exercise videos for rehab dataset creation and clinician QA.

Special UI:

- Rep counter
- Phase markers: setup, concentric, hold, eccentric, rest
- Side of body selector
- Pain/discomfort marker
- Range quality score
- Clinician review panel

Core fields:

- exercise_type
- body_region
- side
- rep_count
- form_quality
- range_of_motion_score
- compensation_observed
- pain_marker_present
- assistance_level
- review_required

Safety note: demo language should avoid diagnosis or treatment claims. Position it as annotation workflow software.

### Warehouse Safety Preset

Purpose: label industrial and warehouse videos for compliance, safety training, and incident detection datasets.

Special UI:

- Timeline incident marker
- Hazard category selector
- PPE checklist
- Zone selector
- Severity rating
- Compliance notes

Core fields:

- incident_type
- hazard_category
- ppe_compliance
- worker_posture
- zone
- severity
- near_miss
- equipment_involved
- visibility_score
- escalation_required

## 13. Adaptive Schema Generation

### Inputs

- Dataset description
- Industry/domain
- Labeling goal
- Intended model/use case
- Required export format
- Compliance needs
- Example labels or uploaded sample

### AI Output

The AI should return:

- Project domain
- Recommended schema name
- Field definitions
- Field groups
- Field types
- Options for enum fields
- Validation rules
- Suggested workflow stages
- Suggested QA checks
- Suggested export mapping

### Guardrails

- AI output must validate against a strict schema.
- Users must approve before activation.
- Once active, schema versions are immutable.
- New edits create a new schema version.
- Existing annotations remain tied to their original schema version.

## 14. Schema Renderer

Build a deterministic renderer:

- Reads active `label_schemas` and `label_fields`.
- Groups fields by section.
- Renders approved component types only.
- Applies validation rules before submission.
- Stores values as JSON while preserving field metadata in relational tables.

Renderer responsibilities:

- Display field labels and help text.
- Render domain-specific video controls when the schema requires them.
- Validate required fields, ranges, enums, and conditional rules.
- Show AI confidence and evidence when available.
- Track dirty state and autosave draft annotations.

## 15. AI Pre-Labeling Plan

### MVP

For each task:

1. Select representative frames or preview clip metadata.
2. Include schema and field definitions.
3. Ask AI to return JSON values only.
4. Validate values against schema.
5. Store as an `annotations` row with `source = ai_draft`.
6. Render AI draft in the labeling UI.

### Confidence Model

Each field should have:

- value
- confidence: 0.0 to 1.0
- evidence: short explanation
- needs_review: boolean

### UI Behavior

- High confidence: prefill normally.
- Medium confidence: prefill with subtle warning.
- Low confidence: highlight for review.
- Invalid output: show empty field and log validation error.

## 16. UI Plan

### Navigation

- Dashboard
- Projects
- Project detail
- Schema builder
- Media library
- Labeling queue
- Review queue
- Exports
- Settings

### Key Screens

#### Landing / Product Page

Goal: explain the product in 20 seconds.

Hero message:

> Custom video labeling workspaces generated from your dataset needs.

CTA:

- Create adaptive workspace
- View demo projects

#### Project Creation Wizard

Steps:

1. Describe dataset.
2. Choose domain preset or custom.
3. Review generated schema.
4. Choose workflow.
5. Create project.

#### Schema Builder

Features:

- Field list
- Field preview
- Add/edit/delete fields
- Validation config
- Version activation
- Domain UI modules toggle

#### Media Library

Features:

- Upload video
- Show processing status
- Show thumbnails
- Show duration, fps, dimensions
- Create tasks from full video or clips

#### Labeling Workspace

Layout:

- Left: task queue and status.
- Center: video player and timeline.
- Right: adaptive label form.
- Bottom: validation, AI draft notes, submit controls.

Domain-specific modules:

- Dance: beat grid and phrase labels.
- Physical therapy: rep/phase markers.
- Warehouse safety: incident timeline markers.

#### Review Queue

Features:

- Pending annotations
- Diff AI draft vs human edit
- Reviewer notes
- Approve/request changes/reject
- Audit history

#### Dashboard

Metrics:

- Videos uploaded
- Tasks queued
- Tasks submitted
- Tasks approved
- Average completion time
- AI draft acceptance rate
- Review rejection rate
- Export count

#### Export Center

Features:

- Format selector
- Filter approved labels
- Include/exclude AI drafts
- Generate export
- Download export
- Show export history

## 17. Implementation Phases

### Phase 0: Scope Lock

Duration: 0.5 day

Tasks:

- Confirm target track: B2B primary, Open Innovation backup.
- Choose Aurora PostgreSQL.
- Pick final product name.
- Pick three demo domains.
- Decide which AI features are real vs mocked.
- Choose deployment architecture.

Exit criteria:

- One-page pitch locked.
- Data model locked enough to implement.
- Demo script outline approved.

### Phase 1: New Vercel App Foundation

Duration: 1 day

Tasks:

- Create Next.js app intended for Vercel deployment.
- Use v0-generated UI shell or manually import v0/shadcn-inspired components.
- Add authentication stub or lightweight demo login.
- Add project dashboard shell.
- Add environment variable structure.
- Add database connection layer.

Exit criteria:

- App deploys to Vercel.
- Can connect to Aurora PostgreSQL.
- Can render dashboard and project pages.

### Phase 2: Aurora Schema and Core CRUD

Duration: 1 to 1.5 days

Tasks:

- Create migration system.
- Implement organizations, users, projects.
- Implement label schemas and label fields.
- Implement media assets, clips, tasks, annotations.
- Implement audit events.
- Seed demo organization and demo projects.

Exit criteria:

- Database migrations run cleanly.
- Demo projects can be created and loaded.
- Schema definitions persist in Aurora.

### Phase 3: Adaptive Schema Wizard

Duration: 1 to 1.5 days

Tasks:

- Build dataset description wizard.
- Add preset generator for three demo domains.
- Add AI schema generation if time permits.
- Add schema review/edit screen.
- Add schema activation/versioning.

Exit criteria:

- User can create a project from a natural language dataset description.
- User can review and activate generated schema.
- App renders correct field definitions from database.

### Phase 4: Schema-Driven Label Renderer

Duration: 1.5 days

Tasks:

- Build field renderer for approved field types.
- Build form validation.
- Build autosave draft annotation.
- Build submit workflow.
- Build status transitions.
- Add confidence/evidence display for AI draft fields.

Exit criteria:

- Same renderer supports all three demo domains.
- Annotation values save to Aurora.
- Required fields and enum/range validation work.

### Phase 5: Media and Video Workflow

Duration: 1.5 to 2 days

Tasks:

- Implement media upload path.
- Store media metadata.
- Generate or seed thumbnails/previews for demo.
- Implement task creation from video or clips.
- Integrate existing bachata beat/clip logic for dance preset if feasible.
- If full processing is too risky, seed processing outputs in Aurora and use short demo media.

Exit criteria:

- User can see media assets.
- User can create labeling tasks.
- Dance demo shows beat/phrase-aware clips.
- Physical therapy and warehouse demos show task-specific video controls.

### Phase 6: AI Draft Labels

Duration: 1 day

Tasks:

- Implement AI run table.
- Add "Draft labels" action.
- Send schema and media evidence to AI service or deterministic demo generator.
- Validate structured output.
- Store AI draft annotation.
- Display field confidence and evidence.

Exit criteria:

- AI draft labels appear in the adaptive form.
- User can accept/edit AI draft.
- Low-confidence fields are highlighted.

### Phase 7: Review, QA, and Audit Trail

Duration: 1 day

Tasks:

- Build review queue.
- Add approve/request changes/reject.
- Add review notes.
- Add audit event writing.
- Add dashboard metrics.

Exit criteria:

- Annotator can submit.
- Reviewer can approve/reject.
- Dashboard reflects task status.
- Audit history is visible.

### Phase 8: Export Center

Duration: 0.5 to 1 day

Tasks:

- Implement JSONL export.
- Implement CSV export.
- Implement project JSON export.
- Store export records in Aurora.
- Create downloadable export artifact.

Exit criteria:

- User can export approved annotations.
- Export includes media references, task IDs, schema version, labels, status, and metadata.

### Phase 9: Polish and Hackathon Submission Assets

Duration: 1 day

Tasks:

- Improve UI spacing, empty states, loading states, and errors.
- Add architecture diagram.
- Add AWS Database proof screenshot.
- Add Vercel project link and team ID.
- Record under 3-minute demo video.
- Write Devpost description.
- Prepare optional public build article for bonus points.

Exit criteria:

- Demo can be run end to end without manual database edits.
- Submission checklist is complete.

## 18. MVP Cut Line

Must have:

- Vercel deployed app.
- Aurora PostgreSQL integrated as primary backend.
- Adaptive project creation wizard.
- At least three domain schemas.
- Schema-driven labeling UI.
- Video player.
- Annotation save/submit/review.
- Export approved annotations.
- Architecture diagram and AWS DB proof.

Should have:

- AI schema generation.
- AI pre-labeling.
- Dashboard metrics.
- Audit history.
- Dance beat-aware clip view.

Nice to have:

- Real media processing workers.
- Full beat analysis in deployed environment.
- Multi-user auth.
- Semantic search over tasks.
- Model evaluation metrics.

Explicitly cut if time is tight:

- Arbitrary runtime UI code generation.
- Full ffmpeg render/export in cloud.
- Real-time collaborative labeling.
- Payment/subscription flow.
- Full enterprise permission model.

## 19. Hackathon Demo Script

Target length: 2 minutes 45 seconds.

### 0:00 to 0:20 - Problem

"Companies building video AI need labeled datasets, but generic labeling tools force every domain into the same interface. A dance dataset, a rehab dataset, and a warehouse safety dataset should not use the same labeling workspace."

### 0:20 to 0:45 - Create Adaptive Workspace

Show project wizard:

- Type: "Label bachata dance clips for movement retrieval and choreography generation."
- App generates fields, validation rules, and workflow.
- User activates schema.

### 0:45 to 1:15 - Dance Labeling

Show dance workspace:

- Video player.
- Beat/phrase metadata.
- Movement labels.
- Entry/exit state.
- Stitchability score.
- AI draft confidence.

### 1:15 to 1:45 - Prove Adaptability

Switch projects:

- Physical therapy project with rep/phase/range-of-motion fields.
- Warehouse safety project with incident/PPE/severity fields.

Emphasize that these are generated from database-backed schemas, not hardcoded separate apps.

### 1:45 to 2:10 - Review and QA

Show review queue:

- Human annotation.
- AI draft.
- Reviewer decision.
- Audit event.

### 2:10 to 2:30 - Export

Show export center:

- Approved labels only.
- JSONL export.
- Download artifact.

### 2:30 to 2:45 - Architecture

Show diagram:

- Vercel/v0 frontend.
- Aurora PostgreSQL.
- Object storage.
- Worker jobs.
- AI pre-labeling.

End with:

"AdaptiveLabel turns dataset requirements into production labeling workspaces, with Aurora as the durable workflow and schema backbone."

## 20. Devpost Positioning

### Project Tagline

AI-assisted adaptive video labeling workspaces for specialized datasets.

### Short Description

AdaptiveLabel lets B2B teams create a custom video labeling workspace from a plain-English dataset description. The app generates a schema, renders a task-specific labeling UI, drafts labels with AI, routes work through human review, and exports approved datasets. It uses Vercel/v0 for the frontend and Aurora PostgreSQL as the source of truth for schemas, tasks, annotations, reviews, audit events, and exports.

### Problem

Companies building video AI often need custom annotation tools for each dataset. Generic platforms are flexible but slow to configure, hard for domain experts to use, and weak at domain-specific video workflows.

### Solution

AdaptiveLabel creates a labeling workspace that matches the video domain. Dance teams get beat-aware movement labels. Rehab teams get rep and movement-quality labels. Safety teams get incident and compliance labels. All workflows share one production-grade database model.

### Why This Stack

- v0/Vercel: fast creation and deployment of polished adaptive frontends.
- Aurora PostgreSQL: durable relational source of truth for multi-tenant B2B workflow state.
- Object storage: scalable media and export storage.
- Worker jobs: reliable processing for video-derived assets and exports.

## 21. Technical Risks and Mitigations

### Risk: Scope too large

Mitigation:

- Use seeded media and processing outputs where necessary.
- Prioritize schema renderer, Aurora model, and demo workflows.
- Keep video processing minimal for hackathon.

### Risk: v0 framing looks superficial

Mitigation:

- Show generated/adaptive UI driven by database schemas.
- Explain that v0 accelerated UI creation, but Aurora powers the product behavior.

### Risk: AI output unreliable

Mitigation:

- Validate all AI output.
- Require human approval.
- Store AI draft separately from approved annotations.
- Use deterministic preset fallback for demo.

### Risk: Media processing fails on deployment

Mitigation:

- Do not run long ffmpeg jobs inside Vercel functions.
- Use preprocessed demo media or a separate worker.
- Keep deployed demo focused on labeling workflow.

### Risk: Looks like Label Studio clone

Mitigation:

- Lead with adaptive workspaces.
- Show three domain-specific interfaces.
- Emphasize schema generation, review workflow, and domain modules.

## 22. Success Metrics

### Product Metrics

- Time to create a new labeling workspace.
- Time to first submitted annotation.
- Percent of fields prefilled by AI.
- AI draft acceptance rate.
- Review approval rate.
- Export generation time.

### Hackathon Metrics

- Demo completes in under 3 minutes.
- Judges understand problem in under 20 seconds.
- Aurora data model is visible and deliberate.
- UI feels polished and domain-specific.
- App shows at least three distinct domains from one platform.

## 23. Submission Checklist

- [ ] Vercel deployed app.
- [ ] Vercel Project Link.
- [ ] Vercel Team ID.
- [ ] Aurora PostgreSQL database provisioned.
- [ ] AWS Database proof screenshot.
- [ ] Architecture diagram.
- [ ] Less than 3-minute demo video.
- [ ] Devpost text description naming AWS Database used.
- [ ] Public repo or accessible source, depending on submission preference.
- [ ] License file if repo is public.
- [ ] Optional public build article for bonus points.

## 24. Recommended Next Steps

1. Decide whether to build inside this repo or create a new `adaptive-label` Next.js app.
2. Lock Aurora PostgreSQL as the database.
3. Generate the first v0 UI for the dashboard, project wizard, and labeling workspace.
4. Create database migrations for the core schema.
5. Seed three demo projects and schemas.
6. Build the schema renderer.
7. Add annotation submit/review/export.
8. Integrate the bachata beat-aware experience as the flagship domain demo.
9. Deploy to Vercel.
10. Record the demo and prepare Devpost materials.

