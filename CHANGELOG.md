# Changelog

## 0.1.0-alpha.5 — 16 November 2026

Creative Director v1 integration, with live creative acceptance still pending:

- Provider-neutral draft contract for premise/audience/arc/visual strategy, bounded shot decisions and explicit missing artwork.
- Optional Gemini generateContent and OpenAI Responses adapters with configured keys/models, schema-constrained output, full-body deadlines and no automatic retries.
- `direct`, offline `director prepare/apply/inspect`, and scoped provider revisions that lock unselected shots and narration ranges.
- The existing composer validates and renders accepted choices; missing required artwork yields `needs-assets` without a scene or silent placeholder.
- Source hashes, provider metadata, editable drafts/reports and portable production bundles; hard-cut or short-fade shot transitions.
- An original unfamiliar 45–60 second narration input, without authored beats, ready for a live acceptance run.

Provider tests use mocked HTTP transports. No live-provider result is claimed by this release, and the unfamiliar-script artistic acceptance test remains open until a configured account is exercised and the resulting film is reviewed. This release does not add speech alignment, an image-generation provider, cameras, physical interaction or lip sync.

## 0.1.0-alpha.4 — 15 November 2026

Local image assets become reusable production inputs:

- Versioned provenance/style/review registry and registration requests; derive PNG hashes, dimensions and actual transparency through `assets register`.
- Bounded static PNG validation before native decode, including chunk checksums, compressed scanline sizes and empty/corrupt-art failures.
- Image layers with contain/cover, focal cropping, inherited transforms/alpha and preloaded content-pinned files.
- Production `defaultVisual`/beat artwork bindings, three illustration layouts, acting/intent fields, selected-asset snapshots and portable hashed files.
- A 48-second original Lantern Workshop story using generated development artwork, the existing vector actor and supplied synthetic-narration timings.
- Pixel-level image tests, file/registry/bundle checks and clean CI renders on Node 22/24.

This is a local static-image import and reuse path. Built-in imagegen was used during development to create the committed example artwork; the engine does not call a live image provider or AI director. Static cutouts do not become rigged actors, and environment details are not automatically identity-locked. Recorded-speech alignment and persistent render/generation jobs remain planned.

## 0.1.0-alpha.3 — 15 November 2026

Reusable composition, with the same defaults applied to new inputs:

- `compose` and `produce` commands accepting a versioned brief, script, voice WAV and matching supplied word timings.
- Six reusable templates, three palettes, decorative vector subjects and source-phrase item reveals.
- Complete source headings, measured text fitting, reserved captions and captions bounded by sentences/shots.
- Optional editorial beats, ordered word coverage, portable input bundles and preview reports with source hashes.
- Learning, teamwork and nature examples generated without custom scene builders; a source-linked gallery.
- Regression coverage for unfamiliar text, every template/palette, density errors, input mismatch and output preservation.

This is a local rule-based pilot composer, not an autonomous director. Current scope is 6–90 seconds, 12–350 supplied words and up to 12 shots. Automatic recorded-speech alignment, generated subject artwork, sound mixing, long-form orchestration and subjective creative approval remain open work.

## 0.1.0-alpha.2 — 15 November 2026

Creative scene direction and original reusable character kit:

- Nested groups with inherited transforms/combined alpha, recursive evaluation and bounded tree validation.
- Generic vector paths with move, line, quadratic/cubic curves, closing, fill and stroke.
- Original adult creator Mira: curly bob, layered face, analytic two-link arms, four poses, three expressions and bounded blinking/breathing/gesture clips.
- Editable reveal, pop, arc and drift motion builders in `@rachana/creative`.
- A five-shot creative variant of the narrated example, retaining the earlier minimal shape study.
- Quiet original procedural music/effects precomposed with the existing synthetic voice as one example WAV.
- `render:creative`, a source-linked refreshed showcase and creative-direction documentation.
- Bold text styling using the existing bundled fonts; no new downloaded bold font asset.

This upgrade contains authored story direction and reusable vector data. It does not add
an automatic director, image-generation provider, recorded-speech alignment, lip sync,
generic character retargeting, cameras, a browser editor, caching or resumable jobs.

## 0.1.0-alpha.1 — 14 November 2026

First working declarative-scene runtime:

- Versioned JSON Schema and semantic validation for primitive layers and clips.
- Pure direct-time evaluation, four easing curves, and supplied word-start/end anchors.
- Native Canvas rendering with bundled fonts, text wrapping, and visible-text bounds errors.
- Local `doctor`, `validate`, `frame`, and `render` CLI commands.
- PNG output and H.264/AAC MP4 export with explicit no-overwrite behavior.
- A two-second motion fixture and an approximately 25-second original synthetic-narration demo.
- Tests for scene timing, seeking, drawing, audio parsing, media containment, and encoder failure cleanup.
- Setup instructions, media provenance, and encoded-output verification.

This alpha requires authored scenes and supplied narration timing. Automatic alignment,
the director agent, generated artwork, rigged characters, cameras, browser editing,
render caching, and resumable jobs are not implemented.

## 0.0.1 — 13 November 2026

Initial public architecture, roadmap, release criteria, branding, and repository checks.
