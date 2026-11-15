import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurface, drawFrame, wrapText } from '../dist/packages/renderer/src/draw.js';
import { evaluateScene } from '../dist/packages/core/src/evaluate.js';

function textFrame(overrides = {}) {
  return {
    width: 320, height: 200, background: '#102030',
    layers: [{ id: 'text', type: 'text', text: 'A readable title', position: [20, 20], fontSize: 24,
      color: '#ffffff', maxWidth: 280, opacity: 1, scale: 1, rotation: 0, ...overrides }],
  };
}

test('same-environment pixel output is independent of seeking order and canvas reuse', () => {
  const scene = {
    schemaVersion: 1, id: 'pixel-seek',
    output: { width: 320, height: 200, fps: 30, durationSeconds: 2 }, background: '#102030',
    layers: [
      { id: 'shape', type: 'rect', size: [50, 40], fill: '#ffbb22', position: [10, 20],
        clips: [{ property: 'position', start: 0, duration: 2, from: [10, 20], to: [220, 20], ease: 'easeInOutCubic' }] },
      { id: 'label', type: 'text', text: 'Narrated motion', fontSize: 24, maxWidth: 280, color: '#ffffff', position: [20, 110] },
    ],
  };
  const sequential = createSurface(320, 200);
  let expected;
  for (let frame = 0; frame <= 45; frame++) {
    drawFrame(sequential, evaluateScene(scene, frame / 30));
    if (frame === 45) expected = Buffer.from(sequential.data());
  }
  const direct = createSurface(320, 200);
  drawFrame(direct, evaluateScene(scene, 45 / 30));
  assert.deepEqual(Buffer.from(direct.data()), expected);
  for (const frame of [2, 59, 0, 45]) drawFrame(sequential, evaluateScene(scene, frame / 30));
  assert.deepEqual(Buffer.from(sequential.data()), expected);
});

test('wrapping preserves long-token graphemes and all visible text', () => {
  const canvas = createSurface(320, 200);
  const ctx = canvas.getContext('2d');
  ctx.font = '24px "Rachana Sans", "Rachana Devanagari", "Rachana Gujarati"';
  const original = 'ThisVeryLongUnbrokenToken123 e\u0301e\u0301e\u0301 👨‍👩‍👧‍👦👨‍👩‍👧‍👦 हिंदी ગુજરાતી';
  const graphemeWidths = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(original), item => ctx.measureText(item.segment).width);
  const width = Math.max(50, ...graphemeWidths) + 1;
  const rows = wrapText(ctx, original, width);
  assert.ok(rows.length > 2);
  assert.equal(rows.join('').replace(/\s/gu, ''), original.replace(/\s/gu, ''));
  assert.ok(rows.every(row => ctx.measureText(row).width <= width + 1e-6));
  const expected = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(original.replace(/\s/gu, '')), item => item.segment);
  const actual = rows.flatMap(row => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(row.replace(/\s/gu, '')), item => item.segment));
  assert.deepEqual(actual, expected);
});

test('wrapping retains explicit paragraph breaks and rejects impossible columns', () => {
  const ctx = createSurface(320, 200).getContext('2d');
  ctx.font = '24px "Rachana Sans"';
  assert.deepEqual(wrapText(ctx, 'First\n\nSecond', 250), ['First', '', 'Second']);
  assert.throws(() => wrapText(ctx, 'A', 0.1), /single grapheme/);
});

test('visible overflow is an error rather than silently clipped text', () => {
  const canvas = createSurface(320, 200);
  assert.doesNotThrow(() => drawFrame(canvas, textFrame()));
  assert.throws(() => drawFrame(canvas, textFrame({ position: [300, 20] })), /Visible text outside canvas.*text/);
  assert.throws(() => drawFrame(canvas, textFrame({ text: 'First\nSecond\nThird', position: [20, 180] })), /Visible text outside canvas/);
  assert.doesNotThrow(() => drawFrame(canvas, textFrame({ opacity: 0, position: [1000, 1000] })));
});

test('rotated text validates all four transformed bounds corners', () => {
  const canvas = createSurface(320, 200);
  // Top-left and bottom-right stay inside, but rotation moves bottom-left offscreen.
  assert.throws(() => drawFrame(canvas, textFrame({ text: 'Hello', position: [10, 40], fontSize: 32, rotation: 45 })), /Visible text outside canvas/);
});

test('a failed text draw restores its saved canvas transform', () => {
  const canvas = createSurface(320, 200);
  assert.throws(() => drawFrame(canvas, textFrame({ text: 'A', position: [20, 30], maxWidth: 0.1 })), /single grapheme/);
  const transform = canvas.getContext('2d').getTransform();
  assert.deepEqual([transform.a, transform.b, transform.c, transform.d, transform.e, transform.f], [1, 0, 0, 1, 0, 0]);
});

test('glyph ink cannot escape the canvas through a small line-height setting', () => {
  const canvas = createSurface(320, 200);
  assert.throws(() => drawFrame(canvas, textFrame({ text: 'gyp', position: [20, 180], fontSize: 32, lineHeight: 0.5 })), /Visible text outside canvas/);
});

function evaluatedFrame(layers) {
  return { width: 320, height: 200, background: '#000000', layers };
}

function transform(overrides = {}) {
  return { position: [0, 0], opacity: 1, scale: 1, rotation: 0, ...overrides };
}

function pixel(canvas, x, y) {
  return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
}

test('nested groups compose transforms and multiply opacity without affecting siblings', () => {
  const canvas = createSurface(320, 200);
  drawFrame(canvas, evaluatedFrame([
    { id: 'parent', type: 'group', ...transform({ position: [80, 40], scale: 2, rotation: 90, opacity: 0.5 }), children: [
      { id: 'child-group', type: 'group', ...transform({ position: [10, 5], scale: 0.5, opacity: 0.5 }), children: [
        { id: 'nested-box', type: 'rect', ...transform({ position: [2, 3] }), size: [20, 20], fill: '#ffffff' },
      ] },
    ] },
    { id: 'sibling', type: 'rect', ...transform({ position: [10, 10] }), size: [10, 10], fill: '#ff0000' },
  ]));
  const gray = pixel(canvas, 62, 72);
  assert.ok(gray[0] >= 63 && gray[0] <= 64, `Expected 25% white, got ${gray}`);
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.equal(gray[3], 255);
  assert.deepEqual(pixel(canvas, 14, 14), [255, 0, 0, 255]);
  assert.deepEqual(pixel(canvas, 100, 100), [0, 0, 0, 255]);
});

test('path drawing supports each numeric tuple command with fill and stroke', () => {
  const canvas = createSurface(320, 200);
  drawFrame(canvas, evaluatedFrame([
    { id: 'curved-card', type: 'path', ...transform(), fill: '#ff8000', stroke: '#ffffff', strokeWidth: 4,
      commands: [['M', 20, 20], ['L', 100, 20], ['Q', 120, 20, 120, 40], ['L', 120, 100], ['C', 120, 110, 110, 120, 100, 120], ['L', 40, 120], ['Q', 20, 120, 20, 100], ['Z']] },
    { id: 'transparent-open-line', type: 'path', ...transform(), fill: '#00000000', stroke: '#00ff00', strokeWidth: 6,
      commands: [['M', 180, 20], ['L', 180, 120]] },
  ]));
  assert.deepEqual(pixel(canvas, 70, 70), [255, 128, 0, 255]);
  assert.deepEqual(pixel(canvas, 60, 20), [255, 255, 255, 255]);
  assert.deepEqual(pixel(canvas, 180, 70), [0, 255, 0, 255]);
  assert.deepEqual(pixel(canvas, 150, 70), [0, 0, 0, 255]);
});

test('group/path animation produces identical pixels after direct and shuffled seeks', () => {
  const scene = {
    schemaVersion: 1, id: 'group-path-seek', output: { width: 320, height: 200, fps: 30, durationSeconds: 2 }, background: '#000000',
    layers: [{ id: 'moving-parent', type: 'group', position: [20, 20], opacity: 0.5,
      clips: [{ property: 'position', start: 0, duration: 2, from: [20, 20], to: [180, 60], ease: 'easeInOutCubic' }],
      children: [{ id: 'path', type: 'path', position: [5, 5], fill: '#00ffff',
        commands: [['M', 0, 0], ['L', 40, 0], ['L', 20, 40], ['Z']],
        clips: [{ property: 'rotation', start: 0, duration: 2, from: 0, to: 90 }] }],
    }],
  };
  const reused = createSurface(320, 200);
  for (let index = 0; index <= 35; index++) drawFrame(reused, evaluateScene(scene, index / 30));
  const expected = Buffer.from(reused.data());
  const direct = createSurface(320, 200);
  drawFrame(direct, evaluateScene(scene, 35 / 30));
  assert.deepEqual(Buffer.from(direct.data()), expected);
  for (const index of [59, 0, 45, 2, 35]) drawFrame(reused, evaluateScene(scene, index / 30));
  assert.deepEqual(Buffer.from(reused.data()), expected);
});

test('hidden parent groups skip descendants and visible nested text checks world bounds', () => {
  const canvas = createSurface(320, 200);
  const text = { ...textFrame().layers[0], position: [0, 0] };
  const group = { id: 'parent', type: 'group', ...transform({ position: [400, 20], opacity: 0 }), children: [text] };
  assert.doesNotThrow(() => drawFrame(canvas, evaluatedFrame([group])));
  assert.deepEqual(pixel(canvas, 10, 10), [0, 0, 0, 255]);
  assert.throws(() => drawFrame(canvas, evaluatedFrame([{ ...group, opacity: 1 }])), /Visible text outside canvas.*text/);
  const matrix = canvas.getContext('2d').getTransform();
  assert.deepEqual([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f], [1, 0, 0, 1, 0, 0]);
});

test('unsupported path instructions fail without escaping saved group state', () => {
  const canvas = createSurface(320, 200);
  const invalidPath = { id: 'bad-path', type: 'path', ...transform({ position: [20, 10] }), fill: '#ffffff', commands: [['eval', 'throw new Error()']] };
  const group = { id: 'group', type: 'group', ...transform({ position: [30, 10], opacity: 0.5 }), children: [invalidPath] };
  assert.throws(() => drawFrame(canvas, evaluatedFrame([group])), /Unsupported path command/);
  const ctx = canvas.getContext('2d');
  const matrix = ctx.getTransform();
  assert.deepEqual([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f], [1, 0, 0, 1, 0, 0]);
  assert.equal(ctx.globalAlpha, 1);
});

test('bold headlines render using the bundled family without requiring an extra font file', () => {
  const regular = createSurface(320, 200);
  const bold = createSurface(320, 200);
  drawFrame(regular, textFrame({ text: 'Bold heading', fontWeight: 'normal' }));
  assert.doesNotThrow(() => drawFrame(bold, textFrame({ text: 'Bold heading', fontWeight: 'bold' })));
  assert.notDeepEqual(Buffer.from(bold.data()), Buffer.from(regular.data()));
});
