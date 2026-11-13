# Rachana Engine 2D roadmap

This roadmap records planned engineering work. An unchecked item is not an implemented feature.

## Initial repository

- [x] Establish the product name and public repository structure.
- [x] Document the architecture, asset pipeline, and release criteria.
- [x] Add an original static banner and clear capability/status table.
- [x] Add contribution guidance, attribution policy, and source license.
- [x] Provide dependency-free repository checks and a CI definition.

## M0 — portable foundation

- [ ] Define versioned project, shot, asset, actor, caption, and audio schemas.
- [ ] Validate an intake project before any rendered output exists.
- [ ] Document runtime, font, speech, and FFmpeg dependencies.
- [ ] Add an environment doctor and a redistributable sample-input policy.

**Exit:** a new user can install the documented dependencies and validate a new project without private files or machine-specific paths.

## M1 — shared animation runtime

- [ ] Implement time evaluation, a scene graph, layers, cameras, and text layout.
- [ ] Extract parameterized actors and a reusable motion-clip system.
- [ ] Share scene evaluation between preview and export adapters.
- [ ] Render a polished 45–60 second film from project data.
- [ ] Render an unrelated second script without custom scene code.

**Exit:** direct frame seeking, timeline boundaries, layout, and export behavior have meaningful checks and actual sample renders.

## M2 — assets and reliable jobs

- [ ] Add an asset registry with capabilities, versions, and provenance.
- [ ] Support procedural creation, import, and a real image-provider adapter.
- [ ] Keep characters consistent through approved reference sheets and assets.
- [ ] Persist jobs with budget limits, cancellation, retries, resume, and caching.

**Exit:** a new background/prop request resolves through a real provider, while an interrupted or failed job recovers without repeating completed work.

## M3 — script and voice workflow

- [ ] Align actual narration with script text and report uncertain/mismatched spans.
- [ ] Add a real director adapter producing validated shot-plan data.
- [ ] Generate reviewable voice-synchronized animatics.
- [ ] Exercise three different topics and one unfamiliar script.

**Exit:** new scripts produce editable animatics without renderer edits; unsupported requests and failures are visible.

## M4 — creator studio

- [ ] Build project intake, storyboard, waveform, and timeline controls.
- [ ] Support asset replacement, scoped revisions, and undo.
- [ ] Connect preview and export to the same workflow services.
- [ ] Run a documented fresh-user usability walkthrough.

**Exit:** another creator can make and revise a film without changing engine code.

## M5 — production release

- [ ] Complete a 6–8 minute production and full creative/technical review.
- [ ] Test installation on every advertised platform.
- [ ] Publish measured benchmarks with hardware and configuration.
- [ ] Create motion reels from real outputs and a source-linked example gallery.
- [ ] Prepare versioned media downloads, changelog, and a tagged release.

**Exit:** all applicable [release standards](docs/RELEASE_STANDARD.md) have evidence. The release claims only what has been verified.
