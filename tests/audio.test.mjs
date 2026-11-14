import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectWav } from '../dist/packages/renderer/src/files.js';

/** A few real interleaved PCM16 samples, encoded as RIFF rather than mocked IO. */
function wav(options = {}) {
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 16000;
  const blockAlign = options.blockAlign ?? channels * 2;
  const audio = options.audio ?? Buffer.alloc(8 * Math.max(1, channels) * 2);
  if (!options.audio) {
    for (let i = 0; i < audio.length / 2; i++) audio.writeInt16LE([0, 16384, -8192, -16384][i % 4], i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + audio.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(options.format ?? 1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(options.byteRate ?? sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(options.bitsPerSample ?? 16, 34);
  header.write('data', 36); header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

async function file(t, data, name = 'voice.wav') {
  const directory = await mkdtemp(path.join(tmpdir(), 'rachana-audio-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, name);
  await writeFile(filename, data);
  return filename;
}

test('inspects PCM16 mono/stereo WAV sample rate, duration and peak', async t => {
  for (const [channels, sampleRate] of [[1, 8000], [1, 16000], [2, 48000], [2, 96000]]) {
    const result = await inspectWav(await file(t, wav({ channels, sampleRate })));
    assert.deepEqual(result, { channels, sampleRate, durationSeconds: 8 / sampleRate, peak: 0.5 });
  }
  const fullScale = Buffer.alloc(4); fullScale.writeInt16LE(-32768, 0); fullScale.writeInt16LE(32767, 2);
  assert.equal((await inspectWav(await file(t, wav({ audio: fullScale })))).peak, 1);
});

test('rejects non-WAV headers and short files regardless of their extension', async t => {
  for (const data of [Buffer.alloc(0), Buffer.from('#EXTM3U\nhttps://example.invalid/audio.wav\n'), Buffer.from('RIFF'), Buffer.from('RIFF0000NOPE')]) {
    await assert.rejects(inspectWav(await file(t, data)), /PCM16 WAV/);
  }
  const rifx = wav(); rifx.write('RIFX', 0);
  await assert.rejects(inspectWav(await file(t, rifx)), /PCM16 WAV/);
});

test('rejects compressed, float and non-16-bit fmt chunks', async t => {
  for (const options of [{ format: 3 }, { format: 6 }, { bitsPerSample: 8 }, { bitsPerSample: 24 }]) {
    await assert.rejects(inspectWav(await file(t, wav(options))), /uncompressed PCM16/);
  }
  const shortFmt = wav(); shortFmt.writeUInt32LE(14, 16);
  await assert.rejects(inspectWav(await file(t, shortFmt)), /uncompressed PCM16/);
});

test('rejects chunk payloads shorter than their declared length', async t => {
  const truncatedFmt = wav().subarray(0, 30);
  truncatedFmt.writeUInt32LE(truncatedFmt.length - 8, 4);
  await assert.rejects(inspectWav(await file(t, truncatedFmt)), /Truncated WAV chunk/);
  const truncatedAudio = wav(); truncatedAudio.writeUInt32LE(1000, 40);
  await assert.rejects(inspectWav(await file(t, truncatedAudio)), /Truncated WAV chunk/);
});

test('rejects a RIFF declared length that disagrees with the actual file', async t => {
  for (const difference of [-1, 1]) {
    const data = wav(); data.writeUInt32LE(data.length - 8 + difference, 4);
    await assert.rejects(inspectWav(await file(t, data)), /RIFF size/);
  }
});

test('rejects duplicate fmt chunks instead of interpreting ambiguous formats', async t => {
  const original = wav();
  const duplicate = Buffer.concat([original.subarray(0, 36), original.subarray(12, 36), original.subarray(36)]);
  duplicate.writeUInt32LE(duplicate.length - 8, 4);
  await assert.rejects(inspectWav(await file(t, duplicate)), /Multiple WAV fmt chunks/);
});

test('rejects invalid rate, channels, block alignment and byte rate', async t => {
  for (const options of [
    { sampleRate: 0 }, { sampleRate: 7999 }, { sampleRate: 96001 },
    { channels: 0 }, { channels: 3 }, { blockAlign: 0 }, { blockAlign: 1 },
    { channels: 2, blockAlign: 2 }, { byteRate: 1 }
  ]) {
    await assert.rejects(inspectWav(await file(t, wav(options))), /Unsupported or inconsistent WAV format/);
  }
  await assert.rejects(inspectWav(await file(t, wav({ channels: 2, audio: Buffer.alloc(6) }))), /missing valid PCM audio/);
});

test('requires one nonempty data chunk and a fmt chunk', async t => {
  const noData = wav().subarray(0, 36); noData.writeUInt32LE(28, 4);
  await assert.rejects(inspectWav(await file(t, noData)), /missing valid PCM audio/);
  await assert.rejects(inspectWav(await file(t, wav({ audio: Buffer.alloc(0) }))), /missing valid PCM audio/);
  const noFmt = wav(); noFmt.write('JUNK', 12);
  await assert.rejects(inspectWav(await file(t, noFmt)), /missing valid PCM audio/);
  const original = wav(); const duplicate = Buffer.concat([original, original.subarray(36)]);
  duplicate.writeUInt32LE(duplicate.length - 8, 4);
  await assert.rejects(inspectWav(await file(t, duplicate)), /Multiple WAV data chunks/);
});

test('rejects directories as audio inputs', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rachana-audio-directory-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(inspectWav(directory), /regular WAV file/);
});
