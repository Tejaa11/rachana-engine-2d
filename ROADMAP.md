# Rachana Engine 2D roadmap

Unchecked items are planned work. The current alpha implements the first scene-runtime slice and a reusable original character kit; it does not complete M0 or M1, and it is not the final script-to-video agent.

## Initial repository

- [x] Establish the name, source structure and public documentation.
- [x] Document the product, asset pipeline and release criteria.
- [x] Add contribution guidance, attribution and source licensing.
- [x] Add repository checks and CI configuration.

## M0 — portable foundation — in progress

- [x] Define a versioned scene schema with typed primitive layers and narration-word anchors.
- [x] Validate authoring data before rendered outputs exist.
- [x] Pin declared Node package dependencies and bundle documented fonts.
- [x] Provide a CLI environment doctor and public example media/provenance.
- [ ] Extend the scene schema into project, shot, actor, asset and multi-track audio contracts.
- [ ] Complete clean-install verification on every platform advertised as supported.

**Exit:** a new user can install documented dependencies and validate a new project without private files or machine-specific paths. The present alpha covers scene authoring and a constrained production brief; broader contracts are unfinished.

## M1 — shared animation runtime — in progress

- [x] Evaluate primitive layers and property animation directly at a requested time.
- [x] Support rectangles, circles, wrapped text, transforms and four easing curves.
- [x] Add nested groups with inherited transforms/opacity and generic curved vector paths.
- [x] Add original Mira with four poses, three expressions and bounded deterministic acting.
- [x] Add reusable appear, pop, arc and drift clip builders.
- [x] Resolve animation starts from seconds or supplied word start/end anchors.
- [x] Export PNG frames and MP4 using the shared evaluator and native renderer.
- [x] Include a two-second smoke fixture and an approximately 25-second narrated shape example.
- [x] Add a five-shot creative cut using reusable character/motion data and original procedural sound.
- [ ] Expand the basic group hierarchy into camera direction, masks and a richer motion system.
- [ ] Extend the first parameterized actor into broader actions, actor designs and reusable clip/attachment contracts.
- [ ] Add a browser preview adapter and verify native/browser behavior.
- [x] Render a reviewed 45–60 second image-backed story from a production brief and supplied timings.
- [x] Render unrelated scripts through shared templates without custom scene code.

**Exit:** reusable acting and composition, direct seeking, layout and export behavior have meaningful checks and reviewed sample renders. The first original actor and creative cut are progress toward this milestone; the 48-second image-backed story now exercises production data; broader acting and staging remain open.

## M2 — assets and reliable jobs

- [x] Add a versioned local static-image registry with provenance, style/review metadata and pinned content.
- [ ] Extend asset capabilities/version lineage beyond static PNGs.
- [x] Import and reuse static PNG backgrounds/illustrations/props through a validated registry.
- [ ] Add general procedural asset requests and a real runtime image-provider adapter.
- [ ] Maintain identity through approved character/style references.
- [ ] Persist jobs with budget limits, cancellation, retries, resume and caching.

**Exit:** a new background/prop request resolves through a real provider; interrupted or failed jobs recover without repeating completed work. Cancelling a CLI process alone does not meet this persistence milestone.

## M3 — script and voice workflow — partial

- [ ] Align a real recording with script text and flag uncertain/mismatched spans.
- [ ] Add a real director adapter producing validated shot-plan data.
- [x] Generate editable illustrated pilots from scripts and supplied matching word timings.
- [x] Exercise three topic fixtures and an additional unfamiliar-script regression case through shared defaults.

**Exit:** recorded-voice input and a real director adapter produce animatics without renderer edits; unsupported requests and failures are visible. Supplied synthesis-event timestamps in the current example do not establish automatic recorded-speech alignment.

## M4 — creator studio

- [ ] Build project intake, storyboard, waveform and timeline controls.
- [ ] Support asset replacement, scoped revisions and undo.
- [ ] Connect preview/export to the same workflow services.
- [ ] Complete a fresh-user usability walkthrough.

**Exit:** another creator can make and revise a film without changing engine code.

## M5 — production release

- [ ] Complete a 6–8 minute film and full creative/technical review.
- [ ] Test installation on every advertised platform.
- [ ] Publish measured benchmarks with hardware and configuration.
- [x] Expand the real motion showcase into a source-linked example gallery.
- [ ] Prepare versioned media downloads, changelog and a tagged production release.

**Exit:** the [release standard](docs/RELEASE_STANDARD.md) has evidence. A successful alpha render does not imply all production requirements are satisfied.
