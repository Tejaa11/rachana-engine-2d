# Contributing

Rachana Engine 2D is a working declarative-scene alpha. Small runtime improvements, examples, tests, design feedback, and documentation corrections are welcome. The broader script-to-video agent remains planned.

## Understand the contracts

Start with [QUICKSTART.md](QUICKSTART.md), the [scene format](docs/SCENE_FORMAT.md), and [roadmap](ROADMAP.md). The [product plan](docs/ENGINE_PRODUCT_PLAN.md) and [asset pipeline](docs/ASSET_PIPELINE.md) describe the intended direction. Open a design issue before adding a new runtime dependency, generation provider, schema version or major subsystem.

Keep implemented and proposed features distinct. A mock provider, an API response, or an authored example is not evidence of automatic video direction. Document representation limits, input requirements and actual measurements.

## Local development

```sh
npm ci
npm run build
npm run check
npm test
npm run cli -- doctor
```

Use Node.js 22+. FFmpeg with the required encoders is needed for video rendering and media verification. The environment doctor reports missing dependencies. See the quickstart for `FFMPEG_PATH` and sample render commands.

## Validation for a change

Test behavior that can break: frame and timing boundaries, duplicate IDs, anchor resolution, clip overlap, text overflow, safe media paths and failed encodes. Use short scenes and small redistributable fixtures. For motion/layout changes, inspect representative PNGs and the complete encoded clip with sound. Describe the checks and their limits in the pull request.

Do not present a repository-link check as a rendering test. Benchmark claims need the fixture, environment, configuration and measurements. Keep paid provider tests opt-in when providers are introduced.

## Pull requests

- Explain the problem and the resulting behavior.
- Link the relevant issue or roadmap item.
- Include meaningful verification and visual evidence where applicable.
- Document configuration, dependencies, source notices and limitations.
- Preserve credits and disclose new third-party code, fonts or media.

Source TypeScript lives in `packages/` and `apps/`; generated `dist/` and local `renders/` are not source artifacts. Commit a showcase render only when intentionally selected, source-linked, small, reviewed and documented. Do not add private narration, unapproved screenshots, credentials, model weights or machine-specific dependency paths.

## Collaboration

Be respectful and specific. Explain tradeoffs and make findings reproducible. AI-assisted contributions are welcome with maintainer review, accurate credit, and the same verification standards as other work. The [MIT source license](LICENSE) and [third-party policy](THIRD_PARTY.md) describe the repository's current distribution boundaries.
