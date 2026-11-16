import { readFile, writeFile, mkdir, rm, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadAssetRegistry } from '../../assets/src/index.js';
import { resolveAudio } from '../../renderer/src/files.js';
import { readProductionInputs, loadProduction, composeProduction } from './project.js';
import { planProduction, type BeatInput } from './plan.js';
import { composePlan } from './compose.js';
import { DIRECTOR_INSTRUCTIONS, directorSchema, validateDirectorDraft, type DirectorDraft } from './contract.js';
import type { DirectorProvider, DirectorResult } from './provider.js';
export async function readDirectorJson(file: string): Promise<unknown> {
    const info = await stat(file);
    if (!info.isFile() || info.size > 256 * 1024)
        throw new Error('Director JSON must be a regular file no larger than 256 KiB.');
    const bytes = await readFile(file);
    if (bytes.length > 256 * 1024)
        throw new Error('Director JSON exceeds 256 KiB.');
    return JSON.parse(bytes.toString('utf8'));
}
export async function prepareDirection(file: string, preferences = '') {
    if (typeof preferences !== 'string' || preferences.length > 2000)
        throw new Error('Director preferences are limited to 2000 characters.');
    const source = await readProductionInputs(file);
    let registry: Awaited<ReturnType<typeof loadAssetRegistry>> | undefined;
    if (source.config.assetRegistry) {
        registry = await loadAssetRegistry(await resolveAudio(file, source.config.assetRegistry));
        if (registry.registry.styleId !== source.config.assetStyle)
            throw new Error('Asset registry style does not match the production assetStyle.');
    }
    const assets = (registry?.registry.assets ?? []).filter(a => a.review.status === 'approved').map(a => ({ id: a.id, kind: a.kind, hasTransparency: a.hasTransparency, styleId: registry!.registry.styleId, sha256: a.sha256, description: a.review.notes ?? a.id }));
    const input = { projectId: source.config.id, title: source.config.title, palette: source.config.style ?? 'paper', durationSeconds: source.timing.durationSeconds, output: source.config.output ?? { width: 1920, height: 1080, fps: 30 }, script: source.script, words: source.timing.words, preferences, assets };
    const audioHash = createHash('sha256').update(await readFile(source.audioFile)).digest('hex');
    const sourceHash = createHash('sha256').update(JSON.stringify({ audioHash, config: source.config, script: source.script, timing: source.timing, registry: registry?.registry ?? null })).digest('hex');
    const request = { schemaVersion: 1, sourceHash, instructions: DIRECTOR_INSTRUCTIONS, input, schema: directorSchema };
    if (Buffer.byteLength(JSON.stringify(request)) > 256 * 1024)
        throw new Error('Director request exceeds 256 KiB. Reduce source or asset descriptions.');
    return { source, registry, request };
}
function toBeats(draft: DirectorDraft): BeatInput[] {
    return draft.shots.map(shot => ({ fromWord: shot.fromWord, toWord: shot.toWord, heading: shot.heading, template: shot.template, subject: shot.subject, acting: shot.acting, intent: shot.intent, transition: shot.transition,
        ...(shot.items.length ? { items: shot.items } : {}), ...(shot.visual ? { visual: { ...(shot.visual.image ? { image: shot.visual.image } : {}), ...(shot.visual.prop ? { prop: shot.visual.prop } : {}), layout: shot.visual.layout, focalPoint: [...shot.visual.focalPoint] as [
                    number,
                    number
                ] } } : {}) }));
}
export async function inspectDirection(file: string, input: unknown, preferences = '') {
    validateDirectorDraft(input);
    const draft = structuredClone(input);
    const prepared = await prepareDirection(file, preferences);
    const beats = toBeats(draft);
    const plan = planProduction({ ...prepared.source.config, defaultVisual: undefined, beats }, prepared.source.script, prepared.source.timing);
    const known = new Map((prepared.registry?.registry.assets ?? []).filter(a => a.review.status === 'approved').map(a => [a.id, a]));
    const missing = new Map(draft.missingAssets.map(a => [a.id, a]));
    for (const request of missing.values()) {
        const resolved = known.get(request.id);
        if (!resolved)
            continue;
        if (resolved.kind !== request.kind || (request.transparency && !resolved.hasTransparency))
            throw new Error(`Resolved asset ${request.id} does not meet its requested role/transparency.`);
        draft.missingAssets = draft.missingAssets.filter(a => a.id !== request.id);
        missing.delete(request.id);
        draft.shots.forEach(shot => shot.assetRequests = shot.assetRequests.filter(id => id !== request.id));
    }
    for (const shot of draft.shots) {
        for (const [role, id] of [['image', shot.visual?.image], ['prop', shot.visual?.prop]] as const) {
            if (!id)
                continue;
            const asset = known.get(id), need = missing.get(id);
            if (!asset && !need)
                throw new Error(`Shot ${shot.fromWord}: unknown asset ${id}; define a missing-asset request.`);
            if (need && !shot.assetRequests.includes(id))
                throw new Error(`Shot ${shot.fromWord}: unresolved visual ${id} must appear in assetRequests.`);
            const kind = asset?.kind ?? need!.kind;
            const transparent = asset?.hasTransparency ?? need!.transparency;
            if (role === 'image' && kind === 'prop')
                throw new Error(`Asset ${id}: environment role requires background or illustration.`);
            if (role === 'prop' && (kind !== 'prop' || !transparent))
                throw new Error(`Asset ${id}: prop role requires a transparent prop.`);
        }
    }
    // Missing assets remain an explicit blocker; no scene or placeholder is published.
    if (!draft.missingAssets.length) {
        const loaded = await loadProduction(file, beats);
        composePlan(loaded.plan, { images: loaded.assetBundle?.registry.assets.map(({ id, src, sha256, width, height }) => ({ id, src, sha256, width, height })), preparedImages: loaded.assetBundle?.images });
    }
    return { ...prepared, draft, beats, plan };
}
async function freshDirectory(directory: string) {
    const target = path.resolve(directory);
    await mkdir(path.dirname(target), { recursive: true });
    await mkdir(target);
    return target;
}
async function ensureAbsent(directory: string) {
    try {
        await access(directory);
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return;
        throw error;
    }
    throw new Error('Director output already exists. Choose a new directory.');
}
async function json(file: string, value: unknown) { await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
export async function prepareDirectionBundle(file: string, directory: string, preferences = '') {
    await ensureAbsent(directory);
    const prepared = await prepareDirection(file, preferences);
    const target = await freshDirectory(directory);
    try {
        await json(path.join(target, 'director-request.json'), prepared.request);
        await json(path.join(target, 'director-schema.json'), directorSchema);
        await writeFile(path.join(target, 'director-instructions.txt'), DIRECTOR_INSTRUCTIONS + '\n', { flag: 'wx' });
    }
    catch (error) {
        await rm(target, { recursive: true, force: true });
        throw error;
    }
    return { directory: target, sourceHash: prepared.request.sourceHash, status: 'request-prepared', providerCalled: false };
}
export interface DirectionOptions {
    preferences?: string;
    revision?: {
        draft: unknown;
        shots: number[];
    };
}
export async function directProduction(file: string, directory: string, provider: DirectorProvider, options: DirectionOptions = {}) {
    await ensureAbsent(directory);
    const prepared = await prepareDirection(file, options.preferences);
    const request = structuredClone(prepared.request);
    if (options.revision) {
        const revision = options.revision;
        await inspectDirection(file, revision.draft, options.preferences);
        validateDirectorDraft(revision.draft);
        const previous = revision.draft;
        if (!revision.shots.length || new Set(revision.shots).size !== revision.shots.length || revision.shots.some(n => !Number.isInteger(n) || n < 1 || n > previous.shots.length))
            throw new Error('Revision shots must be unique valid one-based indices.');
        Object.assign(request.input, { revision: { previousDraft: revision.draft, shotsToRevise: revision.shots, rule: 'Return the complete draft. Preserve analysis, missingAssets, reviewNotes and all unselected shots exactly. Selected shot word ranges must remain unchanged.' } });
    }
    // One provider request. No silent fallback, retries, or automatic repair charges.
    const result = await provider.generate({ instructions: request.instructions, input: request.input, schema: request.schema });
    if (options.revision) {
        validateDirectorDraft(result.draft);
        validateDirectorDraft(options.revision.draft);
        const before = options.revision.draft, after = result.draft;
        if (after.shots.length !== before.shots.length)
            throw new Error('Revision changed the shot count.');
        for (const key of ['analysis', 'missingAssets', 'reviewNotes'] as const)
            if (!isDeepStrictEqual(after[key], before[key]))
                throw new Error(`Scoped revision changed locked ${key}.`);
        before.shots.forEach((shot, i) => { if (!options.revision!.shots.includes(i + 1)) {
            if (!isDeepStrictEqual(shot, after.shots[i]))
                throw new Error(`Scoped revision changed locked shot ${i + 1}.`);
        }
        else if (shot.fromWord !== after.shots[i].fromWord || shot.toWord !== after.shots[i].toWord)
            throw new Error(`Scoped revision changed narration range for shot ${i + 1}.`); });
    }
    return applyDirection(file, directory, result.draft, { preferences: options.preferences, metadata: result.metadata, mode: 'provider', expectedSourceHash: prepared.request.sourceHash });
}
export async function applyDirection(file: string, directory: string, draft: unknown, options: {
    preferences?: string;
    metadata?: DirectorResult['metadata'];
    mode?: 'provider' | 'imported';
    expectedSourceHash?: string;
} = {}) {
    await ensureAbsent(directory);
    const checked = await inspectDirection(file, draft, options.preferences);
    if (options.expectedSourceHash && checked.request.sourceHash !== options.expectedSourceHash)
        throw new Error('Production sources changed during direction. Retry with stable inputs.');
    let target: string | undefined;
    try {
        if (checked.draft.missingAssets.length)
            target = await freshDirectory(directory);
        else {
            const production = await composeProduction(file, directory, checked.beats);
            target = production.directory;
        }
        const current = await prepareDirection(file, options.preferences);
        if (current.request.sourceHash !== checked.request.sourceHash)
            throw new Error('Production sources changed during composition. Retry with stable inputs.');
        const report = { schemaVersion: 1, status: checked.draft.missingAssets.length ? 'needs-assets' : 'ready-for-preview', humanReviewRequired: true, sourceHash: checked.request.sourceHash, mode: options.mode ?? 'imported', provider: options.metadata ?? null, shotCount: checked.draft.shots.length, missingAssets: checked.draft.missingAssets.map(a => a.id), reviewNotes: checked.draft.reviewNotes, limits: ['Technical validation is not artistic or factual approval.', 'No image-generation or speech-alignment provider is invoked.', 'Cut and short fade are supported; no camera, physical contact or lip-sync execution.'] };
        await json(path.join(target, 'director-draft.json'), checked.draft);
        await json(path.join(target, 'director-request.json'), checked.request);
        await json(path.join(target, 'director-report.json'), report);
        await json(path.join(target, 'asset-needs.json'), checked.draft.missingAssets);
        return { directory: target, ...report };
    }
    catch (error) {
        if (target)
            await rm(target, { recursive: true, force: true });
        throw error;
    }
}
