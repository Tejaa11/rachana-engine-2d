/** Refresh selected public gallery artifacts from actual verified CLI productions. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createSurface, drawFrame } from '../dist/packages/renderer/src/draw.js';
import { evaluateScene } from '../dist/packages/core/src/evaluate.js';
import { loadScene } from '../dist/packages/renderer/src/files.js';

const inputRoot=path.resolve(process.argv[2]??'renders/public-gallery');
const suffix=process.argv[3]??'';
const output=path.resolve('showcase/generated');
const entries=[];
await mkdir(output,{recursive:true});
for(const id of ['learning-habit','team-flow','seed-story']) {
  const folder=path.join(inputRoot,id+suffix);
  const plan=JSON.parse(await readFile(path.join(folder,'plan.json'),'utf8'));
  const report=JSON.parse(await readFile(path.join(folder,'quality-report.json'),'utf8'));
  const verification=JSON.parse(await readFile(path.join(folder,'film.mp4.verification.json'),'utf8'));
  const movie=await readFile(path.join(folder,'film.mp4'));
  const hash=createHash('sha256').update(movie).digest('hex');
  if(plan.id!==id||report.projectId!==id||verification.sceneId!==id||verification.fullDecode!=='passed'||verification.sha256!==hash)throw new Error(`Unverified or mismatched gallery input: ${id}`);
  const brief=JSON.parse(await readFile(`examples/${id}/production.json`,'utf8'));
  if(brief.beats||plan.planningMode!=='local-rules')throw new Error('This gallery demonstrates shared defaults without editorial beats.');
  const scene=await loadScene(path.join(folder,'scene.json'));
  const frame=createSurface(scene.output.width,scene.output.height);
  const storyboard=createSurface(1280,Math.ceil(plan.shots.length/2)*360);
  const ctx=storyboard.getContext('2d');
  for(let i=0;i<plan.shots.length;i++) {
    const shot=plan.shots[i];
    drawFrame(frame,evaluateScene(scene,Math.max(shot.start+.5,shot.end-.6)));
    ctx.drawImage(frame,(i%2)*640,Math.floor(i/2)*360,640,360);
    if(i===0) {
      const preview=createSurface(1280,720);
      preview.getContext('2d').drawImage(frame,0,0,1280,720);
      await writeFile(path.join(output,`${id}.png`),preview.toBuffer('image/png'));
    }
  }
  await writeFile(path.join(output,`${id}-storyboard.png`),storyboard.toBuffer('image/png'));
  await copyFile(path.join(folder,'film.mp4'),path.join(output,`${id}.mp4`));
  await copyFile(path.join(folder,'film.mp4.manifest.json'),path.join(output,`${id}.mp4.manifest.json`));
  await copyFile(path.join(folder,'film.mp4.verification.json'),path.join(output,`${id}.mp4.verification.json`));
  await copyFile(path.join(folder,'quality-report.json'),path.join(output,`${id}.quality-report.json`));
  entries.push({id,title:plan.title,source:`examples/${id}/production.json`,planningMode:plan.planningMode,style:plan.style,shots:plan.shots.length,templates:report.templates,sha256:hash,frames:verification.frames,durationSeconds:verification.reportedDurationSeconds});
}
await writeFile(path.join(output,'index.json'),JSON.stringify({schemaVersion:1,engineVersion:JSON.parse(await readFile('package.json','utf8')).version,method:'Same local planner and templates; no per-topic scene builder or editorial beats.',entries},null,2)+'\n');
console.log(JSON.stringify(entries.map(({id,shots,frames})=>({id,shots,frames})),null,2));
