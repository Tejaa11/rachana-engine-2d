import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createCanvas} from '@napi-rs/canvas';
import {inspectPng} from '../dist/packages/assets/src/index.js';
import {loadProduction,composeProduction,validateProductionConfig} from '../dist/packages/director/src/project.js';
import {composePlan} from '../dist/packages/director/src/compose.js';
import {prepareSceneImages} from '../dist/packages/renderer/src/images.js';
import {createSurface,drawFrame} from '../dist/packages/renderer/src/draw.js';
import {evaluateScene} from '../dist/packages/core/src/evaluate.js';

const cli=new URL('../dist/apps/cli/src/main.js',import.meta.url).pathname;
async function fixture(t){
  const dir=await mkdtemp(path.join(os.tmpdir(),'rachana-art-project-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=path.join(dir,'source');await cp(new URL('../examples/learning-habit/',import.meta.url),source,{recursive:true});
  const canvas=createCanvas(40,20),ctx=canvas.getContext('2d');ctx.fillStyle='#336655';ctx.fillRect(0,0,40,20);
  await writeFile(path.join(source,'setting.png'),canvas.toBuffer('image/png'));
  ctx.clearRect(0,0,40,20);ctx.fillStyle='#ed9672';ctx.fillRect(10,5,20,10);
  await writeFile(path.join(source,'prop.png'),canvas.toBuffer('image/png'));
  const records=[];
  for(const [id,kind,src]of [['setting','background','setting.png'],['prop','prop','prop.png']]){
    const {image,bytes,...info}=await inspectPng(path.join(source,src));
    records.push({id,kind,src,...info,provenance:{kind:'procedural',creator:'Test fixture',source:'Original Canvas pixels',usage:'Fixture only'},review:{status:'approved'}});
  }
  const registry={schemaVersion:1,styleId:'test-paper',assets:records};
  const file=path.join(source,'production.json'),registryFile=path.join(source,'registry.json');
  const config={...JSON.parse(await readFile(file,'utf8')),assetRegistry:'registry.json',assetStyle:'test-paper',defaultVisual:{image:'setting',prop:'prop',layout:'left'}};
  await writeFile(file,JSON.stringify(config));await writeFile(registryFile,JSON.stringify(registry));
  return{dir,source,file,registryFile,config,registry};
}

test('shared composer uses registered art and writes a portable asset snapshot',async t=>{
  const{dir,file,source}=await fixture(t),out=path.join(dir,'film');
  const result=await composeProduction(file,out);
  assert.equal(result.report.imageAssetCount,2);assert.ok(result.report.imageShots.length>=3);
  assert.deepEqual(result.report.genericMotifShots,[]);
  const scene=JSON.parse(await readFile(result.sceneFile,'utf8'));
  assert.equal(scene.images.length,2);assert.ok(scene.images.every(a=>/^assets\/[a-f0-9]{64}\.png$/.test(a.src)));
  const stored=JSON.parse(await readFile(path.join(out,'asset-registry.json'),'utf8'));
  assert.equal(stored.styleId,'test-paper');assert.equal(stored.assets[0].provenance.creator,'Test fixture');
  const second=await loadProduction(path.join(out,'production.json'));
  assert.deepEqual(second.plan,result.plan);
  await rm(source,{recursive:true}); // Rendering the bundle must not depend on its original folder.
  const prepared=await prepareSceneImages(scene,result.sceneFile);
  const canvas=createSurface(scene.output.width,scene.output.height);
  drawFrame(canvas,evaluateScene(scene,2),prepared);
  const pixel=canvas.getContext('2d').getImageData(1850,400,1,1).data;
  assert.deepEqual([...pixel],[51,102,85,255]);
});

test('left, right and full art layouts fit all palettes and supported resolutions',async t=>{
  const{file}=await fixture(t),loaded=await loadProduction(file);
  for(const style of ['paper','ocean','midnight'])for(const[width,height]of [[1280,720],[1920,1080]]){
    const plan=structuredClone(loaded.plan);plan.style=style;plan.output.width=width;plan.output.height=height;
    plan.shots.forEach((shot,i)=>shot.visual.layout=['left','right','full'][i%3]);
    const refs=loaded.assetBundle.registry.assets.map(({id,src,sha256,width,height})=>({id,src,sha256,width,height}));
    const {scene}=composePlan(plan,{images:refs,preparedImages:loaded.assetBundle.images});
    const canvas=createSurface(width,height);
    for(const shot of plan.shots)drawFrame(canvas,evaluateScene(scene,(shot.start+shot.end)/2),loaded.assetBundle.images);
  }
});

test('missing, draft, rejected, wrong-role and style-mismatched artwork fails before output',async t=>{
  const{dir,file,registryFile,config,registry}=await fixture(t);
  const variants=[
    [{...config,defaultVisual:{image:'missing'}},registry,/Unknown required asset/],
    [config,{...registry,assets:registry.assets.map(a=>({...a,review:{status:'draft'}}))},/draft/],
    [config,{...registry,assets:registry.assets.map(a=>({...a,review:{status:'rejected'}}))},/rejected/],
    [{...config,assetStyle:'different-style'},registry,/style/],
    [{...config,defaultVisual:{prop:'setting'}},registry,/props must/],
    [{...config,defaultVisual:{image:'prop'}},registry,/background or illustration/],
  ];
  for(let i=0;i<variants.length;i++){
    const[c,r,error]=variants[i];await writeFile(file,JSON.stringify(c));await writeFile(registryFile,JSON.stringify(r));
    await assert.rejects(composeProduction(file,path.join(dir,`bad-${i}`)),error);
  }
  assert.deepEqual(await readdir(dir),['source']);
});

test('image roles need registry/style and reject unused or malformed visual instructions',async t=>{
  const{file,config}=await fixture(t);
  for(const value of [{...config,assetRegistry:undefined},{...config,assetStyle:undefined},{...config,defaultVisual:{}},{...config,defaultVisual:{image:'setting',focalPoint:[1.1,0]}}])assert.throws(()=>validateProductionConfig(value));
  const base={...config,assetRegistry:undefined,assetStyle:undefined};await writeFile(file,JSON.stringify(base));
  await assert.rejects(loadProduction(file),/requires a local assetRegistry/);
});

test('scene validate/frame commands inspect pinned images and preserve existing output',async t=>{
  const{dir,file}=await fixture(t),result=await composeProduction(file,path.join(dir,'bundle'));
  const validate=spawnSync(process.execPath,[cli,'validate',result.sceneFile],{encoding:'utf8'});
  assert.equal(validate.status,0,validate.stderr);assert.equal(JSON.parse(validate.stdout).images,2);
  const frame=path.join(dir,'frame.png');
  const rendered=spawnSync(process.execPath,[cli,'frame',result.sceneFile,'--frame','60','--out',frame],{encoding:'utf8'});
  assert.equal(rendered.status,0,rendered.stderr);
  const snapshot=await readFile(frame);
  const repeated=spawnSync(process.execPath,[cli,'frame',result.sceneFile,'--frame','60','--out',frame],{encoding:'utf8'});
  assert.notEqual(repeated.status,0);assert.deepEqual(await readFile(frame),snapshot);
  const scene=JSON.parse(await readFile(result.sceneFile,'utf8'));
  await writeFile(path.join(result.directory,scene.images[0].src),'broken');
  const invalid=spawnSync(process.execPath,[cli,'validate',result.sceneFile],{encoding:'utf8'});
  assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/PNG/);
});
