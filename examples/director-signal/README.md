# A Quiet Signal — unfamiliar director input

This original fictional narration is a live-test candidate for Creative Director v1: **132 words, 48.86 seconds**, with no authored beats, default visual, draft plan or story-specific scene code.

[production.json](production.json) references only [script.txt](script.txt), the local synthetic [voice.wav](voice.wav) and [timing.json](timing.json). [provenance.json](provenance.json) records standard formant synthesis settings, exact input hashes and the limitations of approximate word ends. The optional external synthesis tool is not required for rendering these saved inputs.

Prepare a request without credentials:

```sh
npm run cli -- director prepare examples/director-signal/production.json --out renders/signal-request --notes "Tell a warm small story. Make the invitation and the connection visually clear. Keep headings concise."
```

For a live Gemini run after choosing a compatible model and configuring your own key:

```sh
node --env-file=.env.local dist/apps/cli/src/main.js direct examples/director-signal/production.json --provider gemini --model YOUR_SELECTED_MODEL --out renders/signal-directed
```

Use a new output directory. Follow [Creative Director v1](../../docs/CREATIVE_DIRECTOR.md) for provider setup, file handoff, missing-artwork resolution and revisions. A live provider may request subject-specific artwork; `needs-assets` does not contain a scene or film. Register suitable reviewed PNGs, then apply the saved draft to continue. The engine does not silently substitute a generic illustration for a declared required asset.

This fixture establishes new input and supplied narration timing. It is **not** a completed automatically directed film, a live-provider transcript or a passed artistic acceptance test. Provider mocks elsewhere test transport/validation; a real model run and a reviewed resulting film must be recorded separately before that milestone is claimed.
