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
