#!/usr/bin/env node
/**
 * Optional developer utility: use a separately installed eSpeak NG Emscripten
 * tool to regenerate the original narrated-story fixture. No downloads occur.
 * The GPL synthesis tool is not an engine/runtime dependency or bundled asset.
 * Usage: node tools/generate-demo-voice.mjs /absolute/path/to/espeak-ng.js [output-directory] [script-file]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleArgument = process.argv[2];
if (!moduleArgument) {
  console.error('Usage: node tools/generate-demo-voice.mjs /absolute/path/to/espeak-ng.js [output-directory] [script-file]');
  process.exitCode = 2;
} else {
  await generate(path.resolve(moduleArgument), path.resolve(process.argv[3] || path.join(repositoryRoot, 'examples/narrated-story')));
}

async function generate(modulePath, outputDirectory) {
  const scriptPath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(repositoryRoot, 'examples/narrated-story/script.txt');
  const sourceBytes = await readFile(scriptPath);
  const text = sourceBytes.toString('utf8').trimEnd();
  if (!/^[\x20-\x7E\r\n]+$/.test(text)) throw new Error('This fixture uses ASCII text so eSpeak character offsets map directly to JavaScript indices.');
  const packageMetadata = JSON.parse(await readFile(path.join(path.dirname(modulePath), 'package.json'), 'utf8'));
  if (packageMetadata.name !== '@echogarden/espeak-ng-emscripten' || packageMetadata.version !== '0.3.5') {
    throw new Error('Fixture generation requires the separately installed @echogarden/espeak-ng-emscripten@0.3.5 tool.');
  }
  const { default: initialize } = await import(pathToFileURL(modulePath).href);
  const synthesisModule = await initialize();
  const synthesizer = await new synthesisModule.eSpeakNGWorker();
  // Version 0.3.5 uses original eSpeak WPM/pitch units, rather than the
  // normalized rate/pitch API exposed by later Echogarden consumers.
  const settings = { voice: 'en-us', rateFactor: 0.9, rateWordsPerMinute: 158, pitch: 50, sampleRate: 22050, channels: 1, encoding: 'PCM16 little-endian' };
  synthesizer.set_voice(settings.voice);
  synthesizer.set_rate(settings.rateWordsPerMinute);
  synthesizer.set_pitch(settings.pitch);
  const chunks = [];
  const events = [];
  await synthesizer.synthesize(text, (samples, batch) => {
    if (samples?.length) chunks.push(Int16Array.from(samples));
    if (batch) events.push(...batch.map(event => ({ ...event })));
  });
  const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!sampleCount) throw new Error('Synthesis returned no samples.');
  const durationSeconds = sampleCount / settings.sampleRate;
  const wav = encodeWave(chunks, sampleCount, settings.sampleRate);
  const wordEvents = events.filter(event => event.type === 'word' && event.word_length > 0);
  const words = wordEvents.map((event, index) => {
    const offset = event.text_position - 1;
    const start = event.audio_position / 1000;
    const end = index + 1 < wordEvents.length ? wordEvents[index + 1].audio_position / 1000 : durationSeconds;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > durationSeconds + 0.001) {
      throw new Error(`Invalid word event boundary at word ${index + 1}.`);
    }
    return { id: `w${index + 1}`, text: text.slice(offset, offset + event.word_length), start, end };
  });
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (normalize(words.map(word => word.text).join(' ')) !== normalize(text)) {
    throw new Error('Synthesis word events do not cover the original fixture text.');
  }
  const timing = {
    durationSeconds,
    timingSource: 'synthesis-events',
    notes: 'Starts are eSpeak NG synthesis word-event positions. Ends are approximate boundaries at the next word onset, or the WAV duration for the last word; they include inter-word pauses. These are not forced-alignment measurements of a human recording.',
    words,
  };
  const timingBytes = Buffer.from(JSON.stringify(timing, null, 2) + '\n');
  const provenance = {
    description: 'Original Rachana Engine 2D demo script, synthesized locally with a standard formant voice. No user recording, impersonation, cloud service, or sampled MBROLA voice was used.',
    textAuthor: 'Tejas Dadhich / Rachana Engine 2D project, with AI assistance',
    synthesisTool: { name: packageMetadata.name, version: packageMetadata.version, license: packageMetadata.license, use: 'Optional external development tool; package code and voice data are not bundled with this fixture or engine runtime.' },
    settings,
    durationSeconds,
    wordCount: words.length,
    timingSource: timing.timingSource,
    timingLimitations: timing.notes,
    files: {
      'script.txt': { sha256: sha256(sourceBytes) },
      'voice.wav': { sha256: sha256(wav), bytes: wav.length },
      'timing.json': { sha256: sha256(timingBytes) },
    },
    synthesisTextSha256: sha256(Buffer.from(text)),
    sources: {
      tool: 'https://github.com/echogarden-project/espeak-ng-emscripten',
      espeakNG: 'https://github.com/espeak-ng/espeak-ng',
      toolLicense: 'https://github.com/echogarden-project/espeak-ng-emscripten/blob/main/COPYING',
      originalAuthorOutputPermission: 'https://sourceforge.net/p/espeak/discussion/538920/thread/c6944a60/',
      outputLicenseClause: 'https://github.com/espeak-ng/espeak-ng/blob/master/COPYING',
    },
    outputUsageNotes: 'eSpeak original author Jonathan Duddington states that its GPL does not apply to generated WAV speech output. The external tool retains its GPL license; these generated audio bytes do not bundle the tool code or voice datasets. See linked primary sources. This record documents provenance and does not claim exclusive copyright in synthesized speech.',
    regeneration: 'Run tools/generate-demo-voice.mjs with an explicit path to a separately installed @echogarden/espeak-ng-emscripten@0.3.5 entry point. This utility never installs or downloads the tool.',
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'script.txt'), sourceBytes);
  await writeFile(path.join(outputDirectory, 'voice.wav'), wav);
  await writeFile(path.join(outputDirectory, 'timing.json'), timingBytes);
  await writeFile(path.join(outputDirectory, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify({ durationSeconds, words: words.length, samples: sampleCount, sampleRate: settings.sampleRate, outputDirectory }, null, 2));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function encodeWave(chunks, sampleCount, sampleRate) {
  const output = Buffer.alloc(44 + sampleCount * 2);
  output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4); output.write('WAVE', 8);
  output.write('fmt ', 12); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22); output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(sampleCount * 2, 40);
  let offset = 44;
  for (const chunk of chunks) for (const sample of chunk) { output.writeInt16LE(sample, offset); offset += 2; }
  return output;
}
