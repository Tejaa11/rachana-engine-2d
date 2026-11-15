import type { Clip, Ease, EvaluatedLayer, FrameState, Layer, PathCommand, Scene, Start, Vec2 } from './types.js';

/** Resolve an authoring time. Anchors reference reviewed word boundaries in seconds. */
export function resolveStart(scene: Scene, start: Start): number {
  if (typeof start === 'number') {
    if (!Number.isFinite(start)) throw new RangeError('Clip start must be finite.');
    return start;
  }
  const word = scene.narration?.words.find((item) => item.id === start.anchor);
  if (!word) throw new Error(`Unknown narration anchor: ${start.anchor}`);
  const offset = start.offset ?? 0;
  const boundary = start.edge === 'end' ? word.end : word.start;
  const result = boundary + offset;
  if (!Number.isFinite(boundary) || !Number.isFinite(offset) || !Number.isFinite(result)) {
    throw new RangeError(`Narration anchor ${start.anchor} must resolve to a finite time.`);
  }
  return result;
}

/** Samples are indices 0..N-1; the terminal state at durationSeconds is not an extra frame. */
export function frameCount(scene: Scene): number {
  const { durationSeconds, fps } = scene.output;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(fps) || fps <= 0) {
    throw new RangeError('Scene duration and frame rate must be finite and positive.');
  }
  const count = Math.ceil(durationSeconds * fps - 1e-9);
  if (!Number.isSafeInteger(count) || count <= 0) throw new RangeError('Scene frame count is out of range.');
  return count;
}

function easeAt(progress: number, ease: Ease): number {
  switch (ease) {
    case 'linear': return progress;
    case 'easeInCubic': return progress ** 3;
    case 'easeOutCubic': return 1 - (1 - progress) ** 3;
    case 'easeInOutCubic': return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
  }
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function applyClip(layer: EvaluatedLayer, clip: Clip, progress: number): void {
  const eased = easeAt(progress, clip.ease ?? 'linear');
  if (clip.property === 'position') {
    layer.position = [mix(clip.from[0], clip.to[0], eased), mix(clip.from[1], clip.to[1], eased)];
  } else {
    layer[clip.property] = mix(clip.from, clip.to, eased);
  }
}

function evaluateLayer(scene: Scene, layer: Layer, timeSeconds: number): EvaluatedLayer {
  const { clips = [], ...appearance } = layer;
  // Child and command arrays are detached below before this object is returned.
  const result = {
    ...appearance,
    position: [...layer.position] as Vec2,
    opacity: layer.opacity ?? 1,
    scale: layer.scale ?? 1,
    rotation: layer.rotation ?? 0,
  } as EvaluatedLayer;
  // Do not expose mutable arrays from the authored scene through a returned draw state.
  if ((result.type === 'rect' && layer.type === 'rect') || (result.type === 'image' && layer.type === 'image')) result.size = [...layer.size] as Vec2;
  if (result.type === 'image' && layer.type === 'image' && layer.focalPoint) result.focalPoint = [...layer.focalPoint] as Vec2;
  if (result.type === 'path' && layer.type === 'path') result.commands = layer.commands.map(command => [...command] as PathCommand);
  if (result.type === 'group' && layer.type === 'group') result.children = layer.children.map(child => evaluateLayer(scene, child, timeSeconds));

  const ordered = clips.map((clip) => ({ clip, at: resolveStart(scene, clip.start) }))
    .sort((a, b) => a.at - b.at);
  for (const { clip, at } of ordered) {
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
      throw new RangeError(`Clip duration must be finite and positive on layer ${layer.id}.`);
    }
    if (timeSeconds < at) continue;
    const sampled = Math.min(1, (timeSeconds - at) / clip.duration);
    // Snap numerical residue at a completed endpoint, including opacity-zero holds.
    const progress = sampled > 1 - 1e-12 ? 1 : sampled;
    applyClip(result, clip, progress);
  }
  return result;
}

/**
 * Pure frame evaluation, preserving input layer order. Each property holds its base
 * value before its first clip, takes the clip's `from` at its start, and holds `to`
 * after completion. Validation rejects overlapping clips on the same property.
 * Times outside the closed diagnostic interval [0, durationSeconds] throw;
 * exporters sample only the half-open interval [0, durationSeconds).
 */
export function evaluateScene(scene: Scene, timeSeconds: number): FrameState {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > scene.output.durationSeconds) {
    throw new RangeError('Frame time must be finite and within the scene duration.');
  }
  return {
    width: scene.output.width,
    height: scene.output.height,
    background: scene.background,
    layers: scene.layers.map((layer) => evaluateLayer(scene, layer, timeSeconds)),
  };
}
