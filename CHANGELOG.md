# Changelog

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
