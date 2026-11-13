# Contributing

Rachana Engine 2D is at the foundation/planning stage. Architecture feedback, small well-scoped improvements, and documentation corrections are welcome.

## Before a change

Read the [product plan](docs/ENGINE_PRODUCT_PLAN.md), [asset pipeline](docs/ASSET_PIPELINE.md), and [roadmap](ROADMAP.md). Open a design issue before adding a new runtime dependency, generation provider, schema, or major subsystem.

Keep proposed capabilities clearly labelled. A mock provider, a design diagram, or a successful API request is not evidence of a complete production feature.

## Local check

With Node.js 22 or newer:

```sh
npm run check
```

This foundation has no package dependencies. The check validates local documentation links, required repository files, package metadata, and the static banner. Media rendering and runtime tests will arrive with their implementations.

## Pull requests

- Explain the problem and resulting behavior.
- Link the relevant issue or milestone.
- Include meaningful validation for behavior changes and rendered evidence for visual changes.
- List limitations and any new configuration or dependency requirements.
- Preserve credits and disclose new third-party code or media.

Do not include credentials, private narration, unapproved screenshots, generated film masters, model weights, or machine-specific paths. Use small redistributable fixtures when examples are added.

## Collaboration

Be respectful and specific in review. Discuss the work, explain tradeoffs, and make it easy for another contributor to reproduce a finding. The maintainer reviews AI-assisted contributions using the same standards as other work.
