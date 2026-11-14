# Showcase

## Real engine output

![Silent motion excerpt](demo.gif)

- [Full narrated demo MP4](rachana-demo.mp4)
- [Preview still](preview.png)
- [Editable source scene](../examples/narrated-story/scene.json)
- [Script and media provenance](../examples/narrated-story/provenance.json)

The GIF is a silent excerpt. Watch the MP4 for narration and timing. Shapes, text and transform/reveal animation are rendered by the shared runtime from authored scene data. No autonomous director, generated character art, or automated speech alignment is demonstrated.

To render the underlying film, install/build using [QUICKSTART.md](../QUICKSTART.md), then run `npm run render:demo`. `npm run showcase` is the developer command for producing showcase assets; inspect its current output paths before replacing selected public artifacts. Local movie renders are normally kept outside the source tree.

## Branding and scope

The original [static banner](banner.svg) represents layers, motion paths and a timeline. It is branding rather than a screenshot of an editing studio.

These examples demonstrate the current alpha, not a final YouTube production standard. No render-speed benchmark, native/browser pixel parity or unsupported-platform guarantee is inferred from the showcase. Future reels should link to their exact source examples, describe external providers/manual preparation, and include publishable media provenance.
