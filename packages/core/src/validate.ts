import { readFileSync } from 'node:fs';
import { Ajv, type ErrorObject } from 'ajv';
import type { Issue, Scene, ValidationResult } from './types.js';

// The compiled module is dist/packages/core/src/validate.js. Resolve from this
// module rather than process.cwd(), so the CLI works outside the repository.
const schema = JSON.parse(readFileSync(new URL('../../../../schemas/scene.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true, strictNumbers: true });
const validateShape = ajv.compile(schema);
const FRAME_LIMIT = 108_000;
const EPSILON = 1e-9;

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
  for (const [layerIndex, layer] of scene.layers.entries()) {
    const layerPath = `/layers/${layerIndex}`;
    if (layerIds.has(layer.id)) issue(`${layerPath}/id`, `Duplicate layer ID: ${layer.id}`);
    layerIds.add(layer.id);

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
  }

  return { valid: errors.length === 0, errors };
}
