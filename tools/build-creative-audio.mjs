/** Original procedural music/cues; the demo keeps the same narration and duration. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectWav } from '../dist/packages/renderer/src/files.js';

const folder = 'examples/narrated-story';
const source = await readFile(`${folder}/voice.wav`);
const info = await inspectWav(`${folder}/voice.wav`);
if (info.channels !== 1) throw new Error('The authored demo utility expects its mono narration fixture.');
let dataOffset = -1, byteLength = 0;
for (let offset = 12; offset + 8 <= source.length;) {
  const size = source.readUInt32LE(offset + 4);
  if (source.toString('ascii', offset, offset + 4) === 'data') { dataOffset = offset + 8; byteLength = size; break; }
  offset += 8 + size + size % 2;
}
if (dataOffset < 0) throw new Error('Missing PCM samples.');
const rate = info.sampleRate, total = byteLength / 2, music = new Float64Array(total);
const notes = [261.6256, 329.6276, 391.9954, 523.2511, 391.9954, 329.6276, 293.6648, 391.9954];
function pluck(at, frequency, gain, length = 1.6) {
  for (let i = Math.floor(at * rate), n = 0; i < total && n < rate * length; i++, n++) {
    const t = n / rate, attack = Math.min(1, t / .012), decay = Math.exp(-t * 3.7);
    music[i] += gain * attack * decay * (Math.sin(t * frequency * 2 * Math.PI) + .18 * Math.sin(t * frequency * 4 * Math.PI));
  }
}
for (let i = 0, at = .25; at < info.durationSeconds - .7; i++, at += .78) pluck(at, notes[i % notes.length], .009);
let seed = 94131;
function noise() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 * 2 - 1; }
const timing = JSON.parse(await readFile(`${folder}/timing.json`, 'utf8'));
const cues = [13, 35, 42, 51].map(n => ({ time: timing.words[n - 1].start, type: 'quiet paper sweep' }));
for (const { time } of cues) {
  const length = .24;
  for (let n = 0; n < length * rate; n++) {
    const i = Math.floor((time - .1) * rate) + n;
    if (i >= 0 && i < total) music[i] += noise() * .012 * Math.sin(Math.PI * n / (length * rate)) ** 2;
  }
  pluck(time + .02, 783.9909, .008, .5);
}
const output = Buffer.from(source);
let peak = 0;
for (let i = 0; i < total; i++) {
  const t = i / rate, tail = Math.max(0, Math.min(1, (info.durationSeconds - t) / .6));
  const value = source.readInt16LE(dataOffset + i * 2) / 32768 * 1.1 + music[i] * tail;
  peak = Math.max(peak, Math.abs(value));
  if (Math.abs(value) >= 1) throw new Error('Precomposed demo audio would clip.');
  output.writeInt16LE(Math.round(value * 32767), dataOffset + i * 2);
}
await writeFile(`${folder}/creative-mix.wav`, output);
const sha = data => createHash('sha256').update(data).digest('hex');
await writeFile(`${folder}/creative-provenance.json`, JSON.stringify({
  description: 'Original authored creative showcase using the existing synthetic narration plus original procedurally synthesized music and transition cues.',
  narration: 'voice.wav; see provenance.json for original formant synthesis and word-event timing.',
  narrationProcessing: 'Gain 1.1; no trimming, time stretching or wording changes.',
  music: { method: 'Original sine/harmonic plucks; deterministic note sequence; no sampled or third-party music.', notesHz: notes, gain: .009, intervalSeconds: .78 },
  effects: { method: 'Seeded original noise-envelope paper sweeps with quiet harmonic accents.', seed: 94131, cues },
  durationSeconds: info.durationSeconds, sampleRate: rate, channels: 1, encoding: 'PCM16', peak,
  files: { 'voice.wav': { sha256: sha(source) }, 'creative-mix.wav': { sha256: sha(output), bytes: output.length } },
  limitations: 'This utility prepares one example audio file; it is not a general multitrack audio editor or a generative provider.',
}, null, 2) + '\n');
console.log(`Original quiet music and cues mixed; peak ${peak.toFixed(3)}, duration unchanged.`);
