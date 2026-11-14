# Scene format v1

This is the implemented authoring contract for the primitive-scene alpha. The [JSON Schema](../schemas/scene.schema.json) defines structure; [TypeScript types](../packages/core/src/types.ts) describe the same values; semantic validation checks relationships such as IDs, anchor resolution and clip overlap. It is a scene format, not yet the full project/shot/asset system described in the product plan.

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
| `layers` | Ordered list of primitive layers; later entries draw above earlier ones |
| `audio` | Optional local PCM16 WAV path and gain |
| `narration` | Optional supplied word times and declared timing source |

Current schema limits include width 16–3840, height 16–2160, fps 1–60, duration at most 1800 seconds, at most 500 layers and 1000 clips per layer. These resource bounds are not performance guarantees. Use even output dimensions for the current H.264/yuv420p encoder. Font size, geometry, text length and clip endpoints also have explicit bounds in the schema.

## Layers and coordinate system

All layers require a unique `id`, `type`, and `position: [x, y]`. Coordinates use output pixels with x rightward and y downward. Defaults are `opacity: 1`, `scale: 1`, `rotation: 0`. Scale is uniform and positive. Rotation uses degrees around the layer origin.

- `rect`: `size: [width, height]`, `fill`, optional corner `radius`. Position is its top-left origin.
- `circle`: `radius`, `fill`, optional `stroke` and `strokeWidth`. Position is its center.
- `text`: `text`, `fontSize`, `color`, `maxWidth`; optional `align` (`left`, `center`, `right`) and `lineHeight` (multiplier, default 1.25). Position is the first line's top and horizontal alignment origin.

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

Two clips on the same property of one layer may touch at a boundary but may not overlap. Distinct properties may animate together. There is no blending, spring solver, path curve, skeletal clip or clip-loop feature in v1.

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

The WAV duration must match the scene within one output frame; larger mismatches are rejected. Frame rounding may pad less than one frame of silence. Output audio is encoded to AAC with gain and a peak limiter. Gain is a scalar from 0 to 4; it is not automatic loudness normalization. There is no separate multi-track music/effects mix yet.

## Frame semantics and output

Authoring times are seconds. Export samples frame `n` at `n / fps`, with indices `0` through `N - 1`, where `N = ceil(durationSeconds × fps)` with numeric boundary tolerance. There is no extra terminal frame. The encoded duration may therefore exceed the planned duration by less than one frame.

The diagnostic evaluator can inspect the final state at `durationSeconds`, but that is not an additional encoded frame. Direct evaluation depends on the saved scene and requested time, not playback history. Identical draw states in one runtime do not promise identical font pixels or encoded bytes across platforms.

The CLI refuses existing output paths. MP4 output has a JSON manifest describing the scene, dimensions, frame count, timing source and encoder. Render validation and a manifest do not establish narration correctness, visual accuracy or artistic quality; inspect the result.
