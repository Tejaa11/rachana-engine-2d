# Runnable examples

These samples use the same shared scene format and renderer. No private recording, API key, paid service or optional synthesis tool is required to render them.

| Example | Purpose | Command |
| --- | --- | --- |
| [Minimal scene](minimal-scene/scene.json) | Two-second rendering/installation fixture | `npm run render:smoke` |
| [Narrated story](narrated-story/scene.json) | Approximately 25-second editable shape/text sequence with supplied word anchors and local narration | `npm run render:demo` |

Run `npm ci` and `npm run build` first; rendering needs FFmpeg. Follow the [quickstart](../QUICKSTART.md) for setup, validation, frame export and troubleshooting. Outputs go into `renders/` and are never overwritten.

## Narrated story inputs

The [original script](narrated-story/script.txt), synthetic narration, [word timing](narrated-story/timing.json), and [provenance](narrated-story/provenance.json) are public fixtures. Word starts come from eSpeak NG synthesis events; ends are approximate at the next word onset or the audio end. This is supplied timing for synthetic speech, not forced alignment of a user recording. The scene inlines the anchors it needs; editing a separate timing file does not automatically rewrite scene JSON.

The scene is hand-authored data running through the generic renderer. Its Earth/Moon shapes illustrate animation and narration cues rather than a physically accurate orbital simulation. It does not demonstrate an agent choosing shots or generating artwork.

`tools/generate-demo-voice.mjs` is an optional developer utility that accepts an explicit path to a separately installed synthesis tool. It never downloads that tool and is not required for playback or rendering. The GPL synthesis code/data are not bundled with the engine. See [THIRD_PARTY.md](../THIRD_PARTY.md) for source and output provenance.

## Language and future examples

The renderer registers bundled Noto Sans, Devanagari and Gujarati fonts. Broader script shaping and language support need experimental fixtures and review; no multilingual speech-alignment capability is claimed.

Upcoming examples should include character acting, educational diagrams, product evidence and a fictional story. Each must declare exact dependencies, media origins, timing sources, render commands and known limits. The [release standard](../docs/RELEASE_STANDARD.md) describes the eventual generalization suite.
