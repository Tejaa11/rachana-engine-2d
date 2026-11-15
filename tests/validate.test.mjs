import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from '../dist/packages/core/src/validate.js';

function scene() {
  return {
    schemaVersion: 1, id: 'example',
    output: { width: 1920, height: 1080, fps: 30, durationSeconds: 2 },
    background: '#101820',
    narration: { timingSource: 'reviewed', words: [{ id: 'w1', text: 'Hello', start: 0.2, end: 0.6 }] },
    layers: [{ id: 'box', type: 'rect', position: [200, 440], size: [200, 200], fill: '#f2aa4c', clips: [
      { property: 'position', from: [200, 440], to: [1500, 440], start: { anchor: 'w1' }, duration: 1, ease: 'easeInOutCubic' }
    ] }]
  };
}

function invalid(value, path) {
  const result = validateScene(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every(e => typeof e.path === 'string' && typeof e.message === 'string'));
  if (path) assert.ok(result.errors.some(e => e.path.startsWith(path)), JSON.stringify(result.errors));
}

test('accepts all supported layer kinds and property-specific clip values', () => {
  const value = scene();
  value.audio = { src: 'assets/voice.wav', gain: 0.9 };
  value.layers.push(
    { id: 'dot', type: 'circle', position: [100, 100], radius: 30, fill: '#ffffff80', stroke: '#FFFFFF', strokeWidth: 2 },
    { id: 'title', type: 'text', position: [960, 100], text: 'Hello', color: '#ffffff', fontSize: 64, maxWidth: 1200, lineHeight: 1.3, align: 'center', clips: [
      { property: 'opacity', from: 0, to: 1, start: 0, duration: 0.3 },
      { property: 'scale', from: 0.5, to: 1, start: 0, duration: 0.3 },
      { property: 'rotation', from: -5, to: 0, start: 0, duration: 0.3 }
    ] }
  );
  assert.deepEqual(validateScene(value), { valid: true, errors: [] });
});

test('rejects malformed root values, wrong field types and unknown properties', () => {
  for (const value of [null, [], 'scene', 1, {}]) invalid(value);
  const wrongType = scene(); wrongType.output.fps = '30'; invalid(wrongType, '/output/fps');
  const unknown = scene(); unknown.execute = 'anything'; invalid(unknown, '/execute');
  const layerExtra = scene(); layerExtra.layers[0].fontSize = 32; invalid(layerExtra, '/layers/0/fontSize');
});

test('rejects non-finite numbers and invalid resolution or resource bounds', () => {
  for (const value of [NaN, Infinity, -Infinity, 0, 61, 29.97]) {
    const bad = scene(); bad.output.fps = value; invalid(bad, '/output/fps');
  }
  for (const width of [15, 3841, 100.5]) { const bad = scene(); bad.output.width = width; invalid(bad, '/output/width'); }
  const duration = scene(); duration.output.durationSeconds = 1800.01; invalid(duration, '/output/durationSeconds');
  const layers = scene(); layers.layers = Array.from({ length: 501 }, (_, i) => ({ ...layers.layers[0], id: `box${i}` })); invalid(layers, '/layers');
  const boundary = scene(); boundary.output.durationSeconds = 1800; boundary.output.fps = 60;
  assert.equal(validateScene(boundary).valid, true, '108000 frame budget boundary is supported');
  const excess = scene(); excess.output.durationSeconds = 1800.1; excess.output.fps = 60;
  invalid(excess, '/output/durationSeconds');
});

test('rejects invalid dimensions, colors, clip endpoint types, opacity and scale', () => {
  for (const mutate of [
    value => { value.layers[0].size = [0, 10]; },
    value => { value.layers[0].fill = 'red'; },
    value => { value.layers[0].opacity = 1.01; },
    value => { value.layers[0].scale = 0; },
    value => { value.layers[0].clips[0].from = 4; },
    value => { value.layers[0].clips[0] = { property: 'opacity', from: -0.1, to: 1, start: 0, duration: 1 }; },
    value => { value.layers[0].clips[0] = { property: 'scale', from: 1, to: 0, start: 0, duration: 1 }; },
    value => { value.layers[0] = { id: 'title', type: 'text', text: 'a', position: [0, 0], fontSize: 1000, color: '#ffffff', maxWidth: 100 }; }
  ]) { const bad = scene(); mutate(bad); invalid(bad, '/layers/0'); }
});

test('rejects odd MP4 dimensions before attempting YUV420 encoding', () => {
  for (const dimension of ['width', 'height']) {
    const bad = scene(); bad.output[dimension] = 101;
    invalid(bad, `/output/${dimension}`);
  }
  const valid = scene(); valid.output.width = 102; valid.output.height = 102;
  assert.equal(validateScene(valid).valid, true);
});

test('rejects positive durations too small to produce a sampled frame', () => {
  const bad = scene(); bad.output.durationSeconds = 1e-12;
  bad.layers = []; delete bad.narration;
  invalid(bad, '/output/durationSeconds');
});

test('rejects duplicate IDs independently for layers and words', () => {
  const duplicateLayer = scene(); duplicateLayer.layers.push(structuredClone(duplicateLayer.layers[0])); invalid(duplicateLayer, '/layers/1/id');
  const duplicateWord = scene(); duplicateWord.narration.words.push({ id: 'w1', text: 'again', start: 1.2, end: 1.5 }); invalid(duplicateWord, '/narration/words/1/id');
});

test('requires positive word spans contained within the scene', () => {
  for (const [start, end] of [[0.5, 0.5], [1, 0.5], [1, 2.1], [2, 2.1], [-0.1, 0.1]]) {
    const bad = scene(); Object.assign(bad.narration.words[0], { start, end }); invalid(bad, '/narration/words/0');
  }
});

test('resolves word starts and ends, rejects missing anchors and negative resolved time', () => {
  const value = scene(); value.layers[0].clips[0].start = { anchor: 'w1', edge: 'end', offset: 0.4 };
  assert.equal(validateScene(value).valid, true);
  value.layers[0].clips[0].start = { anchor: 'absent' }; invalid(value, '/layers/0/clips/0/start/anchor');
  value.layers[0].clips[0].start = { anchor: 'w1', offset: -0.3 }; invalid(value, '/layers/0/clips/0/start');
  delete value.narration; value.layers[0].clips[0].start = { anchor: 'w1' }; invalid(value, '/layers/0/clips/0/start/anchor');
});

test('rejects clips beyond the scene and zero durations', () => {
  const beyond = scene(); beyond.layers[0].clips[0].start = 1.5; invalid(beyond, '/layers/0/clips/0/duration');
  const zero = scene(); zero.layers[0].clips[0].duration = 0; invalid(zero, '/layers/0/clips/0/duration');
});

test('rejects same-property overlap after resolving anchors, but permits touching clips', () => {
  const value = scene();
  value.layers[0].clips.push({ property: 'position', from: [1500, 440], to: [1600, 440], start: 1, duration: 0.5 });
  invalid(value, '/layers/0/clips/1/start');
  value.layers[0].clips[1].start = 1.2;
  assert.equal(validateScene(value).valid, true);
  value.layers[0].clips.reverse();
  assert.equal(validateScene(value).valid, true, 'authoring array order does not affect overlap semantics');
});

test('rejects hostile audio paths while allowing safe relative media paths', () => {
  for (const src of ['/tmp/voice.wav', '../voice.wav', 'assets/../../voice.wav', 'assets/../voice.wav', 'C:/voice.wav', 'C:\\voice.wav', 'assets\\voice.wav', 'https://example.com/a.wav', 'file:voice.wav', '//server/voice.wav', 'voice\u0000.wav']) {
    const bad = scene(); bad.audio = { src }; invalid(bad, '/audio/src');
  }
  for (const src of ['voice.wav', 'assets/my voice.wav', './assets/voice.wav', 'assets/voice..wav']) {
    const valid = scene(); valid.audio = { src }; assert.equal(validateScene(valid).valid, true, src);
  }
});

function pathLayer(id = 'path') {
  return { id, type: 'path', position: [0, 0], fill: '#00000000', stroke: '#ffffff', strokeWidth: 2,
    commands: [['M', 0, 0], ['L', 10, 0], ['C', 10, 2, 8, 8, 5, 10], ['Q', 0, 8, 0, 0], ['Z']] };
}

function group(id, children) { return { id, type: 'group', position: [0, 0], children }; }

test('accepts recursive groups, all typed path commands and normal/bold text weights', () => {
  const input = scene();
  input.layers = [group('actor', [group('arm', [pathLayer()])])];
  input.layers[0].clips = [{ property: 'rotation', from: -5, to: 0, start: 0, duration: 0.2 }];
  for (const fontWeight of ['normal', 'bold']) {
    input.layers.push({ id: `title-${fontWeight}`, type: 'text', text: 'Title', position: [100, 100], fontSize: 40, fontWeight, maxWidth: 200, color: '#ffffff' });
  }
  assert.deepEqual(validateScene(input), { valid: true, errors: [] });
});

test('rejects malformed path tuples, non-finite points and raw SVG path strings', () => {
  for (const commands of [[], [['M', 0]], [['M', 0, 0, 1]], [['C', 0, 0]], [['Q', 1, 2, 3]], [['Z', 0]], [['A', 0, 0]], [['L', '1', 2]], [['M', NaN, 0]], [['M', 0, Infinity]], 'M 0 0 L 1 1', [{ op: 'M', x: 0, y: 0 }]]) {
    const input = scene(); input.layers = [{ ...pathLayer(), commands }];
    invalid(input, '/layers/0');
  }
  const raw = scene(); raw.layers = [{ ...pathLayer(), d: 'M0 0L1 1' }]; invalid(raw, '/layers/0/d');
  const unknown = scene(); unknown.layers = [group('parent', [{ ...pathLayer(), execute: 'code' }])];
  invalid(unknown, '/layers/0/children/0/execute');
});

test('IDs are unique across the full group tree, including parents and separate roots', () => {
  const duplicateSibling = scene(); duplicateSibling.layers = [group('parent', [pathLayer('same'), group('inner', [pathLayer('same')])])];
  invalid(duplicateSibling, '/layers/0/children/1/children/0/id');
  const parentConflict = scene(); parentConflict.layers = [group('parent', [pathLayer('parent')])];
  invalid(parentConflict, '/layers/0/children/0/id');
  const rootConflict = scene(); rootConflict.layers = [pathLayer('shared'), group('parent', [pathLayer('shared')])];
  invalid(rootConflict, '/layers/1/children/0/id');
});

test('nested children receive anchor, end-time and same-property overlap checks', () => {
  const input = scene(); const child = pathLayer(); input.layers = [group('parent', [child])];
  child.clips = [{ property: 'opacity', from: 0, to: 1, start: { anchor: 'missing' }, duration: 0.3 }];
  invalid(input, '/layers/0/children/0/clips/0/start/anchor');
  child.clips[0].start = 1.9;
  invalid(input, '/layers/0/children/0/clips/0/duration');
  child.clips = [
    { property: 'opacity', from: 0, to: 1, start: 0, duration: 1 },
    { property: 'opacity', from: 1, to: 0, start: { anchor: 'w1' }, duration: 0.4 }
  ];
  invalid(input, '/layers/0/children/0/clips/1/start');
});

test('bounds tree depth and rejects cycles before recursive schema validation', () => {
  let nested = pathLayer();
  for (let depth = 1; depth < 8; depth++) nested = group(`g${depth}`, [nested]);
  const input = scene(); input.layers = [nested];
  assert.equal(validateScene(input).valid, true, 'eight layer levels are allowed');
  input.layers = [group('too-deep', [nested])]; invalid(input, '/layers/0');
  // An arbitrary caller can supply cyclic JS objects even though JSON cannot.
  const cycle = group('cycle', []); cycle.children.push(cycle); input.layers = [cycle];
  const result = validateScene(input);
  assert.equal(result.valid, false); assert.match(result.errors[0].message, /cycles/);
  let deep = pathLayer();
  for (let depth = 0; depth < 10000; depth++) deep = group(`deep-${depth}`, [deep]);
  input.layers = [deep]; assert.equal(validateScene(input).valid, false, 'deep inputs fail without stack overflow');
});

test('bounds total layers, per-group children, per-path and total command counts', () => {
  const input = scene();
  input.layers = Array.from({ length: 3 }, (_, groupIndex) => group(`g-${groupIndex}`, Array.from({ length: 499 }, (_, i) => pathLayer(`p-${groupIndex}-${i}`))));
  assert.equal(validateScene(input).valid, true, '1500 layers including groups are permitted');
  input.layers.push(pathLayer('overflow'));
  invalid(input, '/layers');
  input.layers = [group('wide', Array.from({ length: 501 }, (_, i) => pathLayer(`wide-${i}`)))];
  invalid(input, '/layers/0/children');
  const long = pathLayer(); long.commands = Array.from({ length: 513 }, () => ['L', 0, 0]);
  input.layers = [long]; invalid(input, '/layers/0/commands');
  input.layers = Array.from({ length: 40 }, (_, i) => ({ ...pathLayer(`dense-${i}`), commands: Array.from({ length: 500 }, () => ['L', 0, 0]) }));
  assert.equal(validateScene(input).valid, true, '20000 path commands are permitted');
  input.layers.push(pathLayer('command-overflow'));
  invalid(input, '/layers');
});
