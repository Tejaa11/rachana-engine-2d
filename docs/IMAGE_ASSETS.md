# Image assets: register, reuse and render

Rachana can import local static PNG artwork, verify its measured properties and provenance record, and reuse it across narrated shots. The same image-layer implementation powers scene validation, PNG previews and MP4 export. This is the local asset foundation described in the [production workflow](PRODUCTION_WORKFLOW.md).

## Try the included film

After the [quickstart](../QUICKSTART.md) installation/build:

```sh
npm run cli -- assets inspect examples/lantern-workshop/art/lantern-prop.png
npm run cli -- assets validate examples/lantern-workshop/asset-registry.json
npm run cli -- produce examples/lantern-workshop/production.json --out renders/my-lantern-film
node tools/verify-smoke.mjs renders/my-lantern-film/film.mp4
```

Open `renders/my-lantern-film/film.mp4`. Its [production brief](../examples/lantern-workshop/production.json) supplies nine authored beats; the engine resolves their artwork through the shared registry and composes them through reusable layouts. See the [example notes](../examples/lantern-workshop/README.md) for the original story, media origins and known limits.

The artwork was generated during development using the built-in imagegen tool. Playback and rendering use the saved PNG files, with no generation account or API key. The narration is synthetic, with supplied synthesis-event word starts and approximate word ends. Neither live artwork generation nor automatic voice alignment is demonstrated by this film.

## Register your own artwork

Place your PNGs and a registration request together:

```text
my-project/
  asset-request.json
  art/
    study.png
```

An `asset-request.json` records the editorial information; the tool derives file measurements:

```json
{
  "schemaVersion": 1,
  "styleId": "my-paper-style-v1",
  "assets": [
    {
      "id": "study-room",
      "kind": "background",
      "src": "art/study.png",
      "provenance": {
        "kind": "supplied",
        "creator": "Your name",
        "source": "Describe the actual artwork source",
        "usage": "Record its actual permission or license"
      },
      "review": { "status": "draft" }
    }
  ]
}
```

Replace the descriptive metadata with accurate information. Then:

```sh
npm run cli -- assets inspect my-project/art/study.png
npm run cli -- assets register my-project/asset-request.json --out my-project/asset-registry.json
npm run cli -- assets validate my-project/asset-registry.json
```

`register` measures SHA-256, dimensions and actual transparency, then writes a **new** registry. It does not overwrite an existing registry or approve artwork automatically. The output must be in the same directory as its request; `src` paths remain relative to that directory. Files must stay inside it, including through symlinks. Registering does not copy the PNGs.

Review the image for suitability, identity, cropping and source information. Once reviewed, explicitly record `review.status: "approved"` in the request and register a fresh output filename; point your production at that registry. `assets validate` accepts a structurally valid registry containing drafts, but production composition rejects any **referenced** asset whose status is `draft` or `rejected`.

Kinds are `background`, `illustration` and `prop`. Provenance kinds are `generated`, `procedural`, `imported`, `supplied` and `captured`. Required provenance fields are `kind`, `creator`, `source` and `usage`; optional `tool`, `model` and `prompt` preserve available generation details. Do not invent a model or seed when a tool did not expose it. Metadata records declarations; it does not independently establish usage permission or artistic quality.

See the [request schema](../schemas/asset-request.schema.json) and [registry schema](../schemas/asset-registry.schema.json) for exact contracts. The registry adds measured `sha256`, `width`, `height` and `hasTransparency` to each request entry. Validation rejects duplicate IDs, changed bytes or dimensions, and an incorrect transparency declaration.

## Use assets in a production

Add these fields to a normal production brief, alongside its script, audio and timing paths:

```json
{
  "assetRegistry": "asset-registry.json",
  "assetStyle": "my-paper-style-v1",
  "defaultVisual": {
    "image": "study-room",
    "layout": "left",
    "focalPoint": [0.7, 0.5]
  }
}
```

This is a brief fragment, not a standalone project. `assetRegistry` and `assetStyle` must be supplied together. `assetStyle` must exactly match the registry's `styleId`; it is separate from the production palette `style` such as `paper` or `ocean`. Matching IDs checks declared compatibility, not visual similarity.

`defaultVisual` applies to automatically planned shots and beats without their own visual. A beat can replace it with `visual`:

```json
{
  "fromWord": "w21",
  "toWord": "w40",
  "heading": "A closer look",
  "intent": "Focus attention on the revised object.",
  "acting": "think",
  "visual": {
    "image": "study-room",
    "prop": "my-transparent-prop",
    "layout": "right",
    "focalPoint": [0.8, 0.5]
  }
}
```

Use actual word and asset IDs. Each visual needs `image`, `prop`, or both:

- `image` selects an approved `background` or `illustration` asset.
- `prop` selects an approved `prop` asset with **measured transparency**. An alpha-capable PNG whose pixels are fully opaque does not qualify.
- `layout: "left"` or `"right"` chooses the title/presenter side; the artwork occupies the other side. `"full"` uses the wider stage with a title panel. Omitting layout allows the composer's alternating default.
- `focalPoint` contains two values from 0 to 1 and controls crop alignment for the environment: `[0, 0]` favors the upper-left, `[1, 1]` the lower-right, and `[0.5, 0.5]` centers it. It does not track an object automatically.

Visual artwork selects the `illustration` template. Omit `template` or explicitly set it to `illustration`; combining visual artwork with another explicit template is rejected. A beat's optional `intent` records editorial purpose. Optional `acting` chooses `think`, `explain`, `point` or `celebrate` from Mira's existing pose kit; it does not articulate a raster prop.

The usual ordered word coverage, duration and text-fitting checks still apply. Run `compose` to inspect the editable plan and scene before exporting, or `produce` to compose and render together. Both require a new output directory.

## Portable outputs and stable references

The production bundle includes selected images under `assets/<sha256>.png`, plus a snapshot `asset-registry.json` carrying their provenance and review records. Repeated identical content is copied once. Unused registry entries are not copied into the bundle. The copied production brief points to its local registry, so the bundle can be moved with its source inputs.

The runtime scene's `images` array pins asset IDs, relative paths, hashes and dimensions. An image layer references an ID through `asset` and supplies its destination `size`. Low-level image layers support `fit: "contain"` or `"cover"`: contain preserves the complete image with empty space as needed; cover fills and clips to the layer's rectangle. `focalPoint` affects cover cropping. Standard position, opacity, scale, rotation, groups and clips still apply.

Images are inspected and decoded before frame drawing, with matching hashes and dimensions required. Reused content can share its decoded image. Rendering preloads images once rather than reading files for every frame. `validate`, `frame` and `render` all use this preparation path. Replacing a file without updating its pinned registry/scene produces an explicit hash mismatch; register a deliberate new version instead of bypassing the check.

## Current limits

| Input | Limit |
| --- | --- |
| Accepted art | Genuine static PNG only; animated PNG, SVG, JPEG and remote URLs are unsupported |
| PNG file | Regular file, at most 12 MiB |
| Image dimensions | 1–4096 pixels on each edge; at most 16,777,216 pixels |
| Registration request / registry | At most 256 KiB each |
| Registry / scene image entries | At most 32 entries; IDs must be unique |
| Registry decoded-pixel budget | 33,554,432 pixels, counting identical content hashes once |
| Scene image budget | 33,554,432 pixels, counting every `scene.images` entry, including repeated hashes |

The importer checks PNG structure, checksums, bounded scanline data, decoded dimensions and actual alpha. These technical checks do not establish meaningful subject accuracy or visual consistency. A valid registry can still exceed a scene's stricter reference-counted pixel budget if many IDs point to the same large image.

This release imports and reuses **static artwork**. A saved PNG is not a rigged actor or a layered parallax environment. Provider-driven generation, automatic identity locking, automatic speech alignment and learned story direction remain future work. Review the complete film with sound; the preview report remains `ready-for-preview`, with human creative review required.
