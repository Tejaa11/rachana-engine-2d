import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadScene, resolveAudio } from '../dist/packages/renderer/src/files.js';

async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rachana-files-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'project');
  const sibling = path.join(temporary, 'project-sibling');
  await mkdir(path.join(root, 'audio'), { recursive: true });
  await mkdir(sibling);
  const sceneFile = path.join(root, 'scene.json');
  const scene = { schemaVersion: 1, id: 'files-fixture', output: { width: 320, height: 200, fps: 30, durationSeconds: 2 }, background: '#102030', layers: [] };
  await writeFile(sceneFile, JSON.stringify(scene));
  await writeFile(path.join(root, 'audio', 'voice.wav'), 'media resolution fixture; not decoded in this test');
  await writeFile(path.join(sibling, 'private.wav'), 'outside media');
  return { temporary, root, sibling, sceneFile, scene };
}

test('loadScene reads and validates a new project before any output exists', async (t) => {
  const { sceneFile, scene } = await fixture(t);
  assert.deepEqual(await loadScene(sceneFile), scene);
});

test('loadScene rejects malformed JSON and invalid schema with readable paths', async (t) => {
  const { sceneFile, scene } = await fixture(t);
  await writeFile(sceneFile, '{broken');
  await assert.rejects(loadScene(sceneFile), SyntaxError);
  scene.output.fps = 0;
  await writeFile(sceneFile, JSON.stringify(scene));
  await assert.rejects(loadScene(sceneFile), /\/output\/fps/);
});

test('resolveAudio accepts local nested media and rejects missing files', async (t) => {
  const { root, sceneFile } = await fixture(t);
  assert.equal(await resolveAudio(sceneFile, 'audio/voice.wav'), await realpath(path.join(root, 'audio', 'voice.wav')));
  await assert.rejects(resolveAudio(sceneFile, 'audio/missing.wav'), { code: 'ENOENT' });
});

test('resolveAudio rejects traversal and lookalike sibling-directory prefixes', async (t) => {
  const { sibling, sceneFile } = await fixture(t);
  await assert.rejects(resolveAudio(sceneFile, '../project-sibling/private.wav'), /inside the scene directory/);
  await assert.rejects(resolveAudio(sceneFile, path.join(sibling, 'private.wav')), /inside the scene directory/);
});

test('resolveAudio permits internal symlinks and blocks file and directory symlink escapes', async (t) => {
  const { root, sibling, sceneFile } = await fixture(t);
  try {
    await symlink(path.join(root, 'audio', 'voice.wav'), path.join(root, 'inside.wav'), 'file');
    await symlink(path.join(sibling, 'private.wav'), path.join(root, 'outside.wav'), 'file');
    await symlink(sibling, path.join(root, 'external-audio'), 'dir');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('This Windows account cannot create symlinks.');
      return;
    }
    throw error;
  }
  assert.equal(await resolveAudio(sceneFile, 'inside.wav'), await realpath(path.join(root, 'audio', 'voice.wav')));
  await assert.rejects(resolveAudio(sceneFile, 'outside.wav'), /symlink escapes/);
  await assert.rejects(resolveAudio(sceneFile, 'external-audio/private.wav'), /symlink escapes/);
});
