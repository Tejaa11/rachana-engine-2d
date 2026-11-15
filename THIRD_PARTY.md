# Attribution and third-party policy

## Authorship and original work

Rachana Engine 2D is created and maintained by Tejas Dadhich ([Tejaa11](https://github.com/Tejaa11)). Planning, source, documentation and examples use AI assistance with maintainer review. Original engine/scaffold code and documentation are distributed under the root [MIT license](LICENSE). The Mira character, curved vector illustrations, five-shot authored compositions and reusable creative motion builders are original project work; they are code-native assets rather than imported or AI-image-provider artwork.

[LambdaEngine2D](https://github.com/devesh95official/LambdaEngine2D), by devesh95official, inspired modular engine presentation, examples and clear documentation. No code, branding or media from it is included.

## Declared packages and build tools

Exact installed versions and transitive dependencies are recorded in `package-lock.json`. Each dependency retains its license and notices. npm installs these packages; their code is not relicensed by the engine's MIT license.

| Component | Role | Upstream license/source |
| --- | --- | --- |
| `@napi-rs/canvas` | Native Canvas drawing and font registration | MIT; [upstream](https://github.com/Brooooooklyn/canvas). Native binaries include underlying components with their own notices. |
| Ajv | JSON Schema validation | MIT; [upstream](https://github.com/ajv-validator/ajv) |
| TypeScript | Development compiler | Apache-2.0; [upstream](https://github.com/microsoft/TypeScript) |
| `@types/node` | Development type declarations | MIT; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| GitHub Actions checkout/setup-node | CI tooling | MIT; [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) |
| FFmpeg | External local encoder/decoder | [FFmpeg licensing](https://ffmpeg.org/legal.html); configuration/build-dependent terms. FFmpeg is not bundled by this repository. |

## Bundled fonts

The original Noto Sans Regular, Noto Sans Devanagari Regular and Noto Sans Gujarati Regular font files come from the [Noto fonts project](https://github.com/notofonts/noto-fonts). Their [OFL notice](assets/fonts/OFL.txt) is included. The [manifest](assets/fonts/manifest.json) records exact revision, source URLs, hashes and byte counts.

`Rachana Sans`, `Rachana Devanagari` and `Rachana Gujarati` are registration aliases used by the renderer. The original bundled files retain their names/notices. Bold styling uses the existing bundled fonts through the renderer; this upgrade does not bundle a separately downloaded bold font file. Bundling these fonts does not claim validated speech alignment, universal glyph coverage or complete shaping quality for every script.

## Synthetic example narration

The narrated-story example uses an original project script and standard `en-us` formant synthesis. It does not use a private user recording, sampled MBROLA voice or voice impersonation.

A separately installed [`@echogarden/espeak-ng-emscripten`](https://github.com/echogarden-project/espeak-ng-emscripten) tool, version **0.3.5**, generated the fixture locally using eSpeak NG. This optional development tool is GPL-3.0. Its code, binary/data files and voice datasets are not bundled in this repository or included as engine runtime dependencies. Rendering the included WAV does not require it.

Original eSpeak author Jonathan Duddington states that its GPL does not apply to generated WAV speech output in the [official project discussion](https://sourceforge.net/p/espeak/discussion/538920/thread/c6944a60/). The eSpeak NG [COPYING file](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING) also describes when program output constitutes covered work. We retain those sources as provenance; the tool's GPL license is not represented as an MIT license or as exclusive rights in the generated voice.

The example's [provenance](examples/narrated-story/provenance.json) records settings, original text/audio/timing hashes and limitations. Word starts are synthesis-event times. Word ends are approximate next-onset boundaries; these are not forced-alignment measurements of recorded human speech. The [optional developer utility](tools/generate-demo-voice.mjs) accepts an explicit path to the separately installed tool and never downloads it.

## Media and future providers

The prior private Voxam/CareClinic workspace is not bundled: no supplied product logos/screenshots, personal narration, historical archives or old film masters are included. Current selected showcase files are generated from the public scene and documented example inputs.

Every future public asset must record origin and available redistribution/usage permission. Generated assets need provider/model metadata and available usage information. Code licensing, media permissions and provider terms are distinct; preserve the applicable records rather than assuming all production files inherit the root MIT license.

## Original creative-example audio

The creative variant keeps the same synthetic narration and adds a quiet procedural music/effects bed generated from original synthesis instructions in [build-creative-audio.mjs](tools/build-creative-audio.mjs). There are no third-party music loops or sampled sound libraries. The result is precomposed into `examples/narrated-story/creative-mix.wav` for the runtime's single local audio input; it is not evidence of a general music-generation provider or runtime multi-track mixer. Narrator provenance and the external eSpeak tool's boundaries above still apply.

## Shared-composer fixtures

The original learning, teamwork and seed-story scripts use the same external standard formant synthesis process. Per-fixture records document hashes, settings and timing limitations: [learning](examples/learning-habit/provenance.json), [teamwork](examples/team-flow/provenance.json), [nature](examples/seed-story/provenance.json). Selected gallery movies combine those inputs with the engine's original vector motifs and Mira prefab. No image provider, external music library or private production assets are used.

## Lantern Workshop artwork and narration

The [Lantern Workshop](examples/lantern-workshop/README.md) is an original fictional development example. Its [art prompt record](examples/lantern-workshop/art-prompts.json) preserves the exact prompts, built-in imagegen tool attribution, hashes, dimensions and review limits for three saved PNG assets. No model identifier or seed was exposed by that tool, so none is invented. Generated media usage remains distinct from the MIT engine source license; no exclusive copyright in generated output is claimed. The engine loads these local files and does not invoke imagegen at runtime.

The new narration uses the existing external standard formant synthesis process and has its own [provenance record](examples/lantern-workshop/provenance.json). Supplied synthesis-event timings are not recorded-speech alignment. No private user voice, screenshots or product logos are included.
