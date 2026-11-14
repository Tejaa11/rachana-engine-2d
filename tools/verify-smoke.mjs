import { spawnSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const input = path.resolve(process.argv[2] || 'renders/minimal.mp4');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const manifest = JSON.parse(await readFile(`${input}.manifest.json`, 'utf8'));
function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || 'FFmpeg verification failed.');
  return result;
}
// Decode both streams, then count video samples separately using machine-readable progress.
const fullDecode = run(['-xerror', '-err_detect', 'explode', '-v', 'error', '-i', input, '-f', 'null', '-']);
if (fullDecode.stderr.trim()) throw new Error(`Decode reported errors: ${fullDecode.stderr}`);
const decoded = run(['-hide_banner', '-i', input, '-map', '0:v:0', '-an', '-nostats', '-progress', 'pipe:1', '-f', 'null', '-']);
const frames = [...decoded.stdout.matchAll(/^frame=(\d+)$/gm)].at(-1)?.[1];
if (Number(frames) !== manifest.frames) throw new Error(`Decoded frame count ${frames} differs from ${manifest.frames}.`);
if (!decoded.stderr.includes(`${manifest.width}x${manifest.height}`)) throw new Error('Decoded resolution differs from the manifest.');
if (!decoded.stderr.includes(`${manifest.fps} fps`)) throw new Error('Decoded frame rate differs from the manifest.');
if (!/Video: h264\b/.test(decoded.stderr)) throw new Error('Expected H.264 video.');
const duration = decoded.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
if (!duration) throw new Error('No duration reported.');
const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
if (Math.abs(seconds - manifest.videoDurationSeconds) > 1 / manifest.fps + 0.01) throw new Error('Duration differs by more than one frame plus reported-time rounding.');
const hasAudio = /Audio: aac\b/.test(decoded.stderr);
if (hasAudio !== manifest.hasAudio) throw new Error('Audio stream presence differs from the manifest.');
let loudness = null;
if (hasAudio) {
  const measured = run(['-hide_banner', '-i', input, '-map', '0:a:0', '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
  const summary = measured.slice(measured.lastIndexOf('Summary:'));
  const integrated = summary.match(/I:\s*([\d.-]+) LUFS/);
  const peak = summary.match(/Peak:\s*([\d.-]+) dBFS/);
  if (!integrated || !peak) throw new Error('Audio measurements unavailable.');
  loudness = { integratedLufs: Number(integrated[1]), truePeakDbfs: Number(peak[1]) };
  if (loudness.truePeakDbfs >= 0) throw new Error('Encoded audio reaches or exceeds full-scale true peak.');
}
const report = {
  sceneId: manifest.sceneId, fullDecode: 'passed', frames: Number(frames), width: manifest.width, height: manifest.height,
  fps: manifest.fps, reportedDurationSeconds: seconds, plannedDurationSeconds: manifest.plannedDurationSeconds,
  codec: 'h264', audioCodec: hasAudio ? 'aac' : null, loudness, bytes: (await stat(input)).size,
  sha256: createHash('sha256').update(await readFile(input)).digest('hex'),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  note: 'These are measurements of this file, not a universal loudness target or cross-platform pixel-identity claim.',
};
await writeFile(`${input}.verification.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
