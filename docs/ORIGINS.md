# Origins and current boundaries

Rachana Engine 2D grew from custom Voxam and CareClinic animated explainers. Those productions explored procedural characters, narration-led timelines, camera composition, captions, browser previews, and Canvas/FFmpeg exports.

They demonstrated useful building blocks, but their production code remained tied to particular projects and a local environment. The public engine needs portable dependencies, shared data contracts, generic asset resolution, reusable motion, and persistent orchestration before it can produce new films from arbitrary inputs.

This repository starts that extraction with architecture and release requirements. The earlier private production workspace is not bundled here, and its rendered videos do not establish that the reusable public engine is already implemented.

The implementation will be judged by new, redistributable examples that render from the shared project format without custom scene functions. See [ROADMAP.md](../ROADMAP.md).
