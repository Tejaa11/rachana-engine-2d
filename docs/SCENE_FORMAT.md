# Scene format v1

This is the implemented authoring contract for the scene alpha, including nested vector compositions and local static image layers. The [JSON Schema](../schemas/scene.schema.json) defines structure; [TypeScript types](../packages/core/src/types.ts) describe the same values; semantic validation checks relationships such as IDs, anchor resolution and clip overlap. It is a scene format, not yet the full project/shot/asset system described in the product plan.

## Small complete scene

```json
{
  "schemaVersion": 1,
  "id": "first-motion",
  "output": { "width": 1280, "height": 720, "fps": 30, "durationSeconds": 2 },
  "background": "#101424",
  "layers": [
    {
      "id": "dot",
      "type": "circle",
      "position": [160, 360],
      "radius": 40,
      "fill": "#b9a3ff",
      "clips": [
        {
          "property": "position",
          "start": 0.2,
          "duration": 1.2,
          "from": [160, 360],
          "to": [1120, 360],
          "ease": "easeInOutCubic"
        }
      ]
    }
  ]
}
```

Save it as a JSON file, then use the [CLI](../QUICKSTART.md) to validate, export a frame or render it. No existing MP4 is needed for validation. Unknown fields and unsupported schema versions are rejected rather than silently ignored.

## Root fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Must be `1` |
| `id` | Nonempty scene identifier |
| `output` | Positive duration, integer dimensions and integer frame rate |
| `background` | `#RRGGBB` or `#RRGGBBAA` color |
| `layers` | Ordered list of shapes/groups; later entries draw above earlier ones |
| `audio` | Optional local PCM16 WAV path and gain |
| `images` | Optional content-pinned local PNG references: ID, relative src, SHA-256, width and height |
| `narration` | Optional supplied word times and declared timing source |

Current schema limits include width 16–3840, height 16–2160, fps 1–60 and duration at most 1800 seconds. Layer trees allow at most 500 root layers, 500 children per group, 1500 total nodes and nesting depth 8 (root layers are depth 1). Each path allows at most 512 commands; the whole scene allows at most 20,000 path commands. Each layer allows at most 1000 clips. Cycles and shared layer objects are rejected before recursive schema validation. These resource bounds are not performance guarantees. Use even output dimensions for the current H.264/yuv420p encoder. Font size, geometry, text length and clip endpoints also have explicit bounds in the schema.

## Layers and coordinate system

All layers require a unique `id`, `type`, and `position: [x, y]`. Coordinates use output pixels with x rightward and y downward. Defaults are `opacity: 1`, `scale: 1`, `rotation: 0`. Scale is uniform and positive. Rotation uses degrees around the layer origin.

- `rect`: `size: [width, height]`, `fill`, optional corner `radius`. Position is its top-left origin.
- `circle`: `radius`, `fill`, optional `stroke` and `strokeWidth`. Position is its center.
- `text`: `text`, `fontSize`, `color`, `maxWidth`; optional `align` (`left`, `center`, `right`), `lineHeight` (multiplier, default 1.25), and `fontWeight` (`normal` or `bold`). Position is the first line's top and horizontal alignment origin.

The renderer uses bundled font families; arbitrary fonts are not an authoring option yet. It wraps whitespace-delimited words, preserves paragraph breaks, and splits long tokens at grapheme boundaries without discarding text. A column narrower than one grapheme or visible text extending off-canvas produces an error. This does not implement a general automatic layout or collision-avoidance system.

## Property clips

Each clip has `property`, `start`, positive `duration`, `from`, `to`, and optional `ease`. The supported properties are:

| Property | Endpoint values |
| --- | --- |
| `position` | Two-number coordinate arrays |
| `opacity` | Numbers from 0 to 1 |
| `scale` | Positive numbers |
| `rotation` | Numbers in degrees |

Eases are `linear` (default), `easeInCubic`, `easeOutCubic`, and `easeInOutCubic`.

Before its first clip, a property holds its layer's base value. At the clip's start it takes the declared `from`; it then interpolates to `to` and holds that final value until a later clip on that property starts. Make `from` match the preceding value when continuity is intended. Clips are evaluated in resolved-start order, not JSON order.

Two clips on the same property of one layer may touch at a boundary but may not overlap. Distinct properties may animate together. There is no clip blending, spring solver, skeletal retargeting or clip-loop feature in v1. Curved vector artwork is supported independently; arc movement is supplied by a helper that builds ordinary position clips.


## Nested groups

A group has the same transform/opacity/clip fields as a shape and a `children` array. Child positions are local to their parent. Translation, rotation and scale compose through the hierarchy. Opacity multiplies down the tree: a parent at 0.5 with a child at 0.4 draws that child at 0.2 combined opacity. A hidden group hides its subtree. Painter order applies inside each group as well as at the root.

```json
{
  "id": "illustration",
  "type": "group",
  "position": [640, 360],
  "scale": 1.2,
  "opacity": 0.8,
  "children": [
    { "id": "illustration/dot", "type": "circle", "position": [0, 0], "radius": 40, "fill": "#b9a3ff" }
  ]
}
```

IDs must be unique across the entire layer tree, not just siblings. Groups are a reusable composition boundary; they do not create a camera, mask or physics system. All clips still use scene time, not a parent-local playback clock. Group evaluation is recursive and deterministic, and does not flatten away authored transforms.

## Curved vector paths

A `path` layer has `commands`, `fill`, and optional `stroke`/`strokeWidth`, plus the common transform and clip fields. Use a transparent fill such as `#00000000` for a stroke-only path. Commands use local coordinates:

| Tuple | Operation |
| --- | --- |
| `["M", x, y]` | Move to a point |
| `["L", x, y]` | Line to a point |
| `["Q", cx, cy, x, y]` | Quadratic curve with one control point |
| `["C", x1, y1, x2, y2, x, y]` | Cubic curve with two control points |
| `["Z"]` | Close the current subpath |

```json
{
  "id": "thread",
  "type": "path",
  "position": [100, 200],
  "fill": "#00000000",
  "stroke": "#7761c9",
  "strokeWidth": 4,
  "commands": [["M", 0, 0], ["Q", 80, -70, 160, 0]]
}
```

This is an explicit tuple format, not SVG markup or executable drawing code. Commands have exact arities and bounded numeric values. The renderer draws round line joins/caps for stroked paths. Path commands are currently static geometry; transform clips move the layer/group, not individual control points.

## Static image layers

An `image` layer requires `asset` (an ID in the scene's `images` array) and `size: [width, height]`. Position is the destination rectangle's top-left origin. `fit: "contain"` (default) preserves the full image inside the rectangle; `"cover"` fills and clips to that rectangle. Optional normalized `focalPoint: [x, y]` controls cover crop alignment, defaulting to `[0.5, 0.5]`. Image aspect ratio is preserved; standard transforms, opacity and clips still apply.

Each root image reference pins `id`, local `src`, actual lowercase SHA-256 and measured pixel dimensions. IDs must be unique and every image layer must reference a declared asset. The loader accepts genuine static PNGs inside the scene directory, including after symlink resolution. Hashes and dimensions must match before rendering. Missing/tampered assets fail even if their layers are hidden.

At most 32 references are allowed. Each file is at most 12 MiB with dimensions 1–4096 per edge and at most 16,777,216 pixels. The scene reference budget is 33,554,432 pixels, counting each declared entry. Repeated content can share its decoded image, but it still counts once per entry toward the scene budget. Animated PNG, SVG, JPEG, remote URLs and fully transparent empty artwork are unsupported. PNG structure, checksums and bounded scanline data are checked before native decode.

The CLI preloads images for `validate`, `frame` and `render`. Library callers use `prepareSceneImages(scene, sceneFile)` once, then pass its map to `drawFrame(canvas, evaluateScene(scene, time), images)`. Drawing performs no file reads. Static artwork is not a rig or a layered parallax set.

Use the [image workflow](IMAGE_ASSETS.md) to derive measurements through a registration request and preserve provenance/style/review records in a production bundle. Low-level scenes carry render references, while the registry holds the richer asset metadata.

## Creative prefabs

[`@rachana/creative`](../packages/creative/src/index.ts) builds ordinary scene data rather than adding special renderer branches. `createCharacter` returns an original Mira group with prefixed IDs, layered face/body, analytic two-link arms and four supported poses (`think`, `explain`, `point`, `celebrate`). Expressions are `curious`, `happy`, and `focused`; the options include shirt color, position, scale and a finite acting start/end interval. Acting intervals bound blinking, breathing and restrained gestures; parent shot opacity controls when the whole actor is visible.

The origin is the ground between Mira's shoes, with a crown height of roughly 390 local pixels. Her pose system is designed for this original actor, not imported-rig retargeting, universal automatic rigging or phoneme lip sync.

`appear`, `pop`, `arcMotion`, and `drift` return editable clips. `arcMotion` approximates an arc through segmented linear position clips; it is not an analytic path-following backend. The [creative direction note](CREATIVE_DIRECTION.md) and [builder source](../tools/build-creative-story.mjs) demonstrate reuse.

## Word anchors

Supply words as scene data:

```json
"narration": {
  "timingSource": "reviewed",
  "words": [
    { "id": "w1", "text": "Hello", "start": 0.5, "end": 0.9 }
  ]
}
```

A clip's `start` can be a second value or an anchor object:

```json
"start": { "anchor": "w1", "edge": "start", "offset": 0.1 }
```

This example resolves to 0.6 seconds. `edge` defaults to `start`; `offset` defaults to zero and may be negative if the resolved clip remains inside the scene. `edge: "end"` uses the supplied end boundary. Unknown word IDs, duplicate word IDs, nonpositive word spans, or clips/words extending beyond the duration are rejected.

`timingSource` is `manual`, `reviewed`, or `synthesis-events`. It documents where the supplied times came from; it does not run a transcription/alignment algorithm. The included narration uses actual synthesis-start events, with approximate ends documented in its [timing file](../examples/narrated-story/timing.json). The engine does not infer phoneme lip sync.

## Audio

```json
"audio": { "src": "voice.wav", "gain": 0.9 }
```

Paths resolve relative to the scene directory. Only files inside that directory are accepted, including after symlink resolution; absolute paths, remote URLs and parent-directory traversal are rejected. The alpha accepts one uncompressed PCM16 WAV track (mono/stereo, 8–96 kHz, up to 64 MiB). It does not accept playlists or compressed MP3 as scene input.

The WAV duration must match the scene within one output frame; larger mismatches are rejected. Frame rounding may pad less than one frame of silence. Output audio is encoded to AAC with gain and a peak limiter. Gain is a scalar from 0 to 4; it is not automatic loudness normalization. There is no separate runtime multi-track music/effects mixer. The creative example imports one precomposed WAV containing its narration and original procedural bed/cues; that example production step is not a new runtime audio API.

## Frame semantics and output

Authoring times are seconds. Export samples frame `n` at `n / fps`, with indices `0` through `N - 1`, where `N = ceil(durationSeconds × fps)` with numeric boundary tolerance. There is no extra terminal frame. The encoded duration may therefore exceed the planned duration by less than one frame.

The diagnostic evaluator can inspect the final state at `durationSeconds`, but that is not an additional encoded frame. Direct evaluation depends on the saved scene and requested time, not playback history. Identical draw states in one runtime do not promise identical font pixels or encoded bytes across platforms.

The CLI refuses existing output paths. MP4 output has a JSON manifest describing the scene, dimensions, frame count, timing source and encoder. Render validation and a manifest do not establish narration correctness, visual accuracy or artistic quality; inspect the result.
