#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { evaluateScene, frameCount } from '../../../packages/core/src/evaluate.js';
import { loadScene, resolveAudio, inspectWav } from '../../../packages/renderer/src/files.js';
import { createSurface, drawFrame, registerFonts } from '../../../packages/renderer/src/draw.js';
import { inspectFFmpeg, renderVideo } from '../../../packages/renderer/src/export.js';
import { prepareSceneImages } from '../../../packages/renderer/src/images.js';
import { inspectPng, loadAssetRegistry, buildAssetRegistry } from '../../../packages/assets/src/index.js';
import { composeProduction } from '../../../packages/director/src/project.js';

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}

async function main(): Promise<void> {
  const [command, file, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log('Rachana Engine 2D\n\n  doctor\n  validate <scene.json>\n  frame <scene.json> --frame <index> --out <image.png>\n  render <scene.json> --out <video.mp4>\n  compose <production.json> --out <new-directory>\n  produce <production.json> --out <new-directory>\n  assets inspect <image.png>\n  assets validate <asset-registry.json>\n  assets register <asset-request.json> --out <new-registry.json>\n\nCompose writes an editable plan/scene and preview report. Produce also renders film.mp4.\nOutputs are never overwritten. FFMPEG_PATH may select a local FFmpeg executable.');
    return;
  }
  if(command==='assets') {
    const target=rest[0];
    if(!target)throw new Error('Use assets inspect <image.png>, assets validate <registry.json>, or assets register <request.json> --out <new-registry.json>.');
    if(file==='inspect'&&rest.length===1) {
      const {image,...inspection}=await inspectPng(target);
      console.log(JSON.stringify({format:'png',...inspection},null,2));return;
    }
    if(file==='validate'&&rest.length===1) {
      const {registry}=await loadAssetRegistry(target);
      console.log(JSON.stringify({valid:true,styleId:registry.styleId,assets:registry.assets.map(({id,kind,review,sha256})=>({id,kind,review,sha256}))},null,2));return;
    }
    if(file==='register'&&rest.length===3&&rest[1]==='--out') {
      const output=option(rest.slice(1),'--out')!;
      const registry=await buildAssetRegistry(target,output);
      console.log(JSON.stringify({output,styleId:registry.styleId,assets:registry.assets.length},null,2));return;
    }
    throw new Error('Unknown assets action or options. Inspect/validate take one file; register takes a request file and --out.');
  }
  if(command==='compose'||command==='produce') {
    if(!file||rest.length!==2||rest[0]!=='--out')throw new Error('Use compose/produce <production.json> --out <new-directory>.');
    const output=option(rest,'--out');
    if(!output)throw new Error('--out is required.');
    if(command==='produce'&&!inspectFFmpeg().available)throw new Error('FFmpeg is missing. Run doctor before producing a film.');
    const result=await composeProduction(file,output);
    if(command==='produce') {
      const scene=await loadScene(result.sceneFile);
      await renderVideo(scene,result.sceneFile,path.join(result.directory,'film.mp4'));
    }
    console.log(JSON.stringify({directory:result.directory,report:result.report,rendered:command==='produce'},null,2));
    return;
  }
  if (command === 'doctor') {
    const ffmpeg = inspectFFmpeg();
    let fonts = true;
    let fontError = '';
    try { registerFonts(); } catch (error) { fonts = false; fontError = String(error); }
    console.log(JSON.stringify({ node: process.version, canvas: 'loaded', fonts: fonts ? 'bundled fonts registered' : fontError, ffmpeg,
      speechAlignment: 'Not implemented. Supply reviewed or synthesis-event anchors.', remoteProviders: 'Not required or configured.' }, null, 2));
    if (!fonts || !ffmpeg.available) process.exitCode = 1;
    return;
  }
  if (!['validate', 'frame', 'render'].includes(command)) throw new Error(`Unknown command: ${command}`);
  if (!file || file.startsWith('--')) throw new Error('A scene JSON path is required.');
  const allowed = command === 'frame' ? ['--frame', '--out'] : command === 'render' ? ['--out'] : [];
  for (let i = 0; i < rest.length; i += 2) if (!allowed.includes(rest[i])) throw new Error(`Unknown option: ${rest[i]}`);
  const scene = await loadScene(file);
  if (scene.audio) {
    const audio = await inspectWav(await resolveAudio(file, scene.audio.src));
    if (Math.abs(audio.durationSeconds - scene.output.durationSeconds) > 1 / scene.output.fps) throw new Error('Narration and scene durations differ by more than one frame.');
  }
  const images=command==='render'?undefined:await prepareSceneImages(scene,file);
  if (command === 'validate') {
    console.log(JSON.stringify({ valid: true, sceneId: scene.id, layers: scene.layers.length, frames: frameCount(scene), timingSource: scene.narration?.timingSource ?? null,images:images?.size??0 }, null, 2));
    return;
  }
  const output = option(rest, '--out');
  if (!output) throw new Error('--out is required.');
  if (command === 'render') { console.log(JSON.stringify(await renderVideo(scene, file, output), null, 2)); return; }
  if (!output.endsWith('.png')) throw new Error('Frame output must end in .png.');
  const number = Number(option(rest, '--frame') ?? '0');
  if (!Number.isInteger(number) || number < 0 || number >= frameCount(scene)) throw new Error('Frame index is outside the output range.');
  const canvas = createSurface(scene.output.width, scene.output.height);
  drawFrame(canvas, evaluateScene(scene, number / scene.output.fps),images);
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, canvas.toBuffer('image/png'), { flag: 'wx' });
  console.log(JSON.stringify({ output, frame: number, timeSeconds: number / scene.output.fps }));
}

main().catch(error => { console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });
