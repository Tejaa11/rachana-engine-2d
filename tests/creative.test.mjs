import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../dist/packages/creative/src/character.js';
import { evaluateScene } from '../dist/packages/core/src/evaluate.js';
import { validateScene } from '../dist/packages/core/src/validate.js';

const poses = ['think', 'explain', 'point', 'celebrate'];
const expressions = ['curious', 'happy', 'focused'];
function nodes(layer) { return [layer, ...(layer.type === 'group' ? layer.children.flatMap(nodes) : [])]; }
function scene(actor) {
  return { schemaVersion: 1, id: 'character-fixture', output: { width: 1280, height: 720, fps: 30, durationSeconds: 8 }, background: '#FFF2DC', layers: [actor] };
}
function actor(pose, extra = {}) {
  return createCharacter({ id: 'mira', position: [480, 620], pose, start: 1, end: 6, ...extra });
}

test('all four pose silhouettes and expressions use valid engine-native scene data', () => {
  for (const pose of poses) for (const expression of expressions) {
    const value = actor(pose, { expression });
    const result = validateScene(scene(value));
    assert.deepEqual(result.errors, [], `${pose}/${expression}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.valid, true);
    assert.equal(value.type, 'group');
    assert.ok(nodes(value).some(node => node.type === 'path'));
    assert.equal(nodes(value).some(node => node.type === 'text'), false);
  }
  assert.equal(new Set(poses.map(pose => JSON.stringify(actor(pose)))).size, 4);
});

test('prefixed IDs are stable and multiple actors do not collide', () => {
  const first = actor('think');
  const ids = nodes(first).map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'mira');
  assert.ok(ids.slice(1).every(id => id.startsWith('mira/')));
  assert.deepEqual(ids, nodes(actor('think')).map(node => node.id));
  const other = actor('explain', { id: 'other' });
  const value = scene(first); value.layers.push(other);
  assert.deepEqual(validateScene(value), { valid: true, errors: [] });
});

test('acting clips stay inside the finite requested interval and settle afterwards', () => {
  const value = actor('explain');
  const clips = nodes(value).flatMap(node => node.clips ?? []);
  assert.ok(clips.length > 0);
  for (const clip of clips) {
    assert.equal(typeof clip.start, 'number');
    assert.ok(clip.start >= 1);
    assert.ok(clip.duration > 0);
    assert.ok(clip.start + clip.duration <= 6 + 1e-9);
  }
  const authored = scene(value);
  assert.deepEqual(evaluateScene(authored, 6), evaluateScene(authored, 7.9));
  const noInterval = createCharacter({ id: 'still', position: [480, 620], pose: 'point' });
  assert.equal(nodes(noInterval).flatMap(node => node.clips ?? []).length, 0);
});

test('direct seeking and repeated prefab creation are deterministic without input mutation', () => {
  const options = Object.freeze({ id: 'mira', position: Object.freeze([480, 620]), pose: 'celebrate', expression: 'happy', start: 1, end: 6 });
  const before = JSON.stringify(options);
  const first = createCharacter(options);
  const second = createCharacter(options);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(options), before);
  const authored = scene(first);
  const snapshot = JSON.stringify(authored);
  const expected = evaluateScene(authored, 2.5);
  for (const time of [5.8, 1, 4.4, 0, 2.5]) evaluateScene(authored, time);
  assert.deepEqual(evaluateScene(authored, 2.5), expected);
  assert.equal(JSON.stringify(authored), snapshot);
  second.position[0] = -100;
  assert.deepEqual(first.position, [480, 620]);
});

test('wardrobe overrides are localized and invalid authoring options fail early', () => {
  const red = actor('think');
  const blue = actor('think', { shirt: '#489FB5' });
  const redShirt = nodes(red).find(node => node.id === 'mira/shirt');
  const blueShirt = nodes(blue).find(node => node.id === 'mira/shirt');
  assert.notEqual(redShirt.fill, blueShirt.fill);
  assert.deepEqual(nodes(red).find(node => node.id === 'mira/face'), nodes(blue).find(node => node.id === 'mira/face'));
  for (const extra of [{ id: '' }, { position: [NaN, 0] }, { scale: 0 }, { shirt: 'red' }, { start: -1 }, { start: 3, end: 2 }, { end: Infinity }, { pose: 'walk' }, { expression: 'unknown' }]) {
    assert.throws(() => actor('think', extra));
  }
});


test('character acting generation has a finite work budget', () => {
  assert.throws(() => actor('think', { start: 0, end: 1e12 }), /limited/);
  assert.throws(() => actor('think', { start: 0, end: 601 }), /600-second/);
  const value=scene(actor('explain',{start:0,end:600}));
  value.output.durationSeconds=600;
  assert.deepEqual(validateScene(value).errors,[]);
});
