import { realpath, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateScene } from '../../core/src/validate.js';
import type { Scene } from '../../core/src/types.js';

export async function loadScene(file: string): Promise<Scene> {
  const info = await stat(file);
  if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Scene must be a regular JSON file no larger than 4 MiB.');
  const input: unknown = JSON.parse(await readFile(file, 'utf8'));
  const result = validateScene(input);
  if (!result.valid) throw new Error(result.errors.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
  return input as Scene;
}

/** Constrain imported media to the scene folder, including symlink resolution. */
export async function resolveAudio(sceneFile: string, relative: string): Promise<string> {
  const root = await realpath(path.dirname(path.resolve(sceneFile)));
  const requested = path.resolve(root, relative);
  if (!requested.startsWith(root + path.sep)) throw new Error('Audio must be inside the scene directory.');
  const actual = await realpath(requested);
  if (!actual.startsWith(root + path.sep)) throw new Error('Audio symlink escapes the scene directory.');
  return actual;
}

/** Small, explicit audio surface: PCM16 WAV, not playlists or remote URLs. */
export async function inspectWav(file: string): Promise<{ durationSeconds: number; channels: number; sampleRate: number; peak: number }> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error('Audio must be a regular WAV file.');
  if (info.size > 64 * 1024 * 1024) throw new Error('WAV exceeds the 64 MiB alpha input limit.');
  const data = await readFile(file);
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Audio must be a PCM16 WAV file.');
  if (data.readUInt32LE(4) !== data.length - 8) throw new Error('WAV RIFF size does not match the file length.');
  let channels = 0, sampleRate = 0, blockAlign = 0, audio: Buffer | null = null;
  for (let offset = 12; offset + 8 <= data.length;) {
    const name = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const begin = offset + 8;
    if (begin + size > data.length) throw new Error('Truncated WAV chunk.');
    if (name === 'fmt ') {
      if (channels) throw new Error('Multiple WAV fmt chunks are unsupported.');
      if (size < 16 || data.readUInt16LE(begin) !== 1 || data.readUInt16LE(begin + 14) !== 16) throw new Error('Only uncompressed PCM16 WAV is supported in this alpha.');
      channels = data.readUInt16LE(begin + 2);
      sampleRate = data.readUInt32LE(begin + 4);
      blockAlign = data.readUInt16LE(begin + 12);
      if (channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 96000 || blockAlign !== channels * 2 || data.readUInt32LE(begin + 8) !== sampleRate * blockAlign) throw new Error('Unsupported or inconsistent WAV format.');
    }
    if (name === 'data') {
      if (audio) throw new Error('Multiple WAV data chunks are unsupported.');
      audio = data.subarray(begin, begin + size);
    }
    offset = begin + size + (size % 2);
  }
  if (!audio?.length || !channels || audio.length % blockAlign) throw new Error('WAV is missing valid PCM audio.');
  let peak = 0;
  for (let i = 0; i < audio.length; i += 2) peak = Math.max(peak, Math.abs(audio.readInt16LE(i)) / 32768);
  return { durationSeconds: audio.length / (sampleRate * blockAlign), channels, sampleRate, peak };
}
