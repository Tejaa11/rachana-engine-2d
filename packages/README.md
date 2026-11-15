# Shared engine modules

The current alpha has three TypeScript packages, used by the [local CLI](../apps/cli/src/main.ts). They are repository workspaces and are not separately published npm packages.

| Package | Implemented responsibility |
| --- | --- |
| [`@rachana/core`](core/src/index.ts) | Scene types, JSON Schema/semantic validation, anchor resolution, easing, frame counting and pure frame evaluation |
| [`@rachana/renderer`](renderer/src/draw.ts) | Native Canvas surfaces, bundled font registration, text wrapping, local scene/audio loading, PNG drawing and FFmpeg MP4 export |
| [`@rachana/creative`](creative/src/index.ts) | Original Mira character prefab and reveal/pop/arc/drift clip builders, compiled into ordinary group/path/shape data |

The core computes a draw state from a scene and time without mutating the authored input. Drawing and process/file side effects remain in the renderer/CLI. The scene contract is documented in [SCENE_FORMAT.md](../docs/SCENE_FORMAT.md); the initial rendering choice is recorded in the [ADR](../docs/adr/0001-renderer.md).

The reusable Mira prefab supports four poses, three expressions, wardrobe color, placement/scale and bounded acting. It is a designed character system, not generic automatic rigging or retargeting. Cameras, asset/provider packages, automatic alignment, workflow persistence, render caching and a browser editor remain future work. See the [roadmap](../ROADMAP.md). Add modules when a working responsibility needs them rather than creating empty packages to imply progress.

The [creative direction note](../docs/CREATIVE_DIRECTION.md) explains how the same components support a five-shot example. There is no scene-specific drawing code in the core renderer.
