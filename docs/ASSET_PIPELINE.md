# Rachana Engine 2D — asset generation and reuse contract

Status: proposed design for the reusable engine. The current film code does not implement this service.

## Resolve scene needs, not just prompts

The director produces an asset manifest from the storyboard before generation starts. Resolve dependencies first: the film's style bible precedes its environments; a character identity precedes its view/pose variants; rig validation precedes animation assignment. Count and estimate requests before expensive generation.

For each need: search approved project assets → reuse a compatible built-in → create procedurally → use a configured provider → request import or propose an identified alternative. Never silently substitute a placeholder in a final film. A creator can intentionally accept a stylized cutout instead of a puppet; save that decision.

## Asset kinds and production routes

| Need | Preferred route | Validation and limits |
| --- | --- | --- |
| Titles, captions, labels | Engine typography and text layout | Exact text, font coverage, bounds, wrapping and reading duration; avoid text baked into generated art |
| Diagrams and charts | Data-backed vector/Canvas objects | Exact values, labels, anchors and units; illustrative numbers are identified |
| Icons, shapes, particles | Parametric vector primitives | Style tokens, resolution independence and predictable animation |
| Backgrounds | Layered procedural sets or generated artwork | Composition, focal space, aspect ratio and layer/depth metadata; parallax requires actual layers |
| Props | Procedural objects or generated cutouts | Clean edges/alpha, scale, grip points and occlusion layers |
| Reusable human actors | Parameterized rig with approved identity | Proportions, supported views, body layers, joints, hand/face expressions and clip compatibility |
| Special characters | Reference sheet then rig-compatible parts, sprite sequences or cutout | Generated raster art alone is not a rig; assembly or artist/import work may remain necessary |
| Product views | Supplied screenshots or authorized captured footage | Preserve actual contents; constructed illustrations do not become evidence of real interactions |
| Sound effects | Procedural synthesis, supplied audio or configured audio provider | Duration, audible artifacts, cue timing, level and source information |
| Music | Suitable supplied/generated/licensed bed | Loop/edit seams, voice intelligibility, mood continuity, origin and intended usage |
| Thumbnail | Same approved cast/art plus deterministic text composition | Legible small-size preview, correct dimensions, actual subject relevance and rights metadata |
| Optional video inserts | Import or capable video provider | Decode, duration/frame rate, identity/style continuity and editability limitations |

## Asset request

Each request records:

- Stable ID, kind, purpose, target shot IDs and narration anchor.
- Required capability: static image, layered cutout, rigged actor, sprite animation, audio, vector or video.
- Dimensions, aspect ratio, crop-safe area, transparency/color-space requirements and duration if applicable.
- Style/character identity ID, approved reference hashes, palette and continuity constraints.
- Required variants, action/view requirements, grip/attachment points and foreground/background roles.
- Generation route/provider preferences, allowed fallback, attempt limit and spending/resource ceiling.
- Source/evidence expectations and redistribution notes.

For example, a “curious student pointing at a satellite diagram” requires a compatible student identity, pointing clip, diagram, screen/set and camera composition. A single generated PNG cannot satisfy the request for articulated pointing unless its representation supports that action.

## Asset result and registry

The result carries content hash, local file(s), dimensions/duration, representation, declared capabilities, dependent asset IDs and review status. Preserve the request plus provider/model/version and available generation settings, reference hashes and seed where supported. Record provenance as `procedural`, `generated`, `imported`, `captured` or `supplied`, with available creator/license/usage information. Unknown rights are recorded as unknown.

Track `draft`, `validated`, `approved`, `rejected` and `superseded` independently from provider job status. A provider returning a file means generation completed, not that the asset is approved for the film. Lock approved variants for a production so later shots reuse them instead of independently redesigning the same character.

## Provider adapter boundary

An adapter advertises actual capabilities and exposes request validation, estimate, submit, poll/fetch, cancellation where supported, and normalized error handling. Record supported formats, size/duration limits, reference/transparency support, network/credential needs and estimate uncertainty. An unsupported capability must be rejected before submitting a paid job.

Treat planner text, image generation, speech alignment, sound and video as separate provider capabilities. Keep a procedural-only mode runnable without external accounts; describe it accurately as a rendering/demo path. A configured full-generation path must exercise real providers. Do not describe recorded test responses as live generation.

Use per-project secrets references, never raw keys in the project JSON. Pass only the references required by the current generation task. Concurrency limits, timeouts, backoff and bounded retries are configurable. Record actual usage and provider-reported charges where available; estimates remain estimates.

## Consistency and motion

Create one style bible and character sheet before producing variants. Fix silhouette, proportions, clothes, colors, facial landmarks and distinguishing features. Prefer bounded edits or reuse of approved designs over unrelated per-shot prompts. Automated comparisons can flag drift, but human review remains necessary for faces, hands, contact and subject accuracy.

Define rig capabilities explicitly: supported views, joint hierarchy, face/mouth channels, action clips and attachments. Validate joint limits, contact points, layer order and draw bounds at representative poses. Retarget only compatible rigs. Do not claim a static cutout has articulated acting, or an amplitude-driven mouth has phoneme lip sync.

Keep crisp text, exact diagrams and real UI overlays in the engine. Generated art supplies appearance; the timeline supplies behavior. The same saved asset should render predictably in all shots that reference it.

## Failure handling and cache

- Decode and inspect files before registry insertion; validate alpha, dimensions, duration and format independently of provider claims.
- Invalid output gets a bounded retry or repair path. Semantic/artistic failures receive review notes; do not loop until a model approves itself.
- Cache request results using content and dependency hashes plus provider/settings. Reuse approved artifacts without another generation call.
- A style, rig or reference edit invalidates affected descendants; preserve old versions for undo and comparison.
- Resume interrupted jobs using provider job IDs. Reconcile completion before resubmitting to avoid unnecessary duplicate generation.
- A final shot with missing or rejected required assets cannot silently report success. Show the affected shot and resolution choices.

## Acceptance examples

1. An unfamiliar science script needs a satellite, star field and orbit diagram. The system generates/reuses the illustration assets and draws the labelled diagram from structured data, without a new renderer function.
2. A fiction script reuses one actor across close and wide shots. Identity and outfit stay stable, and each motion uses a supported representation.
3. A product script uses a supplied screenshot. Generated surroundings may frame it; the screenshot itself remains evidence with its provenance intact.
4. A provider returns an opaque image despite an alpha requirement. The validator flags it; the workflow attempts an explicit supported repair or asks for an alternative.
5. A generation task fails mid-film. Resume reuses completed assets, retries only the unresolved task and reports the usage incurred.
