import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Image } from '@napi-rs/canvas';
import type { Scene } from '../../core/src/types.js';
import { validateScene } from '../../core/src/validate.js';
import { readPng, decodePng } from '../../assets/src/png.js';

/** Images are decoded once before frame drawing. Frame evaluation remains pure. */
export type PreparedImages = ReadonlyMap<string, Image>;

/** Resolve only local, scene-contained PNGs whose bytes/dimensions match the scene. */
export async function prepareSceneImages(scene: Scene, sceneFile: string): Promise<PreparedImages> {
  const validation = validateScene(scene);
  if (!validation.valid) throw new Error(validation.errors.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
  const images = new Map<string, Image>();
  if (!scene.images?.length) return images;
  const root = await realpath(path.dirname(path.resolve(sceneFile)));
  // Shared references can reuse a decoded result, but every file is still inspected
  // so a second path cannot smuggle different bytes under an existing hash.
  const decoded = new Map<string, Image>();
  for (const asset of scene.images) {
    const requested = path.resolve(root, asset.src);
    if (!requested.startsWith(root + path.sep)) throw new Error(`Image ${asset.id} must be inside the scene directory.`);
    const actual = await realpath(requested);
    if (!actual.startsWith(root + path.sep)) throw new Error(`Image ${asset.id} symlink escapes the scene directory.`);
    const source = await readPng(actual);
    if (source.sha256 !== asset.sha256) throw new Error(`Image ${asset.id} content hash differs from the scene. Update the asset deliberately before rendering.`);
    if (source.width !== asset.width || source.height !== asset.height) throw new Error(`Image ${asset.id} dimensions differ from the scene.`);
    const image = decoded.get(asset.sha256) ?? (await decodePng(source)).image;
    decoded.set(asset.sha256, image);
    images.set(asset.id, image);
  }
  return images;
}
