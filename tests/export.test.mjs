import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { renderVideo, inspectFFmpeg } from '../dist/packages/renderer/src/export.js';

const ffmpeg = inspectFFmpeg();
const options = { skip: ffmpeg.available ? false : 'FFmpeg not installed; CI supplies it.' };
const scene = { schemaVersion: 1, id: 'encode-test', output: { width: 64, height: 64, fps: 30, durationSeconds: 0.2 },
  background: '#101424', layers: [{ id: 'dot', type: 'circle', position: [32, 32], radius: 12, fill: '#b9a3ff' }] };
async function withTemp(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rachana-export-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('fresh frames encode and fully decode with the planned frame count', options, async () => withTemp(async root => {
  const output = path.join(root, 'clip.mp4');
  const manifest = await renderVideo(scene, path.join(root, 'scene.json'), output);
  assert.equal(manifest.frames, 6);
  assert.equal(JSON.parse(await readFile(`${output}.manifest.json`, 'utf8')).frames, 6);
  const result = spawnSync(ffmpeg.binary, ['-v', 'error', '-i', output, '-progress', 'pipe:1', '-f', 'null', '-'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /frame=6\n/);
  assert.deepEqual((await readdir(root)).sort(), ['clip.mp4', 'clip.mp4.manifest.json']);
}));

test('preexisting MP4 or manifest is never replaced', options, async () => withTemp(async root => {
  const output = path.join(root, 'clip.mp4');
  await writeFile(output, 'keep-video');
  await assert.rejects(renderVideo(scene, path.join(root, 'scene.json'), output), /already exists/);
  assert.equal(await readFile(output, 'utf8'), 'keep-video');
  const second = path.join(root, 'other.mp4');
  await writeFile(`${second}.manifest.json`, 'keep-manifest');
  await assert.rejects(renderVideo(scene, path.join(root, 'scene.json'), second), /already exists/);
  assert.equal(await readFile(`${second}.manifest.json`, 'utf8'), 'keep-manifest');
  assert.equal((await readdir(root)).length, 2);
}));

test('a layout failure removes encoder temporary files and publishes nothing', options, async () => withTemp(async root => {
  const invalid = structuredClone(scene);
  invalid.layers = [{ id: 'bad-text', type: 'text', position: [100, 100], text: 'Outside', fontSize: 32, maxWidth: 60, color: '#ffffff' }];
  await assert.rejects(renderVideo(invalid, path.join(root, 'scene.json'), path.join(root, 'bad.mp4')), /outside canvas/);
  assert.deepEqual(await readdir(root), []);
}));

test('audio mismatch fails explicitly before producing video', options, async () => withTemp(async root => {
  const source = await readFile(new URL('../examples/narrated-story/voice.wav', import.meta.url));
  await writeFile(path.join(root, 'voice.wav'), source);
  const withAudio = { ...scene, audio: { src: 'voice.wav' } };
  await assert.rejects(renderVideo(withAudio, path.join(root, 'scene.json'), path.join(root, 'bad.mp4')), /durations differ/);
  assert.deepEqual(await readdir(root), ['voice.wav']);
}));
