import { readFile, writeFile, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv } from 'ajv';
import { createHash } from 'node:crypto';
import { resolveAudio, inspectWav } from '../../renderer/src/files.js';
import { planProduction, type ProductionConfig, type Timing } from './plan.js';
import { composePlan } from './compose.js';
import { loadAssetRegistry, type AssetRegistry } from '../../assets/src/index.js';
import type { ImageAssetRef } from '../../core/src/types.js';
import type { PreparedImages } from '../../renderer/src/images.js';
const schema = JSON.parse(readFileSync(new URL('../../../../schemas/production.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true, strict: true, strictNumbers: true }).compile<ProductionConfig>(schema);
export function validateProductionConfig(input: unknown): asserts input is ProductionConfig {
    if (!validate(input))
        throw new Error((validate.errors ?? []).map(issue => `${issue.instancePath || '/'} ${issue.message}`).join('\n'));
    if (!input.title.trim() || input.beats?.some(beat => !beat.heading.trim() || beat.items?.some(item => !item.trim())))
        throw new Error('Titles, headings and item labels must contain visible text.');
    if((input.assetRegistry&&!input.assetStyle)||(!input.assetRegistry&&input.assetStyle))throw new Error('assetRegistry and assetStyle must be supplied together.');
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
    const selected=new Set(plan.shots.flatMap(shot=>[shot.visual?.image,shot.visual?.prop].filter((id):id is string=>!!id)));
    if(selected.size&&!input.assetRegistry)throw new Error('Visual artwork requires a local assetRegistry and matching assetStyle.');
    let assetBundle:{registry:AssetRegistry;files:ReadonlyMap<string,string>;images:PreparedImages}|undefined;
    if(input.assetRegistry) {
        const registryFile=await resolveAudio(file,input.assetRegistry);
        const loaded=await loadAssetRegistry(registryFile);
        if(loaded.registry.styleId!==input.assetStyle)throw new Error('Asset registry style does not match the production assetStyle.');
        const records=selected.size?loaded.registry.assets.filter(asset=>selected.has(asset.id)):[];
        for(const id of selected) {
            const asset=records.find(asset=>asset.id===id);
            if(!asset)throw new Error(`Unknown required asset: ${id}. Supply artwork rather than substituting a placeholder.`);
            if(asset.review.status!=='approved')throw new Error(`Required asset ${id} is ${asset.review.status}; select an approved asset.`);
        }
        for(const shot of plan.shots) {
            if(shot.visual?.image&&records.find(a=>a.id===shot.visual!.image)?.kind==='prop')throw new Error(`Shot ${shot.id}: an environment image needs a background or illustration asset.`);
            if(shot.visual?.prop) {
                const prop=records.find(a=>a.id===shot.visual!.prop)!;
                if(prop.kind!=='prop'||!prop.hasTransparency)throw new Error(`Shot ${shot.id}: props must be prop assets with measured transparency.`);
            }
        }
        assetBundle={registry:{...loaded.registry,assets:records.map(asset=>({...asset,src:`assets/${asset.sha256}.png`}))},files:loaded.files,images:loaded.images};
    }
    return { config: input, script, scriptBytes, timing, timingBytes, audioFile, audio, plan, assetBundle };
}
/** Publish a new local production folder; never overwrite an existing project. */
export async function composeProduction(file: string, directory: string) {
    const loaded = await loadProduction(file);
    const imageRefs:ImageAssetRef[]=loaded.assetBundle?.registry.assets.map(({id,src,sha256,width,height})=>({id,src,sha256,width,height}))??[];
    const composed = composePlan(loaded.plan,{images:imageRefs,preparedImages:loaded.assetBundle?.images});
    const scene = composed.scene;
    const report = { ...composed.report, audio: loaded.audio,...(loaded.assetBundle?{assetStyle:loaded.assetBundle.registry.styleId,assetReferences:loaded.assetBundle.registry.assets.map(({id,sha256,kind,provenance})=>({id,sha256,kind,origin:provenance.kind}))}:{}) };
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
            'production.json': { ...loaded.config,...(loaded.assetBundle?{assetRegistry:'asset-registry.json'}:{}), script: 'script.txt', audio: 'voice.wav', timing: 'timing.json' },
            ...(loaded.assetBundle?{'asset-registry.json':loaded.assetBundle.registry}:{}),
        };
        for (const [name, value] of Object.entries(artifacts))
            await writeFile(path.join(target, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
        await writeFile(path.join(target, 'script.txt'), loaded.scriptBytes, { flag: 'wx' });
        await copyFile(loaded.audioFile, path.join(target, 'voice.wav'));
        if(loaded.assetBundle?.registry.assets.length) {
            await mkdir(path.join(target,'assets'));
            const written=new Set<string>();
            for(const asset of loaded.assetBundle.registry.assets) {
                if(written.has(asset.sha256))continue;
                const bytes=await bounded(loaded.assetBundle.files.get(asset.id)!,12*1024*1024);
                if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error(`Asset ${asset.id} changed while composing; retry with stable inputs.`);
                await writeFile(path.join(target,asset.src),bytes,{flag:'wx'});
                written.add(asset.sha256);
            }
        }
        return { directory: target, sceneFile: path.join(target, 'scene.json'), plan: loaded.plan, report };
    }
    catch (error) {
        await rm(target, { recursive: true, force: true });
        throw error;
    }
}
