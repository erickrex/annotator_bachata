# Bachata Choreography Director: Execution Risks and Mitigation Plan

Document status: implementation risk baseline  
Project: ChoreoGraph Director  
Target: Agentic Cinema hackathon, Replit track  
Primary architecture reference: `CHOREOGRAPH_DIRECTOR_TECHNICAL_IMPLEMENTATION_PLAN.md`  
Data foundation: `bachata_knowledge_base.example.json`

---

## 1. Purpose

This document converts the project's principal execution concerns into explicit engineering, product, compliance, evaluation, and demonstration controls.

The revised architecture substantially improves the project's agentic credibility, but architecture alone does not resolve the major risks. The project will succeed only if the implementation proves that:

1. The agent observes real tool results and changes its plan.
2. Clip compatibility is evaluated from actual source evidence rather than move labels alone.
3. Repairs are selected dynamically rather than hard-coded for the demonstration.
4. Physical and visual limitations are represented honestly.
5. The clip inventory contains enough alternatives to make repair useful.
6. Replit, Gemini, and Google Cloud are used materially and visibly.
7. The pre-existing data and every media asset are eligible and authorized.
8. The final output is visually strong enough to support the technical story.

The risk strategy is not to hide failures. The product should detect, explain, repair, or safely escalate them.

---

## 2. Rating system

### Probability

- **Low:** unlikely if normal controls are followed.
- **Medium:** plausible and should be actively tested.
- **High:** expected to occur without deliberate mitigation.
- **Unknown:** depends on an organizer, rights holder, external platform, or evidence not yet obtained.

### Impact

- **Medium:** degrades polish or narrows the feature set.
- **High:** substantially weakens judging, trust, or the core user experience.
- **Critical:** can invalidate the submission, destroy the main product claim, or prevent the demonstration from working.

### Required disposition

- **Prevent:** design the condition out of the authoritative workflow.
- **Detect:** identify it before render, submission, or public display.
- **Repair:** correct it automatically within bounded authority.
- **Escalate:** obtain human approval or external clarification.
- **Fallback:** preserve a smaller truthful product when the preferred behavior is infeasible.

---

## 3. Executive risk register

| ID | Risk | Probability | Impact | Primary disposition | Submission blocker? |
|---|---|---:|---:|---|---:|
| R01 | Product appears to be AI-assisted video stitching rather than an agent | High | Critical | Prevent, demonstrate | Yes |
| R02 | The rejection-and-repair demonstration is hard-coded or overfitted to one seam | High | Critical | Prevent, evaluate | Yes |
| R03 | Gemini is decorative and deterministic code makes every meaningful decision | Medium-high | Critical | Prevent, demonstrate | Yes |
| R04 | Continuous-mode claims exceed what cuts and annotations can guarantee | High | Critical | Detect, constrain, disclose | Yes |
| R05 | Source clips remain visually inconsistent after assembly | High | High | Prevent, normalize, curate | No, unless hero output is poor |
| R06 | Generative styling changes choreography; deterministic styling lacks visual impact | High | High | Separate output grades | No |
| R07 | Product implies camera angles that were never captured | Medium | Critical | Prevent, label | Yes |
| R08 | Character replacement fails identity, anatomy, contact, or choreography preservation | High | High | Exclude from authoritative MVP | No |
| R09 | Background replacement produces masks, edges, or shadows that look defective | High | Medium-high | Restrict source eligibility | No |
| R10 | Clip inventory is too shallow for autonomous repair | High | Critical | Audit, record alternatives | Yes for the central claim |
| R11 | Clip boundary metadata is incomplete, inconsistent, or inaccurate | High | Critical | Validate, review, calibrate | Yes |
| R12 | Domain-agnostic architecture dilutes the bachata product and demonstration | Medium | High | Keep internal only | No |
| R13 | Bachata appears too niche or outside a filmmaker/studio workflow | Medium | High | Reframe and validate audience | No |
| R14 | Claimed workflow impact is not supported by user or timing evidence | High | High | Measure honestly | No, but harms judging |
| R15 | Replit Agent contribution or Replit deployment appears superficial | Medium | Critical | Evidence, deploy early | Yes |
| R16 | Gemini/Google Cloud usage appears bolted on or is not active at runtime | Medium | Critical | Runtime integration tests | Yes |
| R17 | Pre-existing graph, footage, or code conflicts with the new-project rule | Unknown | Critical | Written clarification, isolate code | Yes |
| R18 | Footage, choreography, performer, music, or transformation rights are incomplete | High until audited | Critical | Rights gate | Yes |
| R19 | Scope is too large for a reliable hackathon submission | High | Critical | Enforce MVP and fallback ladder | Yes indirectly |
| R20 | The final product is technically credible but visually underwhelming | Medium-high | High | Hero-pack production and demo direction | No, but harms ranking |
| R21 | Metrics or fixture values are presented as real measured results | Medium | Critical | Provenance and claim review | Yes |
| R22 | Live rendering, media storage, or external services fail during judging | Medium | High | Cache, smoke test, fallback | No if fallback works |

---

## 4. Stop-ship conditions

Do not submit or publish the affected claim if any of these conditions remains true:

- The project is not newly created during the contest period.
- Dataset eligibility has been rejected or remains materially ambiguous after escalation.
- Any displayed media lacks recording, performer, choreography, music, public-display, or transformation permission.
- The public application is not deployed directly on the required Replit domain.
- Gemini/Google Cloud and the selected partner technology are not actually called by the running application.
- The agent's hero repair is hard-coded to clip IDs or a preselected result.
- Continuous mode accepts a seam with failed physical hard gates.
- A generated or unrelated camera view is presented as synchronized source footage.
- Fixture values are presented as production evaluation results.
- The demonstration cannot complete from cached or live-safe inputs reliably.

---

## 5. Detailed risks and controls

## R01. The product looks like AI-assisted video stitching

**Why this remains valid:** A graph planner, clip scorer, FFmpeg renderer, and chatbot can still be interpreted as an automated editor. Calling the workflow “agentic” does not make it so.

### Failure indicators

- Gemini only parses the initial prompt or narrates deterministic output.
- The same sequence of tools executes for every brief.
- No initial plan ever fails or changes.
- Repair is a fixed lookup or hard-coded branch.
- The demo spends more time playing the output than showing decisions and state changes.
- The Decision Ledger contains descriptions but no evidence references or before/after validation.

### Mitigations

1. Implement a real closed loop:
   - parse goal
   - create initial plan
   - ground it in clip instances
   - observe boundary validation
   - diagnose failure
   - request multiple authorized repairs
   - select the smallest repair consistent with the user's priorities
   - mutate project state
   - revalidate affected seams
   - escalate when no authorized repair exists
2. Ensure the initial allocation is plausible rather than intentionally nonsensical.
3. Give the agent at least two eligible repair strategies in the hero case.
4. Make user priorities consequential. For example:
   - “preserve movement order” should prefer clip replacement
   - “preserve this take” should prefer a safe-frame or recorded bridge
   - “preserve performer identity” should reject a higher-scoring different-performer clip
5. Store structured observations, actions, state hashes, and outcomes in the Decision Ledger.
6. Show one successful autonomous repair and one legitimate escalation.
7. Position rendering as the result of the agent's production decisions, not as the intelligent act itself.

### Acceptance gate

Given two briefs with different priorities but the same rejected seam, the agent chooses different valid repairs, and both choices can be explained using typed evidence and project constraints. No application code contains a special case for the hero movement or clip IDs.

### Fallback

If meaningful repair choice cannot be implemented, narrow the claim to “continuity-aware choreography compiler” and do not overstate autonomous directing.

---

## R02. One rejection example is hard-coded or overfitted

**Why this remains valid:** One carefully curated `M013 -> M025` failure proves that a UI path exists. It does not prove that the validator or repair system generalizes.

### Failure indicators

- Tests contain only the hero seam.
- Failure codes are copied into the fixture rather than calculated from boundary metadata.
- The repair candidate is returned regardless of constraints.
- Demonstration scores such as `0.46 -> 0.94` have no reproducible evaluation record.
- The agent cannot handle a different hand, beat, foot, velocity, rights, or camera failure.

### Mitigations

1. Create at least 25 labeled boundary cases:
   - valid positive controls
   - hand-connection mismatch
   - weight-foot mismatch
   - half-beat offset
   - facing mismatch
   - root-position jump
   - velocity discontinuity
   - unavailable synchronized camera
   - expired or disabled rights
   - occlusion resolved by another camera
   - repair that breaks the following seam
   - no continuous repair available
2. Hold out at least five cases from threshold tuning.
3. Require every failure code to reference source frames and normalized metrics.
4. Run the same repair engine against every case.
5. Include false positives and failed repairs in published results.
6. Add a test that searches for forbidden hero IDs in production repair-policy code.
7. Label hand-authored demonstration fixtures as fixtures.

### Acceptance gate

The system correctly detects at least 80% of labeled invalid test boundaries with an acceptable false-rejection rate, and repair behavior is reproducible from versioned graph, media, and scorer hashes. Final thresholds must be selected after expert calibration, not chosen solely to pass the hero seam.

### Fallback

If the sample is too small for percentages, publish case counts and a confusion matrix without implying statistical generality.

---

## R03. Gemini is decorative or replaceable

**Why this remains valid:** Deterministic tools should own physical truth, but that can leave Gemini with nothing more than prompt parsing and prose generation.

### Failure indicators

- Removing Gemini changes only the natural-language interface.
- Repair ranking is fully determined before Gemini is called.
- Gemini cannot revise a plan based on render-review evidence.
- The model has no authority to choose among valid options.
- Tool calls are a fixed state machine with no contextual branching.

### Mitigations

1. Assign Gemini decisions that are semantic and contextual rather than mechanical:
   - resolve ambiguous creative briefs
   - identify hard versus negotiable user constraints
   - choose among several validated repairs using creative priorities
   - ask focused questions when two hard priorities conflict
   - interpret render-review observations
   - generate a typed revision delta
2. Keep validators deterministic, but return several eligible options with tradeoffs rather than one preselected result.
3. Evaluate agent decisions against expert choices on a small decision set.
4. Include counterfactual tests: changing one user priority should change the selected repair while preserving deterministic eligibility.
5. Track tool-selection accuracy, invalid tool requests, repair success, and escalation quality.
6. Do not manufacture multi-agent roles. One consequential bounded orchestrator is enough.

### Acceptance gate

At least three production scenarios require Gemini to choose among multiple deterministically valid options, and expert reviewers judge the selected tradeoff reasonable. Invalid model output is rejected safely by schema and policy validators.

### Fallback

If Gemini cannot choose reliably, expose the valid options to the user and position Gemini as a production copilot rather than an autonomous director.

---

## R04. Continuous-mode claims exceed the evidence

**Why this remains valid:** Two compatible boundary frames do not prove that unrelated recordings form one uninterrupted physical trajectory. Human annotation and numeric thresholds establish plausibility, not mathematical identity.

### Failure indicators

- Different performers or sessions are labeled as one continuous performance.
- Crossfades or optical flow improve the displayed continuity grade.
- Hand, foot, beat, or root mismatches are treated as soft penalties.
- Reviewers can identify physically impossible transitions despite a passing score.
- Marketing uses “guaranteed seamless choreography” without qualification.

### Mitigations

1. Separate hard eligibility from soft ranking.
2. Require the following continuous-mode gates:
   - valid rights
   - compatible actual entry/exit state
   - hand-connection compatibility
   - weight-foot compatibility
   - beat-phase compatibility
   - root/facing/velocity within calibrated tolerances
   - performer/session policy compliance
3. Prefer source footage containing the complete transition.
4. Record dedicated bridge clips for common transition states.
5. Require instructor review for hero continuous-mode seams.
6. Use “physically plausible edit based on reviewed boundary evidence,” not “identical to a continuous take.”
7. Display continuous and editorial modes prominently in the UI and exports.

### Acceptance gate

No continuous-mode seam fails a hard gate, and at least two qualified bachata reviewers find no major mechanical objection in at least 90% of the final evaluated seams. Report the exact sample size and disagreements.

### Fallback

Downgrade the affected output to editorial mode with explicit user approval. Never silently relabel it.

---

## R05. Source clips remain visually inconsistent

**Why this remains valid:** Color treatment cannot fully reconcile different performers, rooms, wardrobe, lighting, lenses, framing, or starting positions.

### Failure indicators

- The choreography reads as a sequence of unrelated tutorials.
- Bodies change scale or screen position at every seam.
- Wardrobe, lighting, and background changes distract from movement.
- Global styling exaggerates source differences.

### Mitigations

1. Record a dedicated hero pack in one controlled session.
2. Lock performer pair, wardrobe, lighting, floor marks, focal length, camera height, frame rate, shutter, white balance, and BPM.
3. Capture multiple full takes, not only isolated movement fragments.
4. Normalize crop, scale, exposure, white balance, color space, frame rate, and audio timing before allocation.
5. Include environment, lens, body scale, and root-position terms in clip ranking.
6. Prefer clean rehearsal presentation if cinematic styling makes seams more visible.
7. Use editorial cuts intentionally when visual discontinuity cannot be removed.

### Acceptance gate

A blind reviewer can follow the choreography without environment, wardrobe, scale, or exposure changes dominating their feedback. The hero sequence must use a same-session pack unless the deliberate editorial mode is being demonstrated.

### Fallback

Use one fixed wide camera from the same recording session and reduce the number of clip changes.

---

## R06. Generative styling drifts; deterministic styling lacks visual impact

**Why this remains valid:** Generative rewriting can alter anatomy, timing, identity, contact, and footwork. Geometry-preserving filters are reliable but may look like conventional post-production.

### Failure indicators

- Generated hands merge, disappear, or change connection.
- Rotation count or beat timing changes.
- Character identity varies across segments.
- The authoritative result is visually indistinguishable from simple LUT application while the pitch emphasizes generative cinema.

### Mitigations

1. Maintain three explicit output grades:
   - source-exact deterministic render
   - motion-conditioned experimental render with measured similarity
   - creative interpretation without choreography guarantee
2. Keep the authoritative submission output in the first grade.
3. Use compositing, graphic layers, lighting treatment, titles, environment plates, and camera planning to improve visual impact without regenerating bodies.
4. If an allowed Google model is used experimentally:
   - render separately
   - compare pose and timing against the source
   - show a side-by-side disclaimer
   - never use it as continuity evidence
5. Avoid claiming “style transfer” if the implementation is only color grading; describe the exact geometry-preserving treatment.

### Acceptance gate

Authoritative presets preserve frame count, source mapping, timing, and sampled silhouette/motion checks. User testing confirms the hero treatment appears intentional rather than accidental or merely filtered.

### Fallback

Use a highly polished clean rehearsal aesthetic and let agentic decision-making—not generative spectacle—carry the demonstration.

---

## R07. Product implies nonexistent camera angles

**Why this remains valid:** A crop is not a new camera. A generated side view infers unseen body geometry and cannot be presented as the same recorded performance.

### Failure indicators

- UI offers front, side, and rear regardless of source availability.
- Different takes are switched as if synchronized.
- Novel generated views are included in the authoritative EDL.
- Camera timecode cannot be traced to a take group.

### Mitigations

1. Require take-group IDs and overlapping source timecode for authentic camera switches.
2. Store camera choice separately from movement allocation.
3. Label digital crop and pan as “reframe.”
4. Label any generated viewpoint as “synthetic interpretation.”
5. Disable unavailable angles in the UI and explain why.
6. Record at least one synchronized front/side or front/three-quarter hero take.
7. Verify camera-switch frame mapping with a slate, clap, or shared timecode.

### Acceptance gate

Every authoritative camera segment resolves to a real source, take group, and frame range. Automated tests reject a camera switch between unrelated takes.

### Fallback

Deliver a single-camera wide version with limited deterministic reframing.

---

## R08. Character replacement fails

**Why this remains valid:** Partner dance combines occlusion, contact, hands, faces, fabric, and rapid rotation—conditions that are difficult for generative identity replacement.

### Failure indicators

- Identity changes during turns or occlusion.
- Hands, arms, or faces fuse at contact points.
- Body proportions alter the choreography.
- The generated result cannot pass source-motion comparison.

### Mitigations

1. Exclude character replacement from the authoritative MVP.
2. Architect it as a future optional renderer, not as a planner dependency.
3. If tested, use short segments, strong identity references, masks, and high motion-preservation settings.
4. Validate pose, timing, contact regions, and identity per segment.
5. Clearly distinguish “same choreography interpretation” from “exact source-preserving render.”

### Acceptance gate

No submission guarantee depends on character replacement. Experimental output is labeled and can be disabled without changing the core workflow.

### Fallback

Use the original released performers.

---

## R09. Background replacement looks defective

**Why this remains valid:** Hair, transparent fabric, motion blur, floor contact, shadows, and partner overlap can break segmentation and compositing.

### Failure indicators

- Halos or holes around dancers.
- Feet float or shadows slide.
- Matte flicker appears during turns.
- Generated backgrounds change perspective or lighting incompatibly.

### Mitigations

1. Support only green-screen, alpha, or reviewed precomputed mattes in the MVP.
2. Record clean plates and floor references.
3. Use deterministic temporal matte cleanup.
4. Match perspective, horizon, lighting direction, color temperature, blur, and grain.
5. Treat contact shadow as an authored layer, not an unconstrained generation.
6. Add a per-clip background eligibility flag.

### Acceptance gate

Background replacement is unavailable for clips without approved mattes. The hero composite passes frame-by-frame review at all seams and high-motion sections.

### Fallback

Retain the original controlled studio background and use lighting/color treatment only.

---

## R10. Clip inventory is too shallow for autonomous repair

**Why this is the most important execution risk:** A knowledge graph can propose alternatives only if actual compatible footage exists. One clip per movement leaves the agent with almost no repair authority.

### Failure indicators

- Most rejected seams have no same-movement replacement.
- The agent frequently recommends editorial mode or missing footage.
- Repair succeeds only by changing the requested choreography.
- Clip counts are high but all clips share the same unusable boundary.

### Mitigations

1. Prioritize depth over movement count for the hero domain:
   - three to five takes per hero movement
   - multiple annotated safe entry/exit frames
   - open, one-hand, two-hand, wrap, shadow, and release variants where relevant
   - multiple tempo ranges
   - dedicated bridge clips
   - synchronized camera coverage
2. Calculate a repairability coverage report before feature development:
   - clips per movement
   - safe boundaries per clip
   - compatible clip edges per authored move edge
   - same-performer repair alternatives
   - bridge coverage by state pair
3. Select the hero movement subset based on coverage, not popularity alone.
4. Record missing high-value variants during the contest period with complete releases.
5. Have the agent report exact acquisition requirements when inventory is insufficient.

### Acceptance gate

Every movement in the hero sequence has at least two rights-cleared clip variants, and every hero seam has at least two repair options or one valid source-contained transition. At least 70% of labeled repairable test cases can be fixed without manual clip selection.

### Fallback

Reduce the hero vocabulary to four highly covered movements and present unsupported movements as searchable references rather than autonomously compilable content.

---

## R11. Boundary metadata is inaccurate or inconsistent

**Why this remains valid:** The system's strongest claims depend on annotations such as hand state, weight foot, beat phase, facing, root position, and velocity.

### Failure indicators

- Reviewers disagree with annotations.
- Equivalent clips use different vocabularies or coordinate systems.
- Safe frames are placed before movement completion or after the next movement begins.
- Threshold changes unexpectedly reverse many results.

### Mitigations

1. Define a strict annotation handbook with examples and counterexamples.
2. Normalize coordinate systems and state vocabularies.
3. Require dual review for hero boundaries.
4. Measure inter-annotator agreement.
5. Store annotator, timestamp, tool version, confidence, and evidence frames.
6. Separate observed clip facts from canonical movement expectations.
7. Calibrate thresholds on a training subset and evaluate on a held-out subset.
8. Add schema, range, consistency, and impossible-state validators.
9. Allow “unknown” rather than forcing uncertain labels.

### Acceptance gate

Hero boundaries receive dual review, material disagreements are resolved, and held-out invalid seams are detected without excessive false rejection. Every numeric feature is reproducible from documented units and coordinate conventions.

### Fallback

Restrict continuous mode to manually approved source-contained transitions and use the remaining metadata only for editorial ranking.

---

## R12. Domain-agnostic architecture dilutes the product

**Why this remains valid:** Demonstrating bachata, fight choreography, game moves, and generic movement graphs in one submission creates a framework demo rather than a coherent product.

### Mitigations

1. Keep `DomainPack` internal.
2. Use bachata terminology, footage, reviewers, and user stories throughout the public product.
3. Mention combat choreography only once as future extensibility.
4. Do not include fight footage, game extraction, or a domain selector in the hackathon demo.
5. Optimize the UI for choreographers and directors rather than graph engineers.

### Acceptance gate

A first-time user describes the product as a bachata choreography previsualization tool, not a generic graph platform.

### Fallback

Remove public domain-agnostic language entirely while preserving the internal interfaces.

---

## R13. Bachata appears too niche or outside the target workflow

**Why this remains valid:** A dance-learning tool may not read as a critical filmmaker, studio, or production workflow.

### Mitigations

1. Define the primary user as a choreographer, music-video director, editor, or producer.
2. Frame the bottleneck as converting a movement library into a shootable, auditable first edit and camera plan.
3. Demonstrate outputs used in production:
   - choreography blueprint
   - clip and seam evidence
   - camera plan
   - EDL
   - shot list
   - revision history
4. Interview at least five relevant professionals.
5. Collect a concrete example of time lost searching clips or resolving bad transitions.
6. Avoid emphasizing consumer dance instruction.

### Acceptance gate

At least three target professionals confirm that the workflow addresses a real previsualization or editorial bottleneck, and at least one can describe how they would use the output in an actual production.

### Fallback

Position the application as a specialist previsualization proof for movement-intensive music videos rather than a broad studio platform.

---

## R14. Product impact is unproven

**Why this remains valid:** A polished prototype does not establish time savings, better decisions, or improved continuity.

### Mitigations

1. Compare against:
   - random compatible movement path
   - movement-only planner with first available clips
   - clip optimizer without repair
   - human first pass under the same time limit
2. Measure:
   - time to first usable edit
   - invalid-seam detection precision/recall
   - autonomous repair rate
   - movement-sequence preservation
   - changed segments per repair
   - escalation rate
   - expert continuity rating before/after
3. Publish sample size and methodology.
4. Report failures and false positives.
5. Do not turn internal targets into claims.

### Acceptance gate

At least one measured workflow outcome improves relative to a defined baseline, and the improvement is supported by reproducible data rather than testimonials alone.

### Fallback

Use a carefully scoped qualitative claim such as “reviewers found the boundary evidence useful,” with the reviewer count disclosed.

---

## R15. Replit participation appears superficial

**Why this remains valid:** Replit is not satisfied by mentioning it or transferring a finished application at the end.

### Mitigations

1. Create the new application repository and project during the contest period.
2. Use Replit Agent for meaningful bounded tasks.
3. Record dates, prompts/objectives, resulting changes, review, and tests in a development log.
4. Deploy to the final Replit domain early.
5. Exercise the complete signed-out workflow on the public deployment.
6. Show Replit Agent contribution and the deployed domain briefly in the demo.
7. Preserve commits demonstrating contest-period development.

### Acceptance gate

The app is publicly reachable on `replit.app` or `replit.dev`, the repository history and development log show meaningful Replit Agent use, and the hosted system behaves as shown in the demo.

### Fallback

There is no compliant non-Replit fallback for the Replit track. Resolve deployment before feature polish.

Official reference: https://agentic-cinema.devpost.com/details/replit-resources

---

## R16. Gemini and Google Cloud appear bolted on

**Why this remains valid:** SDK imports and architecture diagrams are insufficient if the running product does not use them consequentially.

### Mitigations

1. Invoke Gemini/Google Cloud at runtime for:
   - typed creative-brief interpretation
   - repair selection among validated options
   - structured revision deltas
   - rendered-output review
2. Use accepted Google packages and Google Cloud Agent Builder/ADK infrastructure.
3. Display redacted runtime evidence:
   - model/version
   - tool calls
   - response schema validation
   - decision outcome
   - correlation ID
4. Test model failure, malformed output, timeout, and retry behavior.
5. Ensure the live demo still exposes a meaningful Gemini step when using cached rendered media.
6. Do not use disallowed non-Google AI services in the submitted project.

### Acceptance gate

The running public application makes a real Gemini/Google Cloud call that changes a production decision, and the repository visibly contains the runtime integration—not only documentation.

### Fallback

No fallback can remove the required Google Cloud agent. Reduce other features to make the required integration reliable.

Official reference: https://agentic-cinema.devpost.com/rules

---

## R17. Pre-existing assets conflict with the new-project rule

**Why this remains valid:** The application must be newly created during the contest period. The graph and clip library predate it, and organizer interpretation of pre-existing first-party datasets should not be assumed.

### Mitigations

1. Obtain written organizer clarification before relying on the existing dataset.
2. Explain that:
   - application code is new
   - the graph and clips are external data inputs
   - provenance and creation dates are disclosed
   - no existing application code is reused
3. Create a clean new repository with no copied implementation from the annotator project.
4. Preserve repository creation date and commit history.
5. Prepare a contest-period subset of newly recorded and annotated clips if requested.
6. List all pre-existing data in the submission description.

### Acceptance gate

Written clarification approves the intended use, or the submitted hero dataset is created during the contest period under documented rights and the project contains no pre-contest application code.

### Fallback

Use only the contest-period movement subset and identify the larger library as future expansion, not as part of the submitted runtime.

Official reference: https://agentic-cinema.devpost.com/rules

---

## R18. Media and transformation rights are incomplete

**Why this remains valid:** Ownership of a video file does not automatically establish choreography, performer likeness, music, public-display, or transformation rights.

### Mitigations

1. Maintain a rights record for every asset:
   - recording owner
   - choreography permission
   - performer release
   - public-display permission
   - editing/transformation permission
   - generative-derivative permission where applicable
   - music permission
   - expiration and territory
2. Exclude assets with incomplete rights at query time.
3. Use original or explicitly licensed music.
4. Avoid third-party logos, trademarks, game footage, film footage, and downloaded social-video content.
5. Implement asset disable and takedown controls.
6. Have a human conduct a final submission rights audit.
7. Keep the public repository free of media that cannot be redistributed under its terms.

### Acceptance gate

Every public frame and audio sample resolves to an approved rights record. No ambiguous asset is present in the live app, repository, screenshots, or demonstration video.

### Fallback

Record a small owned hero pack with signed releases and use a click track or original music phrase.

---

## R19. Scope exceeds hackathon capacity

**Why this remains valid:** The full plan includes graph planning, clip allocation, repair, multicamera, FFmpeg rendering, styles, backgrounds, render review, conversational revision, evidence, and evaluation.

### Mitigations

1. Define the non-negotiable winning slice:
   - one 32-beat brief
   - four moves
   - three seams
   - one graph-valid/clip-invalid rejection
   - at least two repair options
   - one autonomous repair and revalidation
   - one user escalation
   - one real synchronized camera switch
   - one deterministic style
   - one EDL and Decision Ledger
   - one hosted Replit experience
2. Cut in this order:
   - generative restyle
   - generated background
   - background replacement
   - more than one style
   - long sequences
   - automatic alternate camera variants
   - broad movement-library browsing polish
3. Establish weekly exit gates and stop adding features after evaluation begins.
4. Build cached hero outputs before optional features.
5. Track critical-path defects separately from enhancements.

### Acceptance gate

The winning slice works end-to-end on the public Replit deployment with deterministic fixtures and real hero footage before any stretch work begins.

### Fallback

Ship the smallest credible product defined above. A narrow working agent is stronger than a broad unstable studio suite.

---

## R20. Technically strong but visually underwhelming

**Why this remains valid:** Judges will see the video output before they understand all the metadata. Poor footage, awkward cuts, or a debug-heavy interface can erase the technical advantage.

### Mitigations

1. Treat hero-footage production as a first-class engineering dependency.
2. Use experienced dancers, controlled wardrobe, deliberate lighting, and a clean set.
3. Record the exact failure and alternatives needed for the agent demonstration.
4. Direct one short visually compelling sequence rather than a long mediocre one.
5. Keep the interface cinematic and legible:
   - large seam frames
   - concise failure codes
   - clear repair animation
   - minimal graph complexity
6. Rehearse the three-minute narrative with nontechnical viewers.
7. Start with visible movement and failure evidence, not architecture slides.
8. Use the cleanest deterministic style rather than an aggressive effect that reduces readability.

### Acceptance gate

Independent viewers understand the original seam problem and perceive the repaired edit as better without needing a technical explanation. The complete demo remains under three minutes.

### Fallback

Use a polished clean rehearsal presentation with excellent footage and let the agentic repair be the visual reveal.

---

## R21. Fixture or target values are presented as measured results

**Why this remains valid:** Numbers such as `0.46 -> 0.94`, 80% detection, or 70% repair can begin as design targets and accidentally become marketing claims.

### Mitigations

1. Tag every number as one of:
   - fixture
   - target
   - measured development result
   - final held-out evaluation result
2. Store the dataset version, code version, scorer version, and evaluation command with every measured table.
3. Generate final metrics from machine-readable evaluation output.
4. Require a human claim audit before recording the demo or submitting Devpost copy.
5. Include failures, denominators, and confidence limitations.
6. Never imply that expert review occurred before it did.

### Acceptance gate

Every quantitative claim in the UI, README, demo, and Devpost submission has a reproducible evidence artifact. Fixtures and targets are visibly labeled.

### Fallback

Remove unsupported numbers and describe the demonstrated behavior qualitatively.

---

## R22. Live infrastructure fails during judging

**Why this remains valid:** Video rendering, Gemini calls, GCS, signed URLs, Replit resource limits, browser playback, and network latency create several failure points.

### Mitigations

1. Deploy and test early on the actual Replit environment.
2. Cache at least two rights-cleared showcase projects with exact EDLs and ledgers.
3. Allow the judge to run live planning and repair while using a cached final render for fast playback.
4. Implement job timeout, retries, idempotency, cleanup, and state recovery.
5. Keep preview duration and resolution bounded.
6. Add signed-out production smoke tests for:
   - brief parsing
   - clip allocation
   - deliberate rejection
   - repair
   - event stream
   - cached output playback
7. Provide honest service status and safe retry behavior.
8. Record the demo from the deployed app, not a local mock.

### Acceptance gate

The full hero flow succeeds repeatedly on the public deployment, refresh/reconnect works during a job, and a cached demonstration remains available if live rendering is delayed.

### Fallback

Use live agent planning and repair with a pre-rendered output linked to the same immutable EDL and source hashes.

---

## 6. Cross-risk mitigation workstreams

### 6.1 Hero media pack

The hero pack should contain:

- four highly covered movements
- at least three takes per movement where practical
- compatible and deliberately incompatible boundaries
- at least one same-movement replacement repair
- at least one alternate-safe-frame repair
- at least one bridge or synchronized-camera repair
- at least one unrepairable continuous case
- the same performer pair, wardrobe, BPM, lighting, and studio
- synchronized front and one secondary camera
- complete rights records

This single workstream reduces R02, R04, R05, R07, R10, R11, R18, and R20.

### 6.2 Agent evidence package

For every hero run, retain:

- parsed creative brief
- movement blueprint
- initial clip allocation
- boundary evaluation
- repair candidates
- selected repair and public rationale code
- previous and next project state hashes
- revalidation results for affected seams
- user approval or escalation where applicable
- EDL and render manifest
- Gemini model/tool trace with secrets and hidden reasoning removed

This package reduces R01, R02, R03, R16, and R21.

### 6.3 Compliance package

Maintain:

- organizer eligibility clarification
- project creation evidence
- repository history
- Replit Agent development log
- Replit deployment evidence
- Google Cloud runtime evidence
- dataset provenance
- per-asset rights manifest
- public repository license
- final claim audit

This package reduces R15, R16, R17, R18, and R21.

### 6.4 Evaluation package

Maintain:

- labeled positive and negative boundary cases
- held-out cases
- baseline definitions
- evaluation scripts
- machine-readable results
- reviewer protocol
- anonymized reviewer results
- failure analysis
- final metric table

This package reduces R02, R03, R04, R11, R14, and R21.

---

## 7. Phase gates

### Gate A: eligibility and rights

Must pass before using existing clips in public development:

- project strategy complies with the new-project rule
- organizer clarification is received or contest-period data fallback is active
- hero footage and music rights are complete
- public repository asset policy is defined

### Gate B: inventory feasibility

Must pass before investing in the final interface:

- hero movement subset selected by coverage
- every hero movement has alternatives
- deliberate rejected seam is real and reproducible
- at least two authorized repair strategies exist
- unrepairable scenario is documented

### Gate C: agentic credibility

Must pass before cinematic polish:

- Gemini chooses among multiple validated options
- user priorities change the choice
- project state changes after repair
- affected neighboring seams are revalidated
- repair budget and escalation work
- no hero-ID special cases exist

### Gate D: authoritative media quality

Must pass before evaluation:

- hero source normalization complete
- all continuous seams pass hard gates
- camera sources are synchronized and traceable
- deterministic style preserves geometry/timing
- output is visually acceptable to independent viewers

### Gate E: evaluation and claims

Must pass before demo recording:

- held-out evaluation complete
- expert review complete or explicitly omitted
- fixture, target, and measured values separated
- failures disclosed
- all spoken and written claims trace to evidence

### Gate F: deployment and submission

Must pass before final submission:

- public Replit app succeeds signed out
- Gemini/Google Cloud runtime call is visible and consequential
- cached outputs work
- repository is public, licensed, and reproducible
- demonstration is under three minutes
- all displayed assets pass rights review

---

## 8. Minimum winning demonstration test

The final demonstration should prove the following sequence without hidden manual intervention:

1. A user submits a 32-beat bachata production brief.
2. Gemini converts it into typed creative and continuity constraints.
3. The movement graph selects four authored-compatible moves.
4. The clip allocator proposes actual frame ranges.
5. One actual clip boundary is rejected despite the movement edge being valid.
6. The UI shows source frames and measured failure evidence.
7. At least two eligible repair options are returned.
8. Gemini selects the option best matching the user's priorities.
9. The project state changes and consumes repair budget.
10. Both affected neighboring seams are revalidated.
11. The Decision Ledger records observation, choice, and outcome.
12. A real synchronized camera change is planned.
13. The authoritative source-preserving video plays.
14. A second unrepairable case requests user authority rather than silently downgrading.
15. The evidence screen shows actual evaluation and runtime provenance.

If any step is simulated, precomputed, or fixture-based, label it clearly.

---

## 9. Final prioritization

### Resolve first

1. R17: new-project and dataset eligibility.
2. R18: media and transformation rights.
3. R10: clip inventory repairability.
4. R11: boundary metadata quality.
5. R01/R03: real agentic decision authority.
6. R15/R16: Replit and Google Cloud runtime compliance.

### Prove next

1. R02: generalization beyond one seam.
2. R04: honest continuous-mode validity.
3. R14/R21: measured impact and claim provenance.

### Polish after the core works

1. R05: visual source consistency.
2. R20: visual presentation.
3. R06/R09: styles and backgrounds.

### Keep out of the authoritative MVP

1. R08: character replacement.
2. Synthetic novel camera views from R07.
3. Unvalidated generative choreography restyling from R06.

---

## 10. Realistic conclusion

The revised two-graph, reject-diagnose-repair-revalidate architecture makes the project plausibly agentic. It does not by itself make the implementation reliable or the submission competitive.

The most dangerous failure would be a polished demonstration in which:

- the invalid seam was manufactured,
- the repair was hard-coded,
- Gemini merely narrated it,
- the final clip remained visibly discontinuous,
- and the published metrics were fixture targets.

The strongest implementation is narrower:

> A real bachata production brief produces a real clip allocation; the agent catches a real source-level incompatibility, chooses among real inventory-backed repairs according to the director's priorities, verifies the repaired edit, and proves every decision with source-frame evidence.

That is the standard each phase gate in this document is designed to protect.

