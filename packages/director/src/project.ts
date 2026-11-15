import { readFile, writeFile, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv } from 'ajv';
import { createHash } from 'node:crypto';
import { resolveAudio, inspectWav } from '../../renderer/src/files.js';
import { planProduction, type ProductionConfig, type Timing } from './plan.js';
import { composePlan } from './compose.js';
const schema = JSON.parse(readFileSync(new URL('../../../../schemas/production.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true, strict: true, strictNumbers: true }).compile<ProductionConfig>(schema);
export function validateProductionConfig(input: unknown): asserts input is ProductionConfig {
    if (!validate(input))
        throw new Error((validate.errors ?? []).map(issue => `${issue.instancePath || '/'} ${issue.message}`).join('\n'));
    if (!input.title.trim() || input.beats?.some(beat => !beat.heading.trim() || beat.items?.some(item => !item.trim())))
        throw new Error('Titles, headings and item labels must contain visible text.');
    if (input.output && input.output.width / input.output.height !== 16 / 9)
        throw new Error('This composer currently supports 16:9 output only.');
}
async function bounded(file: string, limit: number): Promise<Buffer> {
    const info = await stat(file);
    if (!info.isFile() || info.size > limit)
        throw new Error('Production inputs must be regular files within their documented size limits.');
    return readFile(file);
}
export async function loadProduction(file: string) {
    const input: unknown = JSON.parse((await bounded(file, 1024 * 1024)).toString('utf8'));
    validateProductionConfig(input);
    // Every external reference is relative to the brief and realpath-contained.
    const scriptFile = await resolveAudio(file, input.script), timingFile = await resolveAudio(file, input.timing), audioFile = await resolveAudio(file, input.audio);
    const scriptBytes = await bounded(scriptFile, 128 * 1024), timingBytes = await bounded(timingFile, 4 * 1024 * 1024);
    const script = scriptBytes.toString('utf8').trim();
    const timing = JSON.parse(timingBytes.toString('utf8')) as Timing;
    if (!timing || typeof timing !== 'object')
        throw new Error('Timing input must be an object.');
    const audio = await inspectWav(audioFile);
    const fps = input.output?.fps ?? 30;
    if (Math.abs(audio.durationSeconds - timing.durationSeconds) > 1 / fps)
        throw new Error('WAV and supplied word-timing duration differ by more than one frame.');
    const plan = planProduction(input, script, timing);
    return { config: input, script, scriptBytes, timing, timingBytes, audioFile, audio, plan };
}
/** Publish a new local production folder; never overwrite an existing project. */
export async function composeProduction(file: string, directory: string) {
    const loaded = await loadProduction(file);
    const composed = composePlan(loaded.plan);
    const scene = composed.scene;
    const report = { ...composed.report, audio: loaded.audio };
    if (loaded.audio.peak === 0)
        report.warnings.push('The WAV is silent. Review or replace the narration.');
    else if (loaded.audio.peak > .98)
        report.warnings.push('The WAV is close to full scale; listen for source clipping. The export limiter cannot repair clipped input.');
    const target = path.resolve(directory);
    await mkdir(path.dirname(target), { recursive: true });
    await mkdir(target); // Exclusive ownership: EEXIST is intentional and preserves prior work.
    try {
        const sources = { scriptSha256: createHash('sha256').update(loaded.scriptBytes).digest('hex'), timingSha256: createHash('sha256').update(loaded.timingBytes).digest('hex') };
        const artifacts: Record<string, unknown> = {
            'scene.json': scene, 'plan.json': loaded.plan, 'quality-report.json': { ...report, sources: { ...sources, audioSha256: createHash('sha256').update(await bounded(loaded.audioFile, 64 * 1024 * 1024)).digest('hex') } },
            'timing.json': loaded.timing,
            'production.json': { ...loaded.config, script: 'script.txt', audio: 'voice.wav', timing: 'timing.json' },
        };
        for (const [name, value] of Object.entries(artifacts))
            await writeFile(path.join(target, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
        await writeFile(path.join(target, 'script.txt'), loaded.scriptBytes, { flag: 'wx' });
        await copyFile(loaded.audioFile, path.join(target, 'voice.wav'));
        return { directory: target, sceneFile: path.join(target, 'scene.json'), plan: loaded.plan, report };
    }
    catch (error) {
        await rm(target, { recursive: true, force: true });
        throw error;
    }
}
