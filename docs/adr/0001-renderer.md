# ADR 0001 — native Canvas for the first scene runtime

Status: accepted for the working alpha, 14 November 2026.

## Context

The private production prototypes used Canvas drawing and FFmpeg. The public engine needs a small executable slice that validates authored scenes, evaluates arbitrary times, draws readable text and renders a reproducible example without relying on a maintainer's private environment.

The initial public runtime deliberately covers primitive layers and supplied narration anchors. Full character animation, a browser editor, AI asset generation and automatic speech alignment are separate milestones.

## Decision

Use TypeScript for the shared scene model and pure frame evaluator. Validate JSON structure with Ajv plus semantic checks. Draw the resulting state using `@napi-rs/canvas`, with three explicitly bundled Noto font files. Export RGBA frames to a separately installed FFmpeg process for H.264/AAC MP4 output.

Keep responsibilities separate:

- `packages/core`: types, validation, anchor/easing resolution and pure scene evaluation.
- `packages/renderer`: Canvas drawing, text wrapping, local audio loading and FFmpeg side effects.
- `apps/cli`: environment checks, authoring validation and requested exports.

No model-generated JavaScript is executed to describe a scene. The scene is constrained data. The same evaluator can later support another renderer adapter; that future adapter still needs parity tests before compatibility claims.

## Consequences

The alpha can render rectangles, circles, text and transform clips directly from JSON. Seeking does not require running earlier frames. Runtime dependencies and fonts are declared, and example narration is a publishable synthetic fixture rather than a personal recording.

The implementation includes native dependencies, so binary availability and text rasterization must be tested on each platform we advertise. Font registration reduces dependence on system fonts; it does not guarantee identical pixels or full shaping quality everywhere. FFmpeg availability and encoder configuration are explicit environment requirements.

One local PCM16 WAV track is the initial audio surface. It avoids accepting remote media/playlist behavior as an accidental feature and keeps input inspection tractable. Broader formats require a separate import/normalization design.

This is a rendering choice, not evidence of a finished video-creation agent. We have not measured a rendering advantage over alternate stacks. The choice should be revisited when a concrete feature or benchmark exposes a limitation, rather than expanding abstractions without evidence.

## Alternatives deferred

A browser renderer could align future studio preview with native evaluation, but preview and pixel parity are not implemented yet. A GPU or game-engine backend could support different effects; it adds another dependency surface. A higher-level video framework could supply authoring conveniences but would change the execution model. None is rejected by an unperformed benchmark.

## Verification expectations

Check schema boundaries, same-property overlap, anchor errors, clip holds, independent frame evaluation, text wrapping/overflow, local audio paths, output refusal and full MP4 decode. Publish real example output tied to its scene JSON. Keep platform results and performance measurements separate from architectural intent.
