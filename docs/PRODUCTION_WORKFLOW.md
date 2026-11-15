# Reusable production workflow

The composer turns a script, local voice WAV and matching supplied word timings into an editable illustrated pilot. All topics use the same planner, six vector templates, image-backed staging, three palettes, Mira character, layout rules and renderer. No topic-specific scene builder is needed.

This is a constrained local workflow in **0.1.0-alpha.4**. It provides a repeatable starting point; it cannot promise publishable artistic quality for every subject. The original five-shot hero remains an authored creative reference. The new gallery demonstrates what the shared defaults actually produce.

## Try the shared defaults

After the [quickstart](../QUICKSTART.md) installation:

```sh
npm run cli -- produce examples/learning-habit/production.json --out renders/my-learning-pilot
node tools/verify-smoke.mjs renders/my-learning-pilot/film.mp4
```

Open `renders/my-learning-pilot/film.mp4`. Try `examples/team-flow/production.json` and `examples/seed-story/production.json` with different new output directories. These briefs contain inputs, a title and palette, with **no custom shot definitions**. See the [generated gallery](../showcase/generated/README.md).

`compose` writes the same bundle without requiring FFmpeg or exporting MP4:

```sh
npm run cli -- compose examples/learning-habit/production.json --out renders/my-storyboard
npm run cli -- frame renders/my-storyboard/scene.json --frame 240 --out renders/my-frame.png
npm run cli -- render renders/my-storyboard/scene.json --out renders/my-storyboard/film.mp4
```

A new output directory is required. An existing directory is preserved. If video export fails after composition, the editable bundle remains available; fix the issue and use `render` rather than rerunning `produce` on the existing directory. There is no persistent queue, render cache or resume service yet.

## Supply your own inputs

Put these files together in a project folder:

```text
my-project/
  production.json
  script.txt
  voice.wav
  timing.json
```

A minimal `production.json`:

```json
{
  "schemaVersion": 1,
  "id": "my-explainer",
  "title": "My illustrated story",
  "script": "script.txt",
  "audio": "voice.wav",
  "timing": "timing.json",
  "style": "ocean"
}
```

The [production schema](../schemas/production.schema.json) defines the brief. Paths are relative to its directory and must stay inside it, including through symlinks. The brief is limited to 1 MiB, script to 128 KiB and timing file to 4 MiB. Extra brief properties are rejected.

`timing.json` supplies word-level data:

```json
{
  "durationSeconds": 18.4,
  "timingSource": "reviewed",
  "words": [
    { "id": "w1", "text": "A", "start": 0.12, "end": 0.24 },
    { "id": "w2", "text": "story", "start": 0.24, "end": 0.68 }
  ]
}
```

That excerpt illustrates two words; a runnable pilot needs **12–350 words** covering its full script. IDs must be unique; times must be finite, positive-length, ordered, non-overlapping and inside the declared duration. Declare `manual`, `reviewed` or `synthesis-events` accurately. Case, punctuation and Unicode compatibility differences are normalized for transcript matching; missing, extra or reordered text is rejected.

Current pilot duration is **6–90 seconds**, up to **12 shots**. Supply mono/stereo PCM16 WAV, 8–96 kHz, no larger than 64 MiB. WAV and timing duration must agree within one output frame. Defaults are 1920×1080 at 30 fps. Optional `output` supports matching 1280×720 or 1920×1080 at 24, 30 or 60 fps. These presets are 16:9 only.

A script and recording alone are not enough in this alpha: automatic transcription and forced alignment are still unimplemented. Converting an MP3 to WAV does not create word timings. Public example timestamps come from synthesis events and have approximate ends, as documented in each provenance record.

## How directing works

The local planner groups complete sentences into readable beats using supplied timestamps. It chooses opening/focus/cards/process/compare/closing staging, selects a decorative motif from literal subject keywords, and times matched item reveals to source phrases. It preserves complete headings rather than truncating them. A heading longer than 110 characters or label longer than 70 is rejected with a revision request. The layout fitter can reject shorter but visually dense text too; it never silently removes text.

A short script may contain fewer usable shots. An excessively long sentence needs editorial beats rather than arbitrary word cuts. Automatic sentence segmentation and keyword selection currently target English; bundled fonts do not establish equivalent directing quality for every language.

Captions use at most eight supplied words per cue and stop at sentence or shot boundaries. The reserved caption band stays separate from the main stage. Entrance motion, expressive acting and subtle drift are compiled to normal editable scene clips; no per-topic drawing logic is added to the renderer.

Palettes: `paper`, `ocean`, `midnight`. Decorative subjects: `idea`, `book`, `leaf`, `board`, `shield`. These are original vector motifs. A plant icon does not establish a scientifically accurate growth diagram; a board icon is not an authentic product screenshot. Most generic-motif shots trigger a report warning so missing subject art stays visible.

## Give stronger direction with beats

Optional `beats` replaces automatic shot selection while retaining shared staging, timing, validation and export. Each beat must cover a contiguous word range. The sequence must cover every word exactly once, in order. Use actual IDs from your timing file:

```json
{
  "beats": [
    {
      "fromWord": "w1",
      "toWord": "w20",
      "heading": "One question worth asking",
      "template": "opening",
      "subject": "book"
    },
    {
      "fromWord": "w21",
      "toWord": "w40",
      "heading": "Listen, then describe",
      "template": "process",
      "items": ["Listen for a moment", "Describe one detail"],
      "subject": "idea"
    },
    {
      "fromWord": "w41",
      "toWord": "w60",
      "heading": "Make room for the next question",
      "template": "closing"
    }
  ]
}
```

This is a brief fragment, not a standalone project. The example ranges assume 60 actual words. A beat needs at least 1.6 seconds. `cards` and `process` need two or three labels; `compare` displays exactly two. Editorial labels that do not match source phrases receive staggered reveal times and a review warning. A fast or late label reveal also flags its short reading hold.

This boundary allows a future director adapter to supply validated editorial choices without changing the renderer. No LLM/provider adapter is included in this release.

## Reviewable output

| Artifact | Use |
| --- | --- |
| `plan.json` | Selected shots, headings, word ranges, reveal times and caption cues |
| `scene.json` | Ordinary runtime scene; edit it or render any frame directly |
| `quality-report.json` | Input hashes, WAV measurements, sampled layout checks, motif coverage and review warnings |
| `production.json`, `script.txt`, `timing.json`, `voice.wav` | Portable source bundle with local references |
| `film.mp4`, `film.mp4.manifest.json` | H.264/AAC movie and encode measurements from `produce` |
| `film.mp4.verification.json` | Decode/frame/audio verification after running `verify-smoke.mjs` |

The report deliberately says `ready-for-preview`, with `humanReviewRequired: true`. It is not an aesthetic score or approval to publish. Composition checks input consistency, scene semantics, measured text fitting and representative frames. Export draws every frame; full decode verification separately checks the movie. Neither judges whether an illustration actually explains a claim.

For a finished film, review the complete cut with sound: hook and payoff, factual relevance, asset identity, caption legibility, reading holds, shot variety, transitions and audio. Revise the brief/beat choices, compose into a fresh directory and compare the new cut. Add unfamiliar scripts to regression tests when they expose a failure. A single beautiful hand-built example does not establish generalization.

## Reuse saved artwork

Optional `assetRegistry` and matching `assetStyle` connect a production to measured local PNG assets. `defaultVisual` or individual beat `visual` bindings choose environments/props and left/right/full illustration layouts. Optional `intent` and `acting` keep editorial purpose and pose choices in the brief. The [image workflow](IMAGE_ASSETS.md) documents registration, role/style checks and portable snapshots; [The Lantern Workshop](../examples/lantern-workshop/README.md) exercises these fields in a 48-second authored story.

## What still raises the ceiling

The current improvement establishes shared defaults and reproducible evidence. Broader creative direction still needs a real director adapter, subject-specific asset resolution with provenance, recorded-speech alignment, additional characters/actions, richer transitions/camera staging, sound design/mixing and editorial revisions. Long-form production and fresh-user testing remain separate roadmap work. See the [release standard](RELEASE_STANDARD.md) and [roadmap](../ROADMAP.md).
