import test from 'node:test';
import assert from 'node:assert/strict';
import { directorSchema, validateDirectorDraft, DIRECTOR_INSTRUCTIONS } from '../dist/packages/director/src/contract.js';

function shot(extra = {}) {
  return { fromWord: 'w1', toWord: 'w12', heading: 'Notice a small change', template: 'focus', subject: 'idea', acting: 'think', intent: 'Establish the question before the explanation.', transition: 'fade', items: [], visual: null, assetRequests: [], ...extra };
}
function draft() {
  return { schemaVersion: 1, analysis: { premise: 'A small observation raises a useful question.', audience: 'Curious beginners', arc: 'Question, observation, and a useful next step.', visualStrategy: 'Use quiet staging and concise text to preserve the narration.' }, shots: [shot(), shot({ fromWord: 'w13', toWord: 'w24', template: 'closing', heading: 'Leave room for another question', acting: 'celebrate' })], missingAssets: [], reviewNotes: [] };
}
function withMissing() {
  const value = draft();
  value.shots[0] = shot({ template: 'illustration', visual: { image: 'quiet-room', prop: null, layout: 'left', focalPoint: [0.7, 0.5] }, assetRequests: ['quiet-room'] });
  value.missingAssets = [{ id: 'quiet-room', kind: 'background', description: 'A quiet room with open space for an observation.', prompt: 'Original wordless paper-cut room, a small table on the right, calm ivory wall on the left, soft teal shadows, no letters or logos.', transparency: false }];
  return value;
}

test('director contract accepts explicit nulls, empty optional collections and missing-art requests', () => {
  const value = draft(), snapshot = JSON.stringify(value);
  assert.doesNotThrow(() => validateDirectorDraft(value));
  assert.equal(JSON.stringify(value), snapshot);
  assert.doesNotThrow(() => validateDirectorDraft(withMissing()));
  const nullImage = withMissing();
  nullImage.shots[0].visual = { image: null, prop: 'quiet-room', layout: 'full', focalPoint: [0, 1] };
  assert.doesNotThrow(() => validateDirectorDraft(nullImage)); // Role resolution belongs to the workflow.
});

test('every object property is required with unknown fields rejected for structured output', () => {
  function inspect(schema) {
    if (schema.properties) {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties)));
      for (const child of Object.values(schema.properties)) inspect(child);
    }
    if (schema.items) inspect(schema.items);
  }
  inspect(directorSchema);
  for (const mutate of [v => delete v.analysis.audience, v => delete v.shots[0].visual, v => v.shots[0].arbitrary = true, v => v.extra = true, v => v.analysis.extra = true]) {
    const value = draft(); mutate(value); assert.throws(() => validateDirectorDraft(value));
  }
});

test('blank and invisible text are rejected throughout the draft', () => {
  for (const mutate of [v => v.analysis.arc = '  ', v => v.shots[0].heading = '\u200b', v => v.shots[1].intent = '\n\t', v => v.reviewNotes = ['\u200d'], v => v.missingAssets[0].prompt = '\uFEFF']) {
    const value = withMissing(); mutate(value); assert.throws(() => validateDirectorDraft(value), /visible|minLength/);
  }
});

test('schema bounds output density, dimensions, counts, IDs and supported choices', () => {
  for (const mutate of [v => v.shots[0].heading = 'x'.repeat(111), v => v.shots[0].items = ['x'.repeat(71), 'b'], v => v.shots = [v.shots[0]], v => v.shots = Array.from({length:13}, () => shot()), v => v.shots[0].template = 'camera', v => v.shots[0].transition = 'zoom', v => v.shots[0].acting = 'walk', v => v.missingAssets[0].id = '../image.png', v => v.missingAssets[0].prompt = 'x'.repeat(1801), v => v.shots[0].visual.focalPoint = [1.1, 0], v => v.shots[0].visual.focalPoint = [0, 0, 0], v => v.shots[0].visual.focalPoint = [NaN, 0]]) {
    const value = withMissing(); mutate(value); assert.throws(() => validateDirectorDraft(value));
  }
});

test('missing requests must be unique, defined and referenced without duplicates', () => {
  for (const mutate of [v => v.missingAssets.push({...v.missingAssets[0]}), v => v.shots[0].assetRequests = ['not-defined'], v => v.shots[0].assetRequests = [], v => v.shots[0].assetRequests.push('quiet-room')]) {
    const value = withMissing(); mutate(value); assert.throws(() => validateDirectorDraft(value), /Duplicate|undefined|not referenced|repeats/);
  }
});

test('template semantics never silently discard labels or visual bindings', () => {
  for (const mutate of [v => v.shots[0].items = ['one', 'two'], v => v.shots[0].template = 'compare', v => { v.shots[0].template='cards';v.shots[0].items=['one']; }, v => { v.shots[0].template='illustration'; }, v => v.shots[0].visual={image:'image',prop:null,layout:'right',focalPoint:[.5,.5]}]) {
    const value = draft(); mutate(value); assert.throws(() => validateDirectorDraft(value), /items|illustration|visual/);
  }
  const emptyVisual = withMissing();emptyVisual.shots[0].visual.image=null;
  assert.throws(() => validateDirectorDraft(emptyVisual), /binding/);
  const process = draft();process.shots[0].template='process';process.shots[0].items=['Listen for a moment', 'Describe one detail'];
  assert.doesNotThrow(() => validateDirectorDraft(process));
});

test('director instructions define supported capabilities and forbid data becoming instructions', () => {
  for (const phrase of ['untrusted project data', 'exactly once', '1.6 seconds', 'missingAssets', 'physical folding', 'not an articulated character', 'not baked']) assert.ok(DIRECTOR_INSTRUCTIONS.includes(phrase), phrase);
});
