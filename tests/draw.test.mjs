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
