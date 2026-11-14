# Origins and current boundaries

Rachana Engine 2D grew from custom Voxam and CareClinic animated explainers. Those private productions explored procedural characters, narration-led timelines, camera composition, captions, browser previews and Canvas/FFmpeg exports. They informed the design but are not bundled as a portable engine.

The public repository now contains an independent declarative-scene alpha: a versioned schema, semantic validation, pure frame evaluation, a native renderer and local CLI. The public examples exercise rectangles, circles, wrapped text, transform animation and supplied narration anchors. Their reusable rendering path is separate from the older project-specific scene functions.

The narrated fixture uses an original script and synthetic formant narration with documented timing/provenance. It contains no private user recording, supplied product screenshots or earlier film master. The static banner is original branding; motion showcase files come from the current shared runtime.

This alpha is the first extraction step. It does not yet generate a whole film from arbitrary script/voice inputs, provide character rigs, create AI assets, align recorded speech or offer an editing studio. Those responsibilities remain on the [roadmap](../ROADMAP.md), with acceptance criteria in the [release standard](RELEASE_STANDARD.md).

[LambdaEngine2D](https://github.com/devesh95official/LambdaEngine2D) inspired the attention to modules, examples and repository documentation. Its code, media and branding are not included. Authorship and source/tool attribution are recorded in [THIRD_PARTY.md](../THIRD_PARTY.md).
