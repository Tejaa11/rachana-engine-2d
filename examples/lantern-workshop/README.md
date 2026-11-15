# The Lantern Workshop

An original 48-second fictional story about Mira revising a paper lantern. Nine authored beats give it a problem, a pause, a small change and a quiet payoff. The [production brief](production.json) contains those editorial choices; it does not contain custom renderer code.

After the [quickstart](../../QUICKSTART.md) installation:

```sh
npm run cli -- assets validate examples/lantern-workshop/asset-registry.json
npm run cli -- produce examples/lantern-workshop/production.json --out renders/my-lantern-story
node tools/verify-smoke.mjs renders/my-lantern-story/film.mp4
```

Use a new output directory for another revision. [Watch the selected rendered movie](../../showcase/lantern-workshop/film.mp4) or inspect its [storyboard](../../showcase/lantern-workshop/storyboard.png).

## Reusable inputs

| Input | Purpose |
| --- | --- |
| [script.txt](script.txt) | Original 128-word fictional narration |
| [voice.wav](voice.wav), [timing.json](timing.json), [provenance.json](provenance.json) | Standard formant synthesis and supplied word events; exact settings/hashes and approximate-end limitations |
| [asset-request.json](asset-request.json) | Import metadata, source paths, declared provenance and example-specific review status |
| [asset-registry.json](asset-registry.json) | Measured file hashes, dimensions and actual alpha, with style identity |
| [art-prompts.json](art-prompts.json) | Exact development image prompts, tool attribution, selected file hashes and visual review notes |
| [production.json](production.json) | Authored headings, intent, poses, word ranges and asset/layout choices |

The selected [day workshop](art/workshop-day.png), [night courtyard](art/courtyard-night.png) and [transparent lantern](art/lantern-prop.png) were generated with built-in imagegen during development. The runtime loads these saved PNGs locally; it does not call a live generation provider. No provider/model identifier or seed was exposed by the tool, so none is invented in the records. Generated-media usage remains separate from the engine source license.

To exercise registration without overwriting the committed snapshot:

```sh
npm run cli -- assets register examples/lantern-workshop/asset-request.json --out examples/lantern-workshop/registry-local.json
npm run cli -- assets validate examples/lantern-workshop/registry-local.json
```

## Creative and technical scope

The shared illustration template offers left, right and wider staging, with image cropping and crisp engine-rendered text. Mira remains the original vector actor with bounded pose/gesture animation. The same cutout image is referenced across several shots so its silhouette remains identical. The environment lanterns are illustrative setting details with different shapes; they are not identity-locked variants of a rigged object.

The film does not simulate physical paper folding, contact/grip mechanics, parallax depth, or phoneme lip sync. Its visual bindings and headings are authored, not selected by an AI director. Supplied synthesis-event timestamps are not alignment of a human recording. It uses narration only, without a generated music bed. These limits distinguish the working asset foundation from the broader production system still on the roadmap.

A composed output copies only selected artwork under content-hash filenames and preserves a registry snapshot with provenance. It can render after its original input directory is removed or moved. See [the image workflow](../../docs/IMAGE_ASSETS.md) to apply the same system to other projects.
