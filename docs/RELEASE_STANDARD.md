# Rachana Engine 2D — release standard and showcase evidence

Status: proposed acceptance criteria. These are targets to verify during implementation, not measurements of the existing films.

## Definition of a usable release

A new user follows the documented setup, renders a bundled example, supplies a new script/narration, configures any advertised providers, revises the resulting animatic and exports the film without editing engine source or obtaining files from the maintainer's computer.

The release names supported platforms, runtimes, providers, languages, content modes and known limitations. Anything untested is labelled untested. The source package includes small redistributable examples; remote models, large videos and optional dependencies have explicit installation/download instructions.

## Automated checks

| Check | Proposed acceptance evidence |
| --- | --- |
| Project stages | Draft/intake validates without an existing output MP4; render and delivery checks require only artifacts appropriate to that stage |
| Structure | Unique IDs, valid references, finite numbers, supported schema version, positive dimensions, valid frame/time ranges and asset capabilities |
| Timing | Shots cover intended intervals; declared transitions are allowed; no accidental gaps; export duration within one output frame of planned duration |
| Captions | No discarded words, out-of-range cues or unintended overlapping cues; font coverage and text bounds checked; reading-speed warnings logged |
| Layout | Captions/title-safe zones remain clear except declared effects; no clipping of required text; checks include transition extrema and long text |
| Audio | Levels measured from actual files; exported mix meets its configured loudness/true-peak profile and retains expected narration duration |
| Export | Full audio/video decode succeeds; streams, dimensions, frame rate, sample rate and frame count match the render manifest |
| Seek behavior | Jumping directly to sampled frames matches sequential evaluation under the same pinned runtime, fonts and assets |
| Renderer parity | Compare native/browser sample frames with documented tolerances; do not promise identical font rasterization across platforms |
| Artifact integrity | Input originals unchanged; output files and provenance entries have hashes; bundle has no unresolved required references |
| Workflow | Interrupt/resume/cancel and invalid provider output scenarios produce correct stage state and preserve completed work |
| Cache | Unchanged saved project causes zero new generation requests; scoped edits invalidate all and only their dependency descendants |
| Cost limits | Bounded retries and provider concurrency; estimated/actual/unknown usage distinguishable; no silent continuation after configured ceiling |
| Installation | Clean install and sample render on each advertised platform; no maintainer-specific paths, undeclared fonts or secret local dependencies |

Use media measurements rather than constants. FFmpeg's [loudnorm documentation](https://ffmpeg.org/ffmpeg-filters.html#loudnorm) describes integrated loudness and true-peak measurement/normalization; select and record the project's mix profile rather than claiming a universal YouTube requirement. Intentional black or static frames can be declared, so detectors identify review candidates rather than blindly failing all such frames.

## Creative review

Review a contact sheet containing every shot, sample motion clips, and the entire encoded film with sound. Check at full size and small viewing size. Use a 1–5 rubric for story clarity, visual cohesion, acting/motion, pacing, readability and audio balance. Proposed release target: at least 4 in every category with no unresolved blocker. The rubric guides review; it is not a claim about audience response.

Blockers include a factual misrepresentation, unintelligible speech, omitted narration/captions, broken actor contact, distracting identity changes, unintentional freezes, text overlap or a failed export. Record the reviewer, timestamp, evidence and correction. A machine report can support this process, but cannot replace the full viewing.

## Generalization suite

- A short product walkthrough with supplied screenshot evidence.
- A short educational explainer with generated backgrounds and exact vector diagrams.
- A short fictional story that exercises character identity, emotion and object interaction.
- A previously unseen script: demonstrate that a maintainer does not add custom scene code to make it render.
- One complete 6–8 minute film to expose timing drift, repeated visuals, resource consumption and continuity problems.
- Failure fixtures for long captions, Unicode, pauses, mismatched scripts, unavailable providers, invalid assets, budget exhaustion, interruption and missing media.

These samples must use publishable audio/art. Preserve the existing user-provided voice recordings privately unless redistribution is explicitly chosen. Repository rights and source-code licensing are tracked separately from media/provider usage permissions.

## Meaningful tests and benchmarks

Test schema and timing boundaries, direct frame evaluation, layout overflow, cache invalidation and resume state transitions. Use short rendering fixtures and deterministic procedural assets in ordinary CI; paid provider integration tests are opt-in and budget-limited. Keep reference images with their renderer/font environment so platform changes do not produce unexplained visual failures.

Measure preview draw time, peak memory, frame render throughput, cold/warm export time, cache hits, asset attempts, time spent in each stage and available provider usage. Publish hardware, OS, versions, resolution, frame rate, duration, configuration, fixture ID and repeated-run methodology alongside results. Compare cold and cached runs fairly. Do not publish projected speedups as measured ones.

## README and public showcase

The visitor should be able to see what the engine does, watch proof and find a runnable example quickly. Planned README order:

1. Original name/banner and one-sentence purpose.
2. Small animated reel linked to a complete encoded film and the exact example project used.
3. Feature matrix with implemented, experimental and planned labels.
4. Verified quickstart and account-free procedural demo; clear provider setup for generation.
5. Workflow/architecture diagram and a small editable scene example.
6. Gallery: acting, camera, diagrams, typography, generated assets and a full video.
7. Measured performance and quality evidence, supported platforms and limitations.
8. Documentation, recipes, contribution guide, issue templates, changelog, author and acknowledgments.

Generate showcase GIFs from real engine outputs. Keep loops short, purposeful and modest in file size. A poster and linked video provide an accessible alternative. The eventual demo site can display a full player; GitHub documentation should stand on its own without a running localhost server. No simulated badges, invented testimonials or copied branding.

## Attribution and résumé evidence

Before public packaging, record the owner's chosen public name/handle, code-license decision, dependency notices and publishable media list. Attribute external code and art accurately; separate project authorship from library and model-provider contributions. If a reference repository only inspired presentation, describe that clearly. Preserve actual Git history and document AI assistance rather than inventing a development history.

Prepare an architecture walkthrough, a failure-recovery demonstration, one meaningful benchmark and a before/after revision example. These support interview explanations of engineering decisions. Résumé bullets are written after release from verified capabilities and measurements; no fabricated users, quality percentages or job outcomes.

## Release artifacts

The tagged source release should contain pinned setup/configuration, CLI/studio build instructions, examples, templates, API/recipe docs, tests, CI results, changelog, license/third-party records and reproducibility notes. Deliver sample MP4s, caption files, posters/thumbnails, render manifests and quality reports through appropriate versioned media downloads. Run a final fresh-user installation review before calling the release ready.
