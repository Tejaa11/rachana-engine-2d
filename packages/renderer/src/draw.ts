import { createCanvas, GlobalFonts, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import type { EvaluatedLayer, FrameState } from '../../core/src/types.js';

let fontsReady = false;
export function registerFonts(): void {
  if (fontsReady) return;
  const fonts = [
    ['NotoSans-Regular.ttf', 'Rachana Sans'],
    ['NotoSansDevanagari-Regular.ttf', 'Rachana Devanagari'],
    ['NotoSansGujarati-Regular.ttf', 'Rachana Gujarati'],
  ];
  for (const [file, family] of fonts) {
    const absolute = fileURLToPath(new URL(`../../../../assets/fonts/${file}`, import.meta.url));
    if (!GlobalFonts.registerFromPath(absolute, family)) throw new Error(`Cannot register bundled font: ${file}`);
  }
  fontsReady = true;
}

/** Wrap without discarding text; overlong tokens are split at grapheme boundaries. */
export function wrapText(ctx: SKRSContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { current = candidate; continue; }
      if (current) { lines.push(current); current = ''; }
      for (const { segment } of graphemes.segment(word)) {
        if (ctx.measureText(segment).width > width) throw new Error('Text column is narrower than a single grapheme.');
        if (ctx.measureText(current + segment).width > width) { lines.push(current); current = ''; }
        current += segment;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function createSurface(width: number, height: number): Canvas {
  registerFonts();
  return createCanvas(width, height);
}

/** Side effects are confined to drawing; the draw-list evaluator remains pure. */
export function drawFrame(canvas: Canvas, frame: FrameState): void {
  const ctx = canvas.getContext('2d');
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, frame.width, frame.height);
  ctx.fillStyle = frame.background;
  ctx.fillRect(0, 0, frame.width, frame.height);
  function drawLayer(layer: EvaluatedLayer): void {
    // Parent alpha is already in the context: a hidden group hides its entire subtree.
    const opacity = ctx.globalAlpha * layer.opacity;
    if (opacity <= 0) return;
    ctx.save();
    try {
      ctx.translate(...layer.position);
      ctx.rotate(layer.rotation * Math.PI / 180);
      ctx.scale(layer.scale, layer.scale);
      ctx.globalAlpha = opacity;
      if (layer.type === 'group') {
        for (const child of layer.children) drawLayer(child);
      } else if (layer.type === 'rect') {
        ctx.fillStyle = layer.fill;
        ctx.beginPath();
        ctx.roundRect(0, 0, ...layer.size, layer.radius ?? 0);
        ctx.fill();
      } else if (layer.type === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, layer.radius, 0, Math.PI * 2);
        ctx.fillStyle = layer.fill;
        ctx.fill();
        if (layer.stroke && (layer.strokeWidth ?? 0) > 0) {
          ctx.strokeStyle = layer.stroke;
          ctx.lineWidth = layer.strokeWidth!;
          ctx.stroke();
        }
      } else if (layer.type === 'path') {
        ctx.beginPath();
        for (const command of layer.commands) {
          switch (command[0]) {
            case 'M': ctx.moveTo(command[1], command[2]); break;
            case 'L': ctx.lineTo(command[1], command[2]); break;
            case 'C': ctx.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6]); break;
            case 'Q': ctx.quadraticCurveTo(command[1], command[2], command[3], command[4]); break;
            case 'Z': ctx.closePath(); break;
            default: throw new Error(`Unsupported path command on layer ${layer.id}.`);
          }
        }
        ctx.fillStyle = layer.fill;
        ctx.fill();
        if (layer.stroke && (layer.strokeWidth ?? 0) > 0) {
          ctx.strokeStyle = layer.stroke;
          ctx.lineWidth = layer.strokeWidth!;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      } else {
        // Request weight from the registered Noto family; no absent font file is required.
        const weight = layer.fontWeight === 'bold' ? 'bold ' : '';
        ctx.font = `${weight}${layer.fontSize}px "Rachana Sans", "Rachana Devanagari", "Rachana Gujarati"`;
        ctx.textAlign = layer.align ?? 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = layer.color;
        const rows = wrapText(ctx, layer.text, layer.maxWidth);
        const step = layer.fontSize * (layer.lineHeight ?? 1.25);
        const transform = ctx.getTransform();
        for (const [i, row] of rows.entries()) {
          const metrics = ctx.measureText(row);
          const measured = metrics.width;
          const left = layer.align === 'center' ? -measured / 2 : layer.align === 'right' ? -measured : 0;
          const y = i * step;
          // Check the transformed ink and line box, including group transforms.
          const minX = Math.min(left, -metrics.actualBoundingBoxLeft);
          const maxX = Math.max(left + measured, metrics.actualBoundingBoxRight);
          const minY = Math.min(y, y - metrics.actualBoundingBoxAscent);
          const maxY = Math.max(y + step, y + metrics.actualBoundingBoxDescent);
          for (const [x, yy] of [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]]) {
            const px = transform.a * x + transform.c * yy + transform.e;
            const py = transform.b * x + transform.d * yy + transform.f;
            if (px < -1 || py < -1 || px > frame.width + 1 || py > frame.height + 1) {
              throw new Error(`Visible text outside canvas on layer ${layer.id}. Adjust layout or timing.`);
            }
          }
          ctx.fillText(row, 0, y);
        }
      }
    } finally {
      ctx.restore();
    }
  }
  for (const layer of frame.layers) drawLayer(layer);
}
