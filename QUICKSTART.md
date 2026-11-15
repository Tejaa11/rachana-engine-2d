# Quickstart

This guide runs the current declarative-scene alpha. It does not require an AI provider, cloud account, or private recording.

## Requirements

- Node.js 22 or newer, with npm.
- Git to clone the repository.
- A local FFmpeg executable with `libx264` for H.264 and AAC encoding. Install it through your platform's package manager or a suitable build linked by the [FFmpeg project](https://ffmpeg.org/download.html). FFmpeg is not bundled by this repository.
- Network access for the initial `npm ci`. Example rendering runs locally after installation.

Native Canvas packages are declared in the lockfile. Package availability and font rasterization can differ by platform. A CI configuration is not a guarantee that every OS/architecture is supported; consult actual workflow results and report your environment when filing a problem.

## Install and inspect the environment

```sh
git clone https://github.com/Tejaa11/rachana-engine-2d.git
cd rachana-engine-2d
npm ci
npm run build
npm run cli -- doctor
```

`doctor` reports the Node version, Canvas loading, bundled font registration, and FFmpeg availability. It exits unsuccessfully if fonts or FFmpeg are unavailable. It also states that automatic alignment and generation providers are not implemented.

If FFmpeg is installed outside `PATH`, set `FFMPEG_PATH` to the executable before running the commands. For example, in a POSIX shell:

```sh
export FFMPEG_PATH="/path/to/ffmpeg"
```

That example path must be replaced with your installation's executable path. In PowerShell use `$env:FFMPEG_PATH = "C:/path/to/ffmpeg.exe"` instead.

## Render the two-second smoke scene

```sh
npm run cli -- validate examples/minimal-scene/scene.json
npm run render:smoke
npm run verify:smoke
```

The MP4 is written to `renders/minimal.mp4`; its render manifest is `renders/minimal.mp4.manifest.json`. Validation checks authoring data and required local audio references; it does not require a final video to exist.

## Render the narrated example

```sh
npm run cli -- validate examples/narrated-story/scene.json
npm run render:demo
```

Open `renders/rachana-demo.mp4` in a local media player. This approximately 25-second example uses bundled synthetic narration, original script text, and supplied word-start events. You can also [watch the committed demo](showcase/rachana-demo.mp4).

The example audio is already included. You do not need eSpeak or another TTS tool to render it. Its [provenance file](examples/narrated-story/provenance.json) documents how that development fixture was generated, including approximate word-end timing.

## Render the creative character showcase

```sh
npm run render:creative
```

This creates `renders/rachana-creative.mp4` from `examples/narrated-story/creative.scene.json`. It uses the same narration with an original quiet precomposed music/cue bed, five authored compositions, and the reusable Mira character. The public showcase now displays this cut. The earlier shape-only scene is still available through `render:demo`.

`npm run creative:prepare` regenerates the example mix and scene from the authored builders; it replaces those generated inputs, so preserve any manual JSON edits first. This is not automatic directing or speech alignment.

## Compose a new narrated pilot

```sh
npm run cli -- produce examples/learning-habit/production.json --out renders/my-learning-pilot
node tools/verify-smoke.mjs renders/my-learning-pilot/film.mp4
```

This uses shared directing templates rather than a topic-specific scene builder. `compose` writes the same editable plan/scene/input bundle without video export; `produce` also creates `film.mp4`. Both require a new output directory. See the [production workflow](docs/PRODUCTION_WORKFLOW.md) for your own script, WAV, matching word timings, style choices and optional editorial beats. Current scope is 6–90 second illustrated pilots; reports require human creative review.

## Edit and inspect a frame

Change a layer's `fill`, `position`, text, or clip values in the example scene. See the [scene format](docs/SCENE_FORMAT.md) for supported fields. Then:

```sh
npm run cli -- validate examples/narrated-story/scene.json
npm run cli -- frame examples/narrated-story/scene.json --frame 30 --out renders/frame-30.png
npm run cli -- render examples/narrated-story/scene.json --out renders/revision-1.mp4
```

Frame indices begin at zero. Frame 30 is sampled at `30 / fps` seconds. An index outside the scene's frame range is rejected.

The CLI never overwrites an existing output. Use another filename for a new revision, or deliberately remove an old output yourself. The renderer writes to a temporary file and publishes the MP4 after encoding succeeds.

## Your own audio and anchors

Place an uncompressed PCM16 WAV file inside the same directory as your scene, set `audio.src` to a relative path, and provide `narration.words` if clips need word anchors. Choose timing-source labels accurately: `manual`, `reviewed`, or `synthesis-events`. The engine does not transcribe or align that recording for you.

Audio paths may not escape the scene directory, including through a symlink. Remote audio URLs and absolute audio paths are rejected. The alpha supports mono/stereo PCM16 WAV at 8–96 kHz, up to 64 MiB. To convert an MP3 using an FFmpeg executable on `PATH`, run:

```sh
ffmpeg -n -i input.mp3 -c:a pcm_s16le -ar 48000 -ac 1 voice.wav
```

Put the resulting `voice.wav` inside the scene directory. This conversion does not generate timing anchors. The scene duration must match the WAV duration within one output frame; larger mismatches are rejected. Final frame rounding may add less than one frame of silence. Gain and a peak limiter are applied, but this alpha does not automatically normalize loudness or mix separate music/effects tracks.

## Checks

```sh
npm run check
npm test
```

The repository check is separate from the built/runtime tests. Rendering and smoke verification require FFmpeg. The final MP4 should still be watched with sound after changes; passing a schema or decode check does not judge artistic quality.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `dist/...` cannot be found | Run `npm run build` after installation or TypeScript edits. |
| FFmpeg missing | Put an executable on `PATH` or set `FFMPEG_PATH`; run `doctor` again. |
| Encoder unavailable | Use an FFmpeg build with `libx264` and AAC support. |
| Output already exists | Use a new `--out` filename. |
| Unknown word anchor | Ensure the clip's anchor ID exists in `narration.words`. |
| Overlapping clips | Same-property clips on one layer cannot overlap. Distinct properties may animate simultaneously. |
| Visible text outside canvas | Adjust text position, column width, font size, transform or animation timing. Text is not silently truncated to fit. |
| Native Canvas package fails to load | Capture OS, architecture, Node version and install error; do not substitute private machine paths. |
| Text glyphs/shaping look wrong | Reduce to a small fixture and report it. Bundled fonts do not guarantee support for every language. |

See [CONTRIBUTING.md](CONTRIBUTING.md) for issue and pull-request expectations.
