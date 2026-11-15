import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScene, frameCount, resolveStart } from '../dist/packages/core/src/evaluate.js';

function scene(clips = []) {
  return {
    schemaVersion: 1,
    id: 'evaluation-fixture',
    output: { width: 640, height: 360, fps: 30, durationSeconds: 4 },
    background: '#102030',
    narration: { timingSource: 'reviewed', words: [{ id: 'word-a', text: 'Hello', start: 1, end: 1.5 }] },
    layers: [{ id: 'box', type: 'rect', size: [40, 50], fill: '#ffaa22', position: [5, 10], clips }],
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

test('base values, start, midpoint, endpoint and hold are explicit', () => {
  const input = scene([{ property: 'position', start: 1, duration: 1, from: [10, 20], to: [110, 220] }]);
  assert.deepEqual(evaluateScene(input, 0).layers[0].position, [5, 10]);
  assert.deepEqual(evaluateScene(input, 1).layers[0].position, [10, 20]);
  assert.deepEqual(evaluateScene(input, 1.5).layers[0].position, [60, 120]);
  assert.deepEqual(evaluateScene(input, 2).layers[0].position, [110, 220]);
  const final = evaluateScene(input, 4).layers[0];
  assert.deepEqual(final.position, [110, 220]);
  assert.equal(final.opacity, 1);
  assert.equal(final.scale, 1);
  assert.equal(final.rotation, 0);
  assert.equal('clips' in final, false);
});

test('word anchors support start/end boundaries and signed offsets', () => {
  const input = scene([{ property: 'opacity', start: { anchor: 'word-a', edge: 'end', offset: 0.25 }, duration: 0.5, from: 0, to: 1 }]);
  assert.equal(resolveStart(input, { anchor: 'word-a' }), 1);
  assert.equal(resolveStart(input, { anchor: 'word-a', offset: -0.25 }), 0.75);
  assert.equal(resolveStart(input, { anchor: 'word-a', edge: 'end', offset: 0.25 }), 1.75);
  assert.equal(resolveStart(input, 0.125), 0.125);
  assert.equal(evaluateScene(input, 1.75).layers[0].opacity, 0);
  assert.equal(evaluateScene(input, 2).layers[0].opacity, 0.5);
});

test('easing curves use known samples and scalar properties preserve their defaults', () => {
  for (const [ease, expected] of [['linear', 0.25], ['easeInCubic', 0.015625], ['easeOutCubic', 0.578125], ['easeInOutCubic', 0.0625]]) {
    const input = scene([{ property: 'opacity', start: 0, duration: 1, ease, from: 0, to: 1 }]);
    assert.equal(evaluateScene(input, 0.25).layers[0].opacity, expected);
    assert.equal(evaluateScene(input, 1).layers[0].opacity, 1);
  }
  const input = scene([
    { property: 'scale', start: 0, duration: 2, from: 1, to: 2 },
    { property: 'rotation', start: 0, duration: 2, from: 0, to: 90 },
  ]);
  assert.equal(evaluateScene(input, 1).layers[0].scale, 1.5);
  assert.equal(evaluateScene(input, 1).layers[0].rotation, 45);
});

test('sequential property clips sort by resolved start and hold between clips', () => {
  const input = scene([
    { property: 'position', start: 3, duration: 0.5, from: [100, 100], to: [200, 200] },
    { property: 'position', start: 0.5, duration: 0.5, from: [0, 0], to: [100, 100] },
  ]);
  assert.deepEqual(evaluateScene(input, 2).layers[0].position, [100, 100]);
  assert.deepEqual(evaluateScene(input, 3.25).layers[0].position, [150, 150]);
  assert.deepEqual(evaluateScene(input, 4).layers[0].position, [200, 200]);
});

test('shuffled direct seeks equal sequential evaluation without mutating authored data', () => {
  const input = freezeDeep(scene([{ property: 'position', start: 0, duration: 2, ease: 'easeInOutCubic', from: [0, 0], to: [100, 80] }]));
  const before = JSON.stringify(input);
  const sequential = new Map();
  for (let frame = 0; frame < frameCount(input); frame++) sequential.set(frame, evaluateScene(input, frame / 30));
  for (const frame of [119, 45, 0, 73, 12, 60, 45]) {
    assert.deepEqual(evaluateScene(input, frame / 30), sequential.get(frame));
    assert.deepEqual(evaluateScene(structuredClone(input), frame / 30), sequential.get(frame));
  }
  assert.equal(JSON.stringify(input), before);
  const returned = evaluateScene(input, 0);
  returned.layers[0].position[0] = 123;
  returned.layers[0].size[0] = 456;
  assert.deepEqual(input.layers[0].position, [5, 10]);
  assert.deepEqual(input.layers[0].size, [40, 50]);
});

test('input layer order controls painter order', () => {
  const input = scene();
  input.layers.push({ id: 'foreground', type: 'circle', position: [80, 90], radius: 20, fill: '#fff', opacity: 0.5, scale: 2, rotation: 3 });
  const result = evaluateScene(input, 0);
  assert.deepEqual(result.layers.map((layer) => layer.id), ['box', 'foreground']);
  assert.equal(result.layers[1].opacity, 0.5);
  assert.equal(result.layers[1].scale, 2);
  assert.equal(result.layers[1].rotation, 3);
});

test('missing or invalid anchors and out-of-range times fail clearly', () => {
  const input = scene();
  assert.throws(() => resolveStart(input, { anchor: 'missing' }), /Unknown narration anchor: missing/);
  assert.throws(() => resolveStart(input, NaN), /finite/);
  assert.throws(() => resolveStart(input, { anchor: 'word-a', offset: Infinity }), /finite/);
  for (const time of [NaN, Infinity, -Infinity, -0.1, 4.01]) assert.throws(() => evaluateScene(input, time), RangeError);
  assert.doesNotThrow(() => evaluateScene(input, 0));
  assert.doesNotThrow(() => evaluateScene(input, 4));
  const invalidClip = scene([{ property: 'opacity', start: { anchor: 'missing' }, duration: 1, from: 0, to: 1 }]);
  assert.throws(() => evaluateScene(invalidClip, 0), /Unknown narration anchor/);
});

test('frame counts cover the half-open output interval without a duplicate terminal frame', () => {
  const input = scene();
  input.output.durationSeconds = 2;
  assert.equal(frameCount(input), 60);
  input.output.durationSeconds = 1 / 3;
  assert.equal(frameCount(input), 10);
  input.output.durationSeconds = 2.01;
  assert.equal(frameCount(input), 61);
  for (const duration of [0, -1, NaN, Infinity]) {
    input.output.durationSeconds = duration;
    assert.throws(() => frameCount(input), RangeError);
  }
});

function groupedScene() {
  const input = scene();
  input.layers = [{
    id: 'actor', type: 'group', position: [100, 200], opacity: 0.5,
    clips: [{ property: 'position', from: [100, 200], to: [200, 300], start: 1, duration: 1 }],
    children: [{
      id: 'arm', type: 'group', position: [30, 40],
      clips: [{ property: 'rotation', from: 0, to: 90, start: { anchor: 'word-a' }, duration: 1 }],
      children: [{
        id: 'outline', type: 'path', position: [2, 3], opacity: 0.25, fill: '#00000000', stroke: '#ffffff',
        commands: [['M', 0, 0], ['L', 10, 0], ['C', 10, 2, 8, 8, 5, 10], ['Q', 0, 8, 0, 0], ['Z']],
        clips: [{ property: 'scale', from: 1, to: 2, start: 0, duration: 2 }]
      }]
    }]
  }];
  return input;
}

test('groups preserve local transforms and evaluate all descendant clips on global time', () => {
  const input = groupedScene();
  const actor = evaluateScene(input, 1.5).layers[0];
  assert.deepEqual(actor.position, [150, 250]);
  assert.equal(actor.opacity, 0.5);
  assert.equal('clips' in actor, false);
  const arm = actor.children[0];
  assert.deepEqual(arm.position, [30, 40], 'evaluation leaves transform composition to the renderer');
  assert.equal(arm.rotation, 45);
  assert.equal(arm.opacity, 1);
  const outline = arm.children[0];
  assert.equal(outline.scale, 1.75);
  assert.equal(outline.opacity, 0.25, 'parent alpha is composed during rendering, not flattened into children');
  assert.equal('clips' in outline, false);
});

test('nested groups and path commands are detached and deterministic across direct seeks', () => {
  const input = freezeDeep(groupedScene());
  const before = JSON.stringify(input);
  const sequential = new Map();
  for (let frame = 0; frame < frameCount(input); frame++) sequential.set(frame, evaluateScene(input, frame / 30));
  for (const frame of [119, 45, 0, 87, 4, 60, 45]) {
    assert.deepEqual(evaluateScene(input, frame / 30), sequential.get(frame));
  }
  const returned = evaluateScene(input, 0);
  const child = returned.layers[0].children[0];
  child.position[0] = 900;
  child.children[0].commands[0][1] = 999;
  child.children[0].commands.push(['Z']);
  returned.layers[0].children.push({ id: 'extra', type: 'circle', position: [0, 0], radius: 1, fill: '#ffffff', opacity: 1, scale: 1, rotation: 0 });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(evaluateScene(input, 0), sequential.get(0), 'returned state cannot affect later evaluations');
});
