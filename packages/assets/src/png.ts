import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { PngInspection } from './types.js';

export const PNG_FILE_LIMIT = 12 * 1024 * 1024;
export const PNG_EDGE_LIMIT = 4096;
export const PNG_PIXEL_LIMIT = 16_777_216;
export const REGISTRY_PIXEL_LIMIT = 33_554_432;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface PngSource {
  data: Buffer;
  sha256: string;
  width: number;
  height: number;
  mayHaveAlpha: boolean;
}

/** Validate bounded PNG structure before handing bytes to the native decoder. */
export async function readPng(file: string): Promise<PngSource> {
  const info = await stat(file);
  if (!info.isFile() || info.size > PNG_FILE_LIMIT) throw new Error('PNG must be a regular file no larger than 12 MiB.');
  const data = await readFile(file);
  if (data.length > PNG_FILE_LIMIT) throw new Error('PNG exceeds the 12 MiB input limit.');
  if (data.length < 45 || !data.subarray(0, 8).equals(signature)) throw new Error('Only genuine static PNG files are supported.');
  let width = 0, height = 0, colorType = -1, depth = 0, interlace = 0;
  const compressed: Buffer[] = [];
  let seenHeader = false, seenData = false, dataEnded = false, seenEnd = false, seenPalette = false, mayHaveAlpha = false;
  let dataBytes = 0, chunks = 0;
  for (let offset = 8; offset < data.length;) {
    if (++chunks > 4096) throw new Error('PNG exceeds the 4096 chunk limit.');
    if (offset + 12 > data.length) throw new Error('Truncated PNG chunk.');
    const length = data.readUInt32BE(offset);
    const begin = offset + 8, end = begin + length;
    if (end + 4 > data.length) throw new Error('Truncated PNG chunk payload.');
    const type = data.toString('ascii', offset + 4, begin);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('Invalid PNG chunk type.');
    if (crc32(data.subarray(offset + 4, end)) !== data.readUInt32BE(end)) throw new Error(`PNG checksum mismatch in ${type}.`);
    if (!seenHeader && type !== 'IHDR') throw new Error('PNG must begin with an IHDR chunk.');
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw new Error('Animated PNG is unsupported; import a static PNG.');
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) throw new Error('PNG must contain exactly one 13-byte IHDR chunk.');
      seenHeader = true;
      width = data.readUInt32BE(begin); height = data.readUInt32BE(begin + 4);
      if (width < 1 || height < 1 || width > PNG_EDGE_LIMIT || height > PNG_EDGE_LIMIT || width * height > PNG_PIXEL_LIMIT) throw new Error('PNG dimensions exceed the 4096 edge / 16777216 pixel limit.');
      depth = data[begin + 8]; colorType = data[begin + 9]; interlace = data[begin + 12];
      const validDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!validDepths[colorType]?.includes(depth) || data[begin + 10] !== 0 || data[begin + 11] !== 0 || data[begin + 12] > 1) throw new Error('Unsupported or malformed PNG header.');
      mayHaveAlpha = colorType === 4 || colorType === 6;
    } else if (type === 'PLTE') {
      if (seenPalette || seenData || length < 3 || length > 768 || length % 3 !== 0) throw new Error('Invalid PNG palette.');
      seenPalette = true;
    } else if (type === 'tRNS') {
      if (seenData) throw new Error('PNG transparency must precede image data.');
      mayHaveAlpha = true;
    } else if (type === 'IDAT') {
      if (dataEnded) throw new Error('PNG IDAT chunks must be consecutive.');
      if (colorType === 3 && !seenPalette) throw new Error('Indexed PNG is missing its palette.');
      seenData = true; dataBytes += length; compressed.push(data.subarray(begin, end));
    } else if (type === 'IEND') {
      if (length !== 0 || !seenData || dataBytes === 0 || end + 4 !== data.length) throw new Error('Invalid PNG end or trailing data.');
      seenEnd = true;
    } else {
      // An uppercase first letter denotes a critical chunk we must understand.
      if (type[0] === type[0].toUpperCase()) throw new Error(`Unsupported critical PNG chunk: ${type}.`);
      if (seenData) dataEnded = true;
    }
    offset = end + 4;
  }
  if (!seenHeader || !seenEnd) throw new Error('PNG is missing its header or end chunk.');
  // Native decoders may recover malformed IDAT streams as blank art. Require the
  // exact bounded scanline layout, including Adam7 passes, before decoding pixels.
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = passes.map(([x, y, dx, dy]) => {
    const passWidth = Math.max(0, Math.ceil((width - x) / dx));
    const passHeight = Math.max(0, Math.ceil((height - y) / dy));
    return { stride: 1 + Math.ceil(passWidth * channels[colorType] * depth / 8), count: passWidth ? passHeight : 0 };
  });
  const expectedBytes = rows.reduce((sum, row) => sum + row.stride * row.count, 0);
  const idat = Buffer.concat(compressed);
  let decoded: { buffer: Buffer; engine: { bytesWritten: number } };
  try {
    decoded = inflateSync(idat, { maxOutputLength: expectedBytes + 1, info: true }) as unknown as typeof decoded;
  } catch { throw new Error('PNG image data could not be decoded within its bounded scanline size.'); }
  if (decoded.buffer.length !== expectedBytes || decoded.engine.bytesWritten !== idat.length) throw new Error('PNG image data has an invalid scanline size or trailing compressed data.');
  let rowOffset = 0;
  for (const row of rows) for (let i = 0; i < row.count; i++) {
    if (decoded.buffer[rowOffset] > 4) throw new Error('PNG image data has an invalid scanline filter.');
    rowOffset += row.stride;
  }
  return { data, sha256: createHash('sha256').update(data).digest('hex'), width, height, mayHaveAlpha };
}

export async function decodePng(source: PngSource): Promise<PngInspection> {
  let image;
  try { image = await loadImage(source.data); }
  catch { throw new Error('PNG image data could not be decoded.'); }
  if (image.width !== source.width || image.height !== source.height) throw new Error('Decoded PNG dimensions differ from its header.');
  let hasTransparency = false, hasVisiblePixels = !source.mayHaveAlpha;
  if (source.mayHaveAlpha) {
    const canvas = createCanvas(source.width, source.height), context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, source.width, source.height).data;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 255) hasTransparency = true;
      if (pixels[i] > 0) hasVisiblePixels = true;
      if (hasTransparency && hasVisiblePixels) break;
    }
    // Release the temporary alpha-inspection surface before returning the image.
    canvas.width = 1; canvas.height = 1;
  }
  if (!hasVisiblePixels) throw new Error('PNG has no visible pixels; fully transparent artwork cannot satisfy an asset.');
  return { image, sha256: source.sha256, width: source.width, height: source.height, hasTransparency, bytes: source.data.length };
}

/** Inspect actual pixels; an alpha-capable PNG header alone does not imply transparency. */
export async function inspectPng(file: string): Promise<PngInspection> {
  return decodePng(await readPng(file));
}
