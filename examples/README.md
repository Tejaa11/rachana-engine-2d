# Runnable examples

These samples use the same shared scene format and renderer. No private recording, API key, paid service or optional synthesis tool is required to render them.

| Example | Purpose | Command |
| --- | --- | --- |
| [Minimal scene](minimal-scene/scene.json) | Two-second rendering/installation fixture | `npm run render:smoke` |
| [Creative narrated story](narrated-story/creative.scene.json) | Five authored shots, original Mira character, curved vector graphics, supplied narration anchors and a precomposed procedural sound mix | `npm run render:creative` |
| [Narrated shape study](narrated-story/scene.json) | Approximately 25-second editable shape/text sequence with supplied word anchors and local narration | `npm run render:demo` |

Run `npm ci` and `npm run build` first; rendering needs FFmpeg. Follow the [quickstart](../QUICKSTART.md) for setup, validation, frame export and troubleshooting. Outputs go into `renders/` and are never overwritten.

## Narrated story inputs

The [original script](narrated-story/script.txt), synthetic narration, [word timing](narrated-story/timing.json), and [provenance](narrated-story/provenance.json) are public fixtures. Word starts come from eSpeak NG synthesis events; ends are approximate at the next word onset or the audio end. This is supplied timing for synthetic speech, not forced alignment of a user recording. The scene inlines the anchors it needs; editing a separate timing file does not automatically rewrite scene JSON.

Both scenes are hand-authored data running through the generic renderer. Their Earth/Moon illustrations demonstrate animation and narration cues rather than a physically accurate orbital simulation. Neither demonstrates an agent choosing shots or generating artwork.

`tools/generate-demo-voice.mjs` is an optional developer utility that accepts an explicit path to a separately installed synthesis tool. It never downloads that tool and is not required for playback or rendering. The GPL synthesis code/data are not bundled with the engine. See [THIRD_PARTY.md](../THIRD_PARTY.md) for source and output provenance.

## Language and future examples

The renderer registers bundled Noto Sans, Devanagari and Gujarati fonts. Broader script shaping and language support need experimental fixtures and review; no multilingual speech-alignment capability is claimed.

The creative example now includes Mira acting in think/explain/point/celebrate poses and three expressions. The same actor is reused across shots; color, placement and pose are prefab parameters. Broader examples should expand character acting, educational diagrams, product evidence and fictional storytelling. Each must declare exact dependencies, media origins, timing sources, render commands and known limits. The [release standard](../docs/RELEASE_STANDARD.md) describes the eventual generalization suite.

## Creative cut

The [creative scene](narrated-story/creative.scene.json) is built by [build-creative-story.mjs](../tools/build-creative-story.mjs) from the [Mira and motion prefabs](../packages/creative/src/index.ts). Its [direction notes](../docs/CREATIVE_DIRECTION.md) explain the five shots and palette. Modify those authored choices or the resulting JSON, validate, and render a new output filename. Rebuilding the authored scene rewrites its JSON, so preserve manual JSON edits before rerunning the builder.

The creative audio is [creative-mix.wav](narrated-story/creative-mix.wav): the same synthetic narrator plus quiet original procedural music and effects, precomposed by [build-creative-audio.mjs](../tools/build-creative-audio.mjs). This is example production tooling, not automatic music selection or a multi-track runtime. The existing voice provenance remains relevant to the narrator; creative-audio generation settings are documented by the audio builder and associated example records.

```sh
npm run build
node tools/build-creative-story.mjs
npm run cli -- validate examples/narrated-story/creative.scene.json
npm run render:creative
```

This writes `renders/rachana-creative.mp4`. A revision needs another `--out` path because the renderer never overwrites outputs. The previous `render:demo` alias retains the simpler study rather than silently changing its source scene.
