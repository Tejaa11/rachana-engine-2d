# Creative direction — an idea brought to life

The `0.1.0-alpha.2` showcase revisits the same approximately 25-second script and synthetic narration with authored storytelling, a recurring character and an original editorial visual system. The [builder source](../tools/build-creative-story.mjs) compiles reusable components into [ordinary scene JSON](../examples/narrated-story/creative.scene.json). The generic core/renderer evaluate those layers; they do not contain a separate hard-coded drawing function for each shot.

This is an authored creative example. It demonstrates reusable direction tools, not an automatic director or a claim that all generated videos meet a finished YouTube production standard.

## Visual language

Warm paper backgrounds, a clear navy outline and muted accent colors keep the film readable while giving each beat a different setting. Curves, irregular paper shapes, little stars and expressive human poses add personality. Dense exact text remains engine typography rather than text baked into art.

| Token | Color | Use |
| --- | --- | --- |
| Paper | `#f8f1e5` | Stable, warm reading surface |
| Ink | `#25263e` | Main text and outlines |
| Purple | `#7761c9` | The voice/thread, identity and ending |
| Lilac | `#d9c9ef` | Softer supporting forms |
| Coral | `#ed9672` | Warmth and attention accents |
| Mint | `#70a69b` | Revision/card contrast |
| Gold | `#e9bd5c` | The idea spark and Moon |
| Night | `#202841` | The illustrated space sequence |

Mira is an original adult creator with a curly navy bob, warm tan skin, coral shirt, navy trousers and sneakers. Outfit variants use the same identity rather than a new independently generated face. Her expression, pose, placement and shirt color are prefab options. The scene uses thinking, pointing, explaining and celebrating silhouettes; breathing, head tilt, blinks and small arm gestures remain bounded by shot intervals. No lip-sync claim is made for the fixed illustrated mouth shapes.

## Five authored shots

Times below are approximate cuts from the supplied synthesis-start events. Short opacity overlaps soften the handoff, so a shot can remain visible briefly after the next begins.

| Interval | Story purpose | Composition and movement |
| --- | --- | --- |
| 0.00–4.90 s: an idea | Give the abstract opening a person and a tangible creative task | Mira thinks beside illustrated drafts; an emerging spark and curved trail turn a thought into a visible motif. |
| 4.90–13.35 s: a world | Make “Earth” and “Moon” concrete, with a readable spatial relationship | A night palette, original vector continents, orbit and small smiling Moon accompany a pointing Mira. The Moon follows segmented arc clips rather than a diagonal jump. The diagram is explicitly illustrative and not to scale. |
| 13.35–16.30 s: anchors | Connect narration timing to a visible rhythm | A voice-like thread joins colored nodes while Mira explains. The nodes appear at supplied word cues. This depicts timing anchors rather than claiming that the engine inferred them. |
| 16.30–20.16 s: revision | Make editing feel like creative choice | Angled paper cards represent color, timing and expression; consistent typography and palette keep them related. The same actor points toward the work. |
| 20.16–24.83 s: payoff | Bring back the original idea as a clear ending | Purple framing, short final copy, a celebrating Mira and a floating spark complete the visual callback. |

A stable top identity strip and reserved lower caption band remain separate from the illustrated sets. Text is authored for reading rather than used as decoration over every subject. The scene remains short; longer pacing, greater acting variety and full production review are still release goals.

## Components that are reused

- Nested groups supply local transforms, inherited opacity and explicit scene/prefab boundaries.
- Curved path tuples describe hair, clothes, facial details, organic backgrounds, diagrams, stars and connecting lines.
- `createCharacter` builds the same Mira identity in multiple poses and color variants.
- `appear`/`pop` handle reveals, `arcMotion` compiles orbit movement, and `drift` adds restrained movement to the closing spark.
- Existing text primitives provide ordinary/bold styling and wrapping using the already bundled fonts.
- All timing is editable data. Word anchors come from the included synthetic-narration fixture, not a new speech-alignment system.

The original voice stays recognizable. A quiet original procedural music/effects bed is composed by [build-creative-audio.mjs](../tools/build-creative-audio.mjs) into a single WAV with that narration. This adds a designed soundtrack to the example without claiming a runtime multi-track mixer, automatic music selection or an external music-generation provider.

## Reproduce and revise

After installation/build, run `npm run render:creative` to write `renders/rachana-creative.mp4`. The [showcase](../showcase/README.md) links the selected movie and silent motion excerpt. The earlier [shape study](../examples/narrated-story/scene.json) remains available through `npm run render:demo`.

To change the direction, edit the builder or resulting JSON. Use the builder for repeatable authored variants; preserve direct JSON edits before rebuilding because the builder rewrites its output scene. Validate and render to a new filename. Inspect every shot, motion transitions, caption band and encoded audio rather than inferring creative success from schema validity.

The next extension should deepen reusable acting and shot composition, then connect them to asset planning and the director workflow. A new bespoke renderer per video would defeat the purpose of this engine.

Character acting intervals are limited to 600 seconds within the scene time budget. Longer performances must be split into smaller authored intervals.
