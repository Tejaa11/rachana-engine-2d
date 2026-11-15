/** Package selected public output from the real image-backed production workflow. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createSurface,drawFrame} from '../dist/packages/renderer/src/draw.js';
import {prepareSceneImages} from '../dist/packages/renderer/src/images.js';
import {loadScene} from '../dist/packages/renderer/src/files.js';
import {evaluateScene,frameCount} from '../dist/packages/core/src/evaluate.js';

const input=path.resolve(process.argv[2]??'renders/lantern-workshop-release');
const output=path.resolve('showcase/lantern-workshop');
const movie=await readFile(path.join(input,'film.mp4'));
const verification=JSON.parse(await readFile(path.join(input,'film.mp4.verification.json'),'utf8'));
const plan=JSON.parse(await readFile(path.join(input,'plan.json'),'utf8'));
const scene=await loadScene(path.join(input,'scene.json'));
const sha256=createHash('sha256').update(movie).digest('hex');
if(verification.fullDecode!=='passed'||verification.sha256!==sha256||verification.frames!==frameCount(scene)||scene.id!=='lantern-workshop'||plan.id!==scene.id)throw new Error('A matching fully verified Lantern Workshop production is required.');
const images=await prepareSceneImages(scene,path.join(input,'scene.json'));
const frame=createSurface(scene.output.width,scene.output.height);
const preview=createSurface(1280,720);
const storyboard=createSurface(1920,Math.ceil(plan.shots.length/3)*360);
for(let i=0;i<plan.shots.length;i++){
  const shot=plan.shots[i];
  drawFrame(frame,evaluateScene(scene,shot.end-.8),images);
  storyboard.getContext('2d').drawImage(frame,(i%3)*640,Math.floor(i/3)*360,640,360);
  if(i===0)preview.getContext('2d').drawImage(frame,0,0,1280,720);
}
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'preview.png'),preview.toBuffer('image/png'));
await writeFile(path.join(output,'storyboard.png'),storyboard.toBuffer('image/png'));
for(const name of ['film.mp4','film.mp4.manifest.json','film.mp4.verification.json','quality-report.json','plan.json'])await copyFile(path.join(input,name),path.join(output,name));
await writeFile(path.join(output,'index.json'),JSON.stringify({schemaVersion:1,engineVersion:JSON.parse(await readFile('package.json','utf8')).version,source:'examples/lantern-workshop/production.json',method:'Nine authored beats, saved generated development artwork, reusable composition and shared image renderer. No live director/generation provider.',sha256,frames:verification.frames,durationSeconds:verification.reportedDurationSeconds,imageAssets:scene.images?.map(({id,sha256})=>({id,sha256}))},null,2)+'\n');
console.log(JSON.stringify({output,frames:verification.frames,durationSeconds:verification.reportedDurationSeconds,imageAssets:images.size}));
