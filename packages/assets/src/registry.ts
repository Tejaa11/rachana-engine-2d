import { readFile, realpath, stat, open, link, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Ajv } from 'ajv';
import type { Image } from '@napi-rs/canvas';
import type { AssetRegistry, AssetRequest, PngInspection } from './types.js';
import { decodePng, readPng, REGISTRY_PIXEL_LIMIT } from './png.js';

const schema = JSON.parse(readFileSync(new URL('../../../../schemas/asset-registry.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true, strict: true, strictNumbers: true }).compile<AssetRegistry>(schema);

export function validateAssetRegistry(input: unknown): asserts input is AssetRegistry {
  if (!validate(input)) throw new Error((validate.errors ?? []).map(issue => `${issue.instancePath || '/'} ${issue.message}`).join('\n'));
  const ids = new Set<string>(), hashes = new Set<string>();
  let pixels = 0;
  for (const asset of input.assets) {
    if (ids.has(asset.id)) throw new Error(`Duplicate asset ID: ${asset.id}`);
    ids.add(asset.id);
    if (!hashes.has(asset.sha256)) { hashes.add(asset.sha256); pixels += asset.width * asset.height; }
    for (const [field, value] of Object.entries(asset.provenance)) if (typeof value === 'string' && !value.trim()) throw new Error(`Asset ${asset.id} provenance ${field} must contain visible text.`);
  }
  if (pixels > REGISTRY_PIXEL_LIMIT) throw new Error('Asset registry exceeds the 33554432 decoded pixel budget.');
}

/** Verify every local file and pin content, dimensions and actual alpha to its registry entry. */
export async function loadAssetRegistry(file: string): Promise<{
  registry: AssetRegistry;
  files: ReadonlyMap<string, string>;
  images: ReadonlyMap<string, Image>;
}> {
  const info = await stat(file);
  if (!info.isFile() || info.size > 256 * 1024) throw new Error('Asset registry must be a regular JSON file no larger than 256 KiB.');
  const bytes = await readFile(file);
  if (bytes.length > 256 * 1024) throw new Error('Asset registry exceeds the 256 KiB input limit.');
  const registry: unknown = JSON.parse(bytes.toString('utf8'));
  validateAssetRegistry(registry);
  const root = await realpath(path.dirname(path.resolve(file)));
  const files = new Map<string, string>(), images = new Map<string, Image>(), decoded = new Map<string, PngInspection>();
  for (const asset of registry.assets) {
    const requested = path.resolve(root, asset.src);
    if (!requested.startsWith(root + path.sep)) throw new Error(`Asset ${asset.id} must stay inside its registry directory.`);
    const actual = await realpath(requested);
    if (!actual.startsWith(root + path.sep)) throw new Error(`Asset ${asset.id} symlink escapes its registry directory.`);
    const source = await readPng(actual);
    if (source.sha256 !== asset.sha256) throw new Error(`Asset ${asset.id} content hash differs from its registry.`);
    if (source.width !== asset.width || source.height !== asset.height) throw new Error(`Asset ${asset.id} dimensions differ from its registry.`);
    const inspection = decoded.get(source.sha256) ?? await decodePng(source);
    if (inspection.hasTransparency !== asset.hasTransparency) throw new Error(`Asset ${asset.id} transparency differs from its registry.`);
    decoded.set(source.sha256, inspection);
    files.set(asset.id, actual); images.set(asset.id, inspection.image);
  }
  return { registry, files, images };
}

const requestSchema = JSON.parse(readFileSync(new URL('../../../../schemas/asset-request.schema.json', import.meta.url), 'utf8'));
const validateRequestShape = new Ajv({ allErrors: true, strict: true, strictNumbers: true }).compile<AssetRequest>(requestSchema);
export function validateAssetRequest(input: unknown): asserts input is AssetRequest {
  if (!validateRequestShape(input)) throw new Error((validateRequestShape.errors ?? []).map(issue => `${issue.instancePath || '/'} ${issue.message}`).join('\n'));
  const ids = new Set<string>();
  for (const asset of input.assets) {
    if (ids.has(asset.id)) throw new Error(`Duplicate asset ID: ${asset.id}`);
    ids.add(asset.id);
    for (const [field, value] of Object.entries(asset.provenance)) if (typeof value === 'string' && !value.trim()) throw new Error(`Asset ${asset.id} provenance ${field} must contain visible text.`);
  }
}

/** Register measured art without changing editorial provenance or approving it automatically. */
export async function buildAssetRegistry(requestFile: string, outputFile: string): Promise<AssetRegistry> {
  const info = await stat(requestFile);
  if (!info.isFile() || info.size > 256 * 1024) throw new Error('Asset request must be a regular JSON file no larger than 256 KiB.');
  const bytes = await readFile(requestFile);
  if (bytes.length > 256 * 1024) throw new Error('Asset request exceeds the 256 KiB input limit.');
  const request: unknown = JSON.parse(bytes.toString('utf8'));
  validateAssetRequest(request);
  const root = await realpath(path.dirname(path.resolve(requestFile)));
  const destination = path.resolve(outputFile);
  if (await realpath(path.dirname(destination)) !== root) throw new Error('Asset registry output must be in the same directory as its request.');
  const registry: AssetRegistry = { schemaVersion: 1, styleId: request.styleId, assets: [] };
  const measured = new Map<string, PngInspection>();
  let pixels = 0;
  for (const asset of request.assets) {
    const wanted = path.resolve(root, asset.src);
    if (!wanted.startsWith(root + path.sep)) throw new Error(`Asset ${asset.id} must stay inside its request directory.`);
    const actual = await realpath(wanted);
    if (!actual.startsWith(root + path.sep)) throw new Error(`Asset ${asset.id} symlink escapes its request directory.`);
    const source = await readPng(actual);
    let inspected = measured.get(source.sha256);
    if (!inspected) {
      pixels += source.width * source.height;
      if (pixels > REGISTRY_PIXEL_LIMIT) throw new Error('Asset request exceeds the 33554432 decoded pixel budget.');
      inspected = await decodePng(source); measured.set(source.sha256, inspected);
    }
    registry.assets.push({ ...asset, sha256: inspected.sha256, width: inspected.width, height: inspected.height, hasTransparency: inspected.hasTransparency });
  }
  validateAssetRegistry(registry);
  const serialized = JSON.stringify(registry, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > 256 * 1024) throw new Error('Derived asset registry exceeds the 256 KiB output limit. Shorten its metadata.');
  // Same-directory hard-link publication is atomic and cannot overwrite an old registry.
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(serialized, 'utf8');
    await handle.close();
    await link(temporary, destination);
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return registry;
}
