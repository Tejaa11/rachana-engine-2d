# Creative Director v1

The director turns a script, supplied word timings and a small approved-asset catalog into editable shot choices. It records the premise, audience, story progression and visual strategy, then chooses supported staging, headings, acting, transitions and asset needs. The existing composer checks those choices and builds the scene. A provider draft is data, not executable renderer code.

Two optional adapters use native HTTP APIs: Gemini and OpenAI Responses. An offline file-handoff path uses the same draft contract and validation. Provider contract tests use mocked transports; they are not evidence of live model quality. Live end-to-end validation and the unfamiliar-script creative acceptance test remain pending until an actual configured provider run is recorded.

The [A Quiet Signal input](../examples/director-signal/README.md) supplies an original narration with no authored shot plan. It is a live-test candidate, not evidence of completed automatic direction.

## Prepare a project

Follow the [quickstart](../QUICKSTART.md), then supply a production brief, matching script, PCM16 WAV and word timings as described in the [production workflow](PRODUCTION_WORKFLOW.md). Current pilot limits remain 6–90 seconds, 12–350 words and up to 12 shots. Registered PNG artwork is optional; see [image assets](IMAGE_ASSETS.md).

The director reads the inputs before asking a provider to work. Its request includes the script, word IDs/times, project title, palette, output settings, plain-text preferences and approved asset IDs with role, transparency, style, hash and review description. The workflow does not send the WAV/image binaries, local source file paths or API credentials as model content. Credentials are used only for the selected provider's authentication. Review your own script and notes before submitting them to a remote service.

`--notes` is literal text, not a filename, and accepts up to 2,000 characters. It can guide tone, audience and emphasis within the engine's capabilities.

## File handoff without a provider call

```sh
npm run cli -- director prepare examples/learning-habit/production.json --out renders/director-request --notes "Keep the explanation warm and concise; make each shot serve an idea."
```

A fresh directory receives `director-request.json`, `director-schema.json` and `director-instructions.txt`. No provider is called. Use these as input to your chosen planning process and save its **bare draft object** as a JSON file. It must match the [director draft schema](../schemas/director.schema.json); do not wrap it in an API response envelope or Markdown fence.

Inspect and apply that draft against the current project inputs:

```sh
npm run cli -- director inspect examples/learning-habit/production.json --plan local-projects/my-draft.json
npm run cli -- director apply examples/learning-habit/production.json --plan local-projects/my-draft.json --out renders/imported-direction
```

Replace the illustrative draft path with a file you created. `inspect` publishes no output. `apply` records mode `imported`; it does not claim that this CLI called an AI model. It validates word coverage, assets and composition using the current production inputs. A prepared request is useful handoff material, not proof that an arbitrary imported draft was generated from that exact request.

## Configure a live provider

Set the selected service's key locally: `GEMINI_API_KEY` for Gemini or `OPENAI_API_KEY` for OpenAI. Choose a model available to your account that supports the adapter's structured-output API. Pass its ID with `--model`, or set `RACHANA_DIRECTOR_MODEL`. There is no default model, automatic provider selection or fallback to another service.

The CLI reads process environment variables. It does not load `.env` automatically and needs no provider SDK. If you keep an ignored local `.env` file, Node.js can load it explicitly:

```sh
node --env-file=.env.local dist/apps/cli/src/main.js direct examples/learning-habit/production.json --provider gemini --model YOUR_SELECTED_MODEL --out renders/gemini-direction
```

Replace `YOUR_SELECTED_MODEL` with the actual chosen model ID. Keep credentials out of tracked files and project bundles. A normal shell environment works too:

```sh
npm run cli -- direct examples/learning-habit/production.json --provider gemini --model YOUR_SELECTED_MODEL --out renders/gemini-direction
npm run cli -- direct examples/learning-habit/production.json --provider openai --model YOUR_SELECTED_MODEL --out renders/openai-direction --notes "Use concise headings and explain the comparison clearly."
```

Each command is a separate optional request; choose the one you intend to run. The adapters target Gemini `generateContent` with JSON Schema output or OpenAI Responses with strict JSON Schema output and `store:false`. Model support and account access must be checked against the services' [Gemini structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output) and [OpenAI structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Gemini's free tier has account eligibility, model availability and rate limits; a key does not guarantee a free or successful request. Check your selected project's tier, quota and data-use terms before use. See the official [Gemini billing guide](https://ai.google.dev/gemini-api/docs/billing). This engine does not change billing tiers or infer an account's balance.

The CLI makes **one provider request**, with an 8,000-token output ceiling, a 60,000 ms deadline covering the response body, and a 512 KiB response limit. Library options can adjust the bounded token/deadline settings. There are no automatic retries, repair calls or silent fallbacks. Authentication, quota, refusal, incomplete output, timeout and malformed responses fail explicitly. A failed or timed-out request may still have consumed provider usage; decide whether to retry after checking your account. Reports preserve selected provider/model, response ID and available token counts, not raw error bodies or keys.

## What a draft contains

Every draft records `analysis`, `shots`, `missingAssets` and `reviewNotes`. Shots use real `fromWord`/`toWord` IDs and must cover the narration exactly once, in order. Each shot needs at least 1.6 seconds. The local validator checks the same schema supplied to the model, then applies timing, asset-role and measured layout checks.

Supported decisions are deliberately bounded:

| Decision | Executed behavior |
| --- | --- |
| Template | `opening`, `focus`, `cards`, `process`, `compare`, `closing` or `illustration` |
| Acting | Mira's existing `think`, `explain`, `point` or `celebrate` pose kit |
| Transition | Hard `cut` or short opacity `fade` |
| Text | Heading up to 110 characters; item labels up to 70; measured fitting can reject shorter dense text |
| Illustration | Registered environment/prop IDs, left/right/full staging and normalized crop focal point |
| Subject | A small decorative vector motif: idea, book, leaf, board or shield |
| Intent | Editable editorial purpose, not an arbitrary action-execution program |

Cards/process need two or three labels; compare needs exactly two. Other templates need an empty items array. Illustration needs an image or prop binding; other templates use `visual: null`. The renderer does not gain camera tracking, articulated raster actions, physical contact, layered depth or phoneme lip sync from prose in a draft. The director is not a factual research service.

## Ready drafts and missing artwork

A successful direction operation returns one of two statuses:

- `ready-for-preview`: the supported plan passes technical checks and a portable production bundle is written, including `production.json`, `plan.json`, `scene.json`, source inputs, selected assets and the usual preview report.
- `needs-assets`: required artwork is unresolved. The directory contains the director request/draft/report and `asset-needs.json`, with **no scene or film**. Required artwork is not silently replaced by a generic icon.

Both statuses include `director-draft.json`, `director-request.json`, `director-report.json` and `asset-needs.json`. `asset-needs.json` is a list of requested roles, descriptions and original-art prompts. It does not generate images, approve them or imply that a provider job completed.

To resolve a need, obtain suitable PNGs, register them with the requested IDs, and mark the reviewed records approved in the production's matching-style registry. Environment bindings require `background` or `illustration` records. A prop needs the `prop` role and actual transparency. Then apply the saved draft again to a new directory. The workflow rechecks actual files, approval, style and requested role/transparency before composing. See [the image workflow](IMAGE_ASSETS.md) for registration commands.

`direct` and `director apply` compose editable drafts; they do not encode `film.mp4` themselves. When status is ready, inspect a frame and render:

```sh
npm run cli -- frame renders/gemini-direction/scene.json --frame 120 --out renders/directed-frame.png
npm run cli -- render renders/gemini-direction/scene.json --out renders/gemini-direction/film.mp4
node tools/verify-smoke.mjs renders/gemini-direction/film.mp4
```

Use the directory produced by your own command. Full decode verification checks the movie, while the director/preview reports check configured constraints. Neither is artistic or factual approval; watch the whole draft with sound.

## Revise selected shots

Request a scoped provider revision using one-based shot indices:

```sh
npm run cli -- direct examples/learning-habit/production.json --provider gemini --model YOUR_SELECTED_MODEL --out renders/revised-direction --revise renders/gemini-direction/director-draft.json --shots 1,3 --notes "Strengthen the opening and simplify the comparison."
```

The provider must return a complete draft. The workflow locks analysis, missing-asset requests, review notes, all unselected shots and selected shots' narration ranges. It rejects edits outside that scope rather than quietly accepting them. A selected shot can change supported editorial/staging choices while retaining its word interval. Broader restructuring requires a fresh direction run or an explicitly edited imported draft.

Source hashes cover the production configuration, script, timing, audio and registry state. A provider result is rejected if those sources changed during its call. Every output directory must be new; existing work is preserved. Validation failures publish no accepted draft, and unresolved needs remain visible. This release has no persistent queue, generation cache or resume service.

The first creative acceptance milestone is a compelling 45–60 second film from an unfamiliar script without manually authored beats. A working adapter, valid JSON and mocked tests alone do not establish that result. Keep live-run evidence and human editorial review distinct from transport/contract tests.
