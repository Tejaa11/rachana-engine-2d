import { readFileSync } from 'node:fs';
import { Ajv, type ErrorObject } from 'ajv';
import type { Issue, Layer, Scene, ValidationResult } from './types.js';

// The compiled module is dist/packages/core/src/validate.js. Resolve from this
// module rather than process.cwd(), so the CLI works outside the repository.
const schema = JSON.parse(readFileSync(new URL('../../../../schemas/scene.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true, strictNumbers: true });
const validateShape = ajv.compile(schema);
const FRAME_LIMIT = 108_000;
const EPSILON = 1e-9;

/** Bound a potentially cyclic JavaScript input before the recursive schema runs. */
function preflightLayerTree(input: unknown): Issue[] {
  if (!input || typeof input !== 'object' || !('layers' in input) || !Array.isArray(input.layers)) return [];
  if (input.layers.length > 500) return [{ path: '/layers', message: 'At most 500 root layers are supported' }];
  const pending = input.layers.map((value, index) => ({ value: value as unknown, path: `/layers/${index}`, depth: 1 }));
  const seen = new WeakSet<object>();
  let layers = 0, commands = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++layers > 1500) return [{ path: '/layers', message: 'Scene exceeds the 1500 total layer limit' }];
    if (item.depth > 8) return [{ path: item.path, message: 'Layer nesting exceeds the maximum depth of 8' }];
    if (!item.value || typeof item.value !== 'object' || Array.isArray(item.value)) continue;
    if (seen.has(item.value)) return [{ path: item.path, message: 'Layers must form a JSON tree without cycles or shared objects' }];
    seen.add(item.value);
    const layer = item.value as Record<string, unknown>;
    if (Array.isArray(layer.commands)) {
      if (layer.commands.length > 512) return [{ path: `${item.path}/commands`, message: 'At most 512 commands are supported per path' }];
      commands += layer.commands.length;
      if (commands > 20_000) return [{ path: '/layers', message: 'Scene exceeds the 20000 total path command limit' }];
    }
    // Inspect children even on malformed types: Ajv may visit that union branch.
    if (Array.isArray(layer.children)) {
      if (layer.children.length > 500) return [{ path: `${item.path}/children`, message: 'At most 500 children are supported per group' }];
      for (const [index, value] of layer.children.entries()) pending.push({ value, path: `${item.path}/children/${index}`, depth: item.depth + 1 });
    }
  }
  return [];
}

function schemaIssue(error: ErrorObject): Issue {
  let path = error.instancePath || '';
  if (error.keyword === 'additionalProperties') {
    const property = String(error.params.additionalProperty).replaceAll('~', '~0').replaceAll('/', '~1');
    path += `/${property}`;
  } else if (error.keyword === 'required') {
    path += `/${String(error.params.missingProperty)}`;
  }
  return { path: path || '/', message: error.message || 'Invalid value' };
}

/** Validate shape first, then the relationships that JSON Schema cannot express. */
export function validateScene(input: unknown): ValidationResult {
  const treeErrors = preflightLayerTree(input);
  if (treeErrors.length) return { valid: false, errors: treeErrors };
  if (!validateShape(input)) {
    const errors = (validateShape.errors || []).map(schemaIssue);
    return { valid: false, errors };
  }

  const scene = input as Scene;
  const errors: Issue[] = [];
  const issue = (path: string, message: string) => errors.push({ path, message });
  const duration = scene.output.durationSeconds;
  for (const dimension of ['width', 'height'] as const) {
    if (scene.output[dimension] % 2 !== 0) {
      issue(`/output/${dimension}`, 'MP4 output dimensions must be even for YUV420 encoding');
    }
  }
  const frameCount = Math.ceil(duration * scene.output.fps - 1e-9);
  if (frameCount < 1) issue('/output/durationSeconds', 'Scene duration must produce at least one video frame');
  if (frameCount > FRAME_LIMIT) issue('/output/durationSeconds', `Frame count exceeds the ${FRAME_LIMIT} frame limit`);

  const imageIds = new Set<string>();
  let imagePixels = 0;
  for (const [index, image] of (scene.images || []).entries()) {
    if (imageIds.has(image.id)) issue(`/images/${index}/id`, `Duplicate image asset ID: ${image.id}`);
    imageIds.add(image.id);
    const pixels = image.width * image.height;
    if (pixels > 16_777_216) issue(`/images/${index}`, 'Image exceeds the 16777216 pixel limit');
    imagePixels += pixels;
  }
  if (imagePixels > 33_554_432) issue('/images', 'Scene images exceed the 33554432 total decoded pixel limit');

  const words = new Map<string, { start: number; end: number }>();
  for (const [index, word] of (scene.narration?.words || []).entries()) {
    const path = `/narration/words/${index}`;
    if (words.has(word.id)) issue(`${path}/id`, `Duplicate word ID: ${word.id}`);
    else words.set(word.id, word);
    if (word.end <= word.start) issue(`${path}/end`, 'Word end must be after its start');
    if (word.end > duration + EPSILON) issue(`${path}/end`, 'Word extends beyond the scene duration');
    if (word.start >= duration) issue(`${path}/start`, 'Word must start before the scene ends');
  }

  const layerIds = new Set<string>();
  const visitLayer = (layer: Layer, layerPath: string): void => {
    if (layerIds.has(layer.id)) issue(`${layerPath}/id`, `Duplicate layer ID: ${layer.id}`);
    layerIds.add(layer.id);
    if (layer.type === 'image' && !imageIds.has(layer.asset)) issue(`${layerPath}/asset`, `Unknown image asset: ${layer.asset}`);

    const intervals = new Map<string, { start: number; end: number; index: number }[]>();
    for (const [clipIndex, clip] of (layer.clips || []).entries()) {
      const clipPath = `${layerPath}/clips/${clipIndex}`;
      let start: number;
      if (typeof clip.start === 'number') start = clip.start;
      else {
        const word = words.get(clip.start.anchor);
        if (!word) {
          issue(`${clipPath}/start/anchor`, `Unknown word anchor: ${clip.start.anchor}`);
          continue;
        }
        start = word[clip.start.edge || 'start'] + (clip.start.offset || 0);
      }
      const end = start + clip.duration;
      if (start < 0) issue(`${clipPath}/start`, 'Resolved clip start cannot be negative');
      if (end > duration + EPSILON) issue(`${clipPath}/duration`, 'Clip extends beyond the scene duration');
      const list = intervals.get(clip.property) || [];
      list.push({ start, end, index: clipIndex });
      intervals.set(clip.property, list);
    }

    // Distinct properties may animate together. Two clips on the same property
    // have no defined blend mode, so reject overlap rather than pick a winner.
    for (const [property, list] of intervals) {
      list.sort((a, b) => a.start - b.start || a.index - b.index);
      let previous = list[0];
      for (const current of list.slice(1)) {
        if (current.start < previous.end - EPSILON) {
          issue(`${layerPath}/clips/${current.index}/start`, `${property} clip overlaps clip ${previous.index} on the same layer`);
        }
        if (current.end > previous.end) previous = current;
      }
    }
    if (layer.type === 'group') {
      layer.children.forEach((child, index) => visitLayer(child, `${layerPath}/children/${index}`));
    }
  };
  scene.layers.forEach((layer, index) => visitLayer(layer, `/layers/${index}`));

  return { valid: errors.length === 0, errors };
}
