import { spawnSync } from 'node:child_process';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateScene } from '../dist/packages/core/src/evaluate.js';
import { loadScene } from '../dist/packages/renderer/src/files.js';
import { createSurface, drawFrame } from '../dist/packages/renderer/src/draw.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scene = await loadScene(path.join(root, 'examples/narrated-story/scene.json'));
const canvas = createSurface(scene.output.width, scene.output.height);
drawFrame(canvas, evaluateScene(scene, 8));
await writeFile(path.join(root, 'showcase/preview.png'), canvas.toBuffer('image/png'));
const video = path.join(root, 'renders/rachana-demo.mp4');
await copyFile(video, path.join(root, 'showcase/rachana-demo.mp4'));
for (const suffix of ['manifest.json', 'verification.json']) {
  // The manifest contains no absolute paths or private narration metadata.
  const data = await readFile(`${video}.${suffix}`, 'utf8');
  await writeFile(path.join(root, `showcase/demo.${suffix}`), data);
}
const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', [
  '-y', '-v', 'error', '-ss', '4.9', '-t', '5', '-i', video,
  '-filter_complex', '[0:v]fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer',
  '-an', '-loop', '0', path.join(root, 'showcase/demo.gif'),
], { encoding: 'utf8', timeout: 120_000 });
if (result.status !== 0) throw new Error(result.error?.message || result.stderr);
console.log('Showcase created from actual engine output. GIF is silent; MP4 carries the narration.');
