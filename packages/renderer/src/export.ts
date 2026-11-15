import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, access, link, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { evaluateScene, frameCount } from '../../core/src/evaluate.js';
import type { Scene } from '../../core/src/types.js';
import { createSurface, drawFrame } from './draw.js';
import { resolveAudio, inspectWav } from './files.js';
import { prepareSceneImages } from './images.js';

export function ffmpegBinary(): string { return process.env.FFMPEG_PATH || 'ffmpeg'; }

export function inspectFFmpeg(): { available: boolean; version: string; binary: string } {
  const binary = ffmpegBinary();
  const result = spawnSync(binary, ['-version'], { encoding: 'utf8', timeout: 10_000 });
  return { available: result.status === 0, version: result.stdout?.split('\n')[0] || result.error?.message || 'Unavailable', binary };
}

/** Encode fresh frames; never overwrite an existing user file. */
export async function renderVideo(scene: Scene, sceneFile: string, output: string): Promise<object> {
  output = path.resolve(output);
  if (!output.endsWith('.mp4')) throw new Error('Video output must end in .mp4.');
  const probe = inspectFFmpeg();
  if (!probe.available) throw new Error('FFmpeg is missing. Run doctor; install FFmpeg or set FFMPEG_PATH.');
  for (const destination of [output, `${output}.manifest.json`]) {
    try { await access(destination); throw new Error(`Output already exists: ${destination}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const images = await prepareSceneImages(scene, sceneFile);
  const audio = scene.audio ? await resolveAudio(sceneFile, scene.audio.src) : null;
  const audioInfo = audio ? await inspectWav(audio) : null;
  if (audioInfo && Math.abs(audioInfo.durationSeconds - scene.output.durationSeconds) > 1 / scene.output.fps) throw new Error('Narration and scene durations differ by more than one frame. Edit the scene timing or the audio explicitly.');
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp.mp4`;
  const total = frameCount(scene);
  const canvas = createSurface(scene.output.width, scene.output.height);
  const args = ['-n', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${scene.output.width}x${scene.output.height}`, '-framerate', String(scene.output.fps), '-i', 'pipe:0'];
  if (audio) args.push('-protocol_whitelist', 'file,pipe', '-f', 'wav', '-i', audio);
  args.push('-map', '0:v:0');
  if (audio) args.push('-map', '1:a:0', '-af', `volume=${scene.audio?.gain ?? 1},alimiter=limit=0.95:level=false:latency=true,apad`, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000');
  else args.push('-an');
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-threads', '2', '-pix_fmt', 'yuv420p',
    '-t', String(total / scene.output.fps), '-movflags', '+faststart', temporary);
  const child = spawn(probe.binary, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let log = '';
  child.stderr.on('data', chunk => { log = (log + chunk.toString()).slice(-12_000); });
  child.stdin.on('error', () => { /* The exit/error promise reports encoder failures. */ });
  const completed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(log || `FFmpeg exited ${code}`)));
  });
  // Attach a rejection handler immediately, even when failure occurs mid-frame loop.
  completed.catch(() => {});
  const started = performance.now();
  let published = false;
  let manifestPublished = false;
  const temporaryManifest = `${temporary}.json`;
  let cancelled = false;
  const terminate = () => {
    child.stdin.destroy();
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    timer.unref();
    child.once('close', () => clearTimeout(timer));
  };
  const cancel = () => { cancelled = true; terminate(); };
  process.once('SIGINT', cancel);
  try {
    for (let frame = 0; frame < total; frame++) {
      if (cancelled || child.exitCode !== null || child.stdin.destroyed) throw new Error(log || 'Render cancelled or encoder stopped.');
      drawFrame(canvas, evaluateScene(scene, frame / scene.output.fps), images);
      if (!child.stdin.write(canvas.data())) await Promise.race([once(child.stdin, 'drain'), completed.then(() => { throw new Error('Encoder stopped early.'); })]);
      if (frame % (scene.output.fps * 5) === 0) process.stderr.write(`Rendering ${frame}/${total} frames\n`);
    }
    child.stdin.end();
    await completed;
    // A hard link publishes only after success and fails atomically if output now exists.
    const manifest = { sceneId: scene.id, width: scene.output.width, height: scene.output.height, fps: scene.output.fps,
      frames: total, plannedDurationSeconds: scene.output.durationSeconds, videoDurationSeconds: total / scene.output.fps,
      hasAudio: Boolean(audio), audioInput: audioInfo, timingSource: scene.narration?.timingSource ?? null,
      imageAssets: (scene.images ?? []).map(({ id, sha256, width, height }) => ({ id, sha256, width, height })),
      renderer: '@napi-rs/canvas', ffmpeg: probe.version, renderSeconds: Math.round((performance.now() - started) / 10) / 100,
      limitations: 'No automatic speech alignment, TTS, asset generation, render cache or resume. Timing data is supplied with the scene.' };
    await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await link(temporary, output);
    published = true;
    await link(temporaryManifest, `${output}.manifest.json`);
    manifestPublished = true;
    return manifest;
  } catch (error) {
    terminate();
    if (published && !manifestPublished) await unlink(output).catch(() => {});
    await completed.catch(() => {});
    throw error;
  } finally {
    process.removeListener('SIGINT', cancel);
    await unlink(temporary).catch(() => {});
    await unlink(temporaryManifest).catch(() => {});
  }
}
