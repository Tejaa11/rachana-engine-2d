<p align="center">
  <img src="showcase/banner.svg" alt="Rachana Engine 2D — From script and voice to animated stories" width="100%">
</p>

<p align="center">
  <strong>From script and voice to animated stories.</strong><br>
  A declarative 2D scene runtime and narrated-video workflow in development.
</p>

<p align="center">
  <a href="QUICKSTART.md">Quickstart</a> ·
  <a href="docs/SCENE_FORMAT.md">Scene format</a> ·
  <a href="docs/ENGINE_PRODUCT_PLAN.md">Architecture plan</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

## See the alpha in motion

![Motion excerpt rendered by Rachana](showcase/demo.gif)

The GIF is a silent excerpt from a real engine render. **[Watch the complete demo with narration](showcase/rachana-demo.mp4)**, inspect its [creative scene JSON](examples/narrated-story/creative.scene.json), or follow the [quickstart](QUICKSTART.md) to render it locally. The approximately 25-second creative cut follows Mira, an original recurring character, through five authored shots with expressive poses, curved vector art, narration-anchored reveals, and a quiet procedural music/effects mix. See the [creative direction](docs/CREATIVE_DIRECTION.md). The story and compositions are authored source, not choices made by an automatic director.

## Project status

**Working alpha 0.1.0-alpha.2: reusable vector characters, creative motion, and authored narration-led scenes.** Rachana validates scene files, evaluates nested animation directly at a requested time, draws PNG frames, and exports MP4 through FFmpeg. The automatic script-and-voice agent, image-generation providers, generic rig retargeting, cameras, and editing studio remain planned.

Created and maintained by [Tejas Dadhich (@Tejaa11)](https://github.com/Tejaa11), with AI-assisted development and maintainer review.

| Capability | Current status |
| --- | --- |
| Rectangles, circles, wrapped text, curved vector paths and nested groups | Implemented |
| Original Mira character: four poses, three expressions, bounded acting | Implemented prefab |
| Arc, drift, pop and reveal motion presets | Implemented editable clip builders |
| Position, opacity, scale and rotation clips; four easing curves | Implemented |
| Clip starts in seconds or relative to supplied word boundaries | Implemented |
| Schema and semantic checks for IDs, values, references and clip overlap | Implemented |
| Direct frame evaluation, PNG export and MP4 export | Implemented |
| Bundled fonts and an environment doctor | Implemented |
| Automatic transcription/alignment, TTS and director agent | Planned |
| Generative artwork, arbitrary character rigging and asset providers | Planned |
| Cameras, browser editor, persistent jobs, cache and resume | Planned |

## Render your first scene

Use **Node.js 22+**, npm, and a local **FFmpeg** executable with `libx264` and AAC support. Put FFmpeg on `PATH`, or set `FFMPEG_PATH` to its executable. See [setup and troubleshooting](QUICKSTART.md).

```sh
git clone https://github.com/Tejaa11/rachana-engine-2d.git
cd rachana-engine-2d
npm ci
npm run build
npm run cli -- doctor
npm run render:smoke
npm run render:creative
```

These create `renders/minimal.mp4` and `renders/rachana-creative.mp4`, each with a render manifest. The earlier shape-only example remains available through `npm run render:demo`. Outputs are never overwritten; choose a new output path when rendering a revision. No API key or paid provider is needed for these examples. npm needs network access to install the declared packages; rendering the included scenes then runs locally.

Change a shape's colors, position, timing, or text in its scene file, validate it, and render a new cut:

```sh
npm run cli -- validate examples/narrated-story/creative.scene.json
npm run cli -- frame examples/narrated-story/creative.scene.json --frame 30 --out renders/frame-30.png
npm run cli -- render examples/narrated-story/creative.scene.json --out renders/revision-1.mp4
```

## How it works

```mermaid
flowchart LR
    A[Scene JSON + optional local audio] --> B[Schema and timing validation]
    B --> C[Pure frame evaluation]
    C --> D[Native Canvas draw list]
    D --> E[PNG frame or FFmpeg MP4]
```

A scene describes the output, layers, animation clips, and optional narration-word anchors. A clip may begin at a fixed second or at the start/end of a word plus an offset. Frame evaluation depends on the scene and requested time, so it can seek directly without playing earlier frames. See the [scene contract](docs/SCENE_FORMAT.md) and [renderer decision](docs/adr/0001-renderer.md).

The narrated example includes original synthetic audio and synthesis-start timestamps. Word ends are approximate. This demonstrates supplied timing anchors; it does **not** demonstrate automatic alignment of a user's recording or phoneme lip sync. Audio origins, exact tool settings, and hashes are recorded in its [provenance](examples/narrated-story/provenance.json).

## Examples and verification

- [Minimal scene](examples/minimal-scene/scene.json): a two-second render fixture.
- [Creative narrated story](examples/narrated-story/creative.scene.json): five authored shots, an original reusable character, curved graphics and a precomposed procedural sound mix.
- [Earlier narrated shape study](examples/narrated-story/scene.json): a smaller example of supplied word anchors; render with `npm run render:demo`.
- [Example notes](examples/README.md): media, timing, and scope.
- [Showcase](showcase/README.md): source-linked outputs and regeneration.

```sh
npm run check
npm test
npm run verify:smoke
```

`check` inspects repository files and documentation links. `test` builds the TypeScript and runs the automated suite. `verify:smoke` checks the generated minimal MP4; run `render:smoke` first. These checks have distinct scopes and do not establish the creative quality of every possible video. No performance benchmark or cross-platform pixel-identity claim is made by this alpha.

## Boundaries and next steps

Scene authoring currently uses JSON. The runtime supports four shape kinds, nested groups, a reusable original character prefab, and one optional local PCM16 WAV audio track. WAV duration must match the scene within one output frame; its timing data must already be supplied. The creative example precomposes narration, original procedural music and sound cues into that one WAV; it does not add a runtime multi-track mixer. The engine does not yet turn an arbitrary script and voice recording into a complete film. Mira has a designed pose system, not automatic rigging/retargeting or phoneme lip sync.

The bundled Noto Sans, Devanagari, and Gujarati fonts avoid reliance on the maintainer's system fonts. They do not establish validated Indic speech alignment or universal glyph coverage. Broader language/shaping support is experimental and needs review fixtures.

Next work expands character actions and composition, then adds asset resolution, provider adapters, narration analysis, the director workflow, and an editing studio. See [ROADMAP.md](ROADMAP.md), the [product plan](docs/ENGINE_PRODUCT_PLAN.md), [asset design](docs/ASSET_PIPELINE.md), and [release standards](docs/RELEASE_STANDARD.md).

## Repository map

```text
packages/core/       Types, validation and pure animation evaluation
packages/renderer/   Canvas drawing, local media loading and FFmpeg export
packages/creative/   Original Mira character and reusable motion builders
apps/cli/            doctor, validate, frame and render commands
schemas/             Versioned scene JSON Schema
examples/            Editable scene files and redistributable inputs
assets/fonts/        Bundled Noto fonts, OFL notice and source manifest
tests/               Runtime, validation and rendering-related checks
tools/               Repository verification and development utilities
showcase/            Real rendered outputs and original static branding
docs/                Scene contract, architecture decisions and product plans
```

## Contributing, credits and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. [LambdaEngine2D](https://github.com/devesh95official/LambdaEngine2D) inspired the emphasis on modules, examples, and accessible documentation. No LambdaEngine2D code, branding, or media is included. The earlier private productions informed the design; see [origins](docs/ORIGINS.md).

Original engine source is [MIT](LICENSE), copyright 2026 Tejas Dadhich. Canvas, Ajv, TypeScript, Noto fonts, optional development tools, and external media retain their own terms. See [THIRD_PARTY.md](THIRD_PARTY.md) and the included media/font provenance records.
