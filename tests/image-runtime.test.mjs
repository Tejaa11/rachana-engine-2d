import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createSurface, drawFrame } from '../dist/packages/renderer/src/draw.js';
import { prepareSceneImages } from '../dist/packages/renderer/src/images.js';
import { inspectFFmpeg, renderVideo } from '../dist/packages/renderer/src/export.js';
import { evaluateScene } from '../dist/packages/core/src/evaluate.js';
import { validateScene } from '../dist/packages/core/src/validate.js';

const ffmpeg=inspectFFmpeg();
const encoding={skip:ffmpeg.available?false:'FFmpeg not installed; CI supplies it.'};
function scene(asset,layer={}) {
  return {schemaVersion:1,id:'image-fixture',output:{width:64,height:64,fps:30,durationSeconds:.2},background:'#ffffff',images:[asset],layers:[{id:'picture',type:'image',asset:asset.id,position:[8,8],size:[40,40],...layer}]};
}
async function fixture(t,transparent=false) {
  const root=await mkdtemp(path.join(os.tmpdir(),'rachana-image-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const canvas=createSurface(4,2),ctx=canvas.getContext('2d');
  ctx.fillStyle=transparent?'#ff000080':'#ff0000';ctx.fillRect(0,0,2,2);
  if(!transparent){ctx.fillStyle='#0000ff';ctx.fillRect(2,0,2,2);}
  const bytes=canvas.toBuffer('image/png');
  await writeFile(path.join(root,'picture.png'),bytes);
  const asset={id:'fixture-art',src:'picture.png',sha256:createHash('sha256').update(bytes).digest('hex'),width:4,height:2};
  return {root,asset,bytes,sceneFile:path.join(root,'scene.json')};
}
function pixel(canvas,x,y) {return [...canvas.getContext('2d').getImageData(x,y,1,1).data];}
function close(actual,expected,tolerance=2) {for(let i=0;i<expected.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=tolerance,`${actual} differs from ${expected}`);}
async function drawn(value,file) {
  const images=await prepareSceneImages(value,file),canvas=createSurface(value.output.width,value.output.height);
  drawFrame(canvas,evaluateScene(value,0),images);
  return canvas;
}

test('image references validate by ID, hash, dimensions, safe path and bounded scene budget',()=>{
  const asset={id:'art',src:'art.png',sha256:'a'.repeat(64),width:4,height:2};
  assert.equal(validateScene(scene(asset)).valid,true);
  const duplicate=scene(asset);duplicate.images.push({...asset});
  assert.ok(validateScene(duplicate).errors.some(e=>e.message.includes('Duplicate image asset')));
  const missing=scene(asset,{asset:'unknown'});
  assert.ok(validateScene(missing).errors.some(e=>e.message.includes('Unknown image asset')));
  for(const update of [{src:'../art.png'},{src:'/art.png'},{src:'https://example.test/art.png'},{src:'art\\file.png'},{sha256:'g'.repeat(64)},{sha256:'A'.repeat(64)},{width:4097},{height:0}])assert.equal(validateScene(scene({...asset,...update})).valid,false);
  for(const layer of [{fit:'stretch'},{focalPoint:[-1,.5]},{focalPoint:[.5,2]},{focalPoint:[.5]},{size:[0,40]}])assert.equal(validateScene(scene(asset,layer)).valid,false);
  const tooMany=scene(asset);tooMany.images=Array.from({length:33},(_,i)=>({...asset,id:`art-${i}`}));tooMany.layers=[];
  assert.equal(validateScene(tooMany).valid,false);
  const tooLarge=scene(asset);tooLarge.images=Array.from({length:3},(_,i)=>({...asset,id:`art-${i}`,width:4096,height:4096}));tooLarge.layers=[];
  assert.ok(validateScene(tooLarge).errors.some(e=>e.message.includes('total decoded pixel')));
});

test('contain preserves aspect ratio with transparent letterboxing and no painted overflow',async t=>{
  const {asset,sceneFile}=await fixture(t),canvas=await drawn(scene(asset),sceneFile);
  close(pixel(canvas,28,11),[255,255,255,255]);
  close(pixel(canvas,16,25),[255,0,0,255]);
  close(pixel(canvas,40,25),[0,0,255,255]);
  close(pixel(canvas,49,25),[255,255,255,255]);
});

test('cover crops around the supplied focal point and clips to the exact viewport',async t=>{
  const {asset,sceneFile}=await fixture(t);
  const left=await drawn(scene(asset,{fit:'cover',focalPoint:[0,.5]}),sceneFile);
  const right=await drawn(scene(asset,{fit:'cover',focalPoint:[1,.5]}),sceneFile);
  close(pixel(left,20,25),[255,0,0,255]);
  close(pixel(right,36,25),[0,0,255,255]);
  close(pixel(left,7,25),[255,255,255,255]);
  close(pixel(right,49,25),[255,255,255,255]);
});

test('PNG transparency and nested group opacity blend through the same draw path',async t=>{
  const {asset,sceneFile}=await fixture(t,true),value=scene(asset,{fit:'cover',opacity:.5,focalPoint:[0,.5]});
  value.background='#0000ff';
  value.layers=[{id:'parent',type:'group',position:[0,0],opacity:.5,children:value.layers}];
  const canvas=await drawn(value,sceneFile);
  close(pixel(canvas,18,25),[32,0,223,255]);
});

test('image viewports follow nested transforms and preserve neighboring layer drawing',async t=>{
  const {asset,sceneFile}=await fixture(t),value=scene(asset,{position:[0,0],size:[16,16]});
  value.layers=[{id:'rotated',type:'group',position:[40,8],rotation:90,children:value.layers},{id:'neighbor',type:'rect',position:[44,8],size:[8,8],fill:'#00ff00'}];
  const canvas=await drawn(value,sceneFile);
  close(pixel(canvas,32,12),[255,0,0,255]);
  close(pixel(canvas,32,20),[0,0,255,255]);
  close(pixel(canvas,42,12),[255,255,255,255]);
  close(pixel(canvas,47,12),[0,255,0,255]);
});

test('direct seeking detaches image arrays and never mutates authored image layers',()=>{
  const asset={id:'art',src:'art.png',sha256:'a'.repeat(64),width:4,height:2};
  const value=scene(asset,{focalPoint:[.2,.8],clips:[{property:'rotation',start:0,duration:.2,from:0,to:90}]});
  const before=JSON.stringify(value),first=evaluateScene(value,.1);
  first.layers[0].size[0]=999;first.layers[0].focalPoint[0]=1;first.layers[0].position[0]=999;
  assert.equal(JSON.stringify(value),before);
  assert.equal(evaluateScene(value,.1).layers[0].rotation,45);
  assert.deepEqual(evaluateScene(value,.1).layers[0].size,[40,40]);
});

test('drawing requires prepared images and restores transforms after a missing-image error',async t=>{
  const {asset}=await fixture(t),value=scene(asset),canvas=createSurface(64,64);
  assert.throws(()=>drawFrame(canvas,evaluateScene(value,0)),/has not been prepared/);
  const transform=canvas.getContext('2d').getTransform();
  assert.deepEqual([transform.a,transform.b,transform.c,transform.d,transform.e,transform.f],[1,0,0,1,0,0]);
});

test('preload rejects changed bytes, wrong dimensions and missing files before any render output',async t=>{
  const {root,asset,sceneFile}=await fixture(t);
  await assert.rejects(prepareSceneImages(scene({...asset,sha256:'0'.repeat(64)}),sceneFile),/content hash differs/);
  await assert.rejects(prepareSceneImages(scene({...asset,width:5}),sceneFile),/dimensions differ/);
  await assert.rejects(prepareSceneImages(scene({...asset,src:'missing.png'}),sceneFile),{code:'ENOENT'});
  const unknown=scene(asset,{asset:'missing'});
  await assert.rejects(prepareSceneImages(unknown,sceneFile),/Unknown image asset/);
  // Hidden assets are still checked: absence cannot silently pass the film preflight.
  await assert.rejects(prepareSceneImages(scene({...asset,src:'missing.png'},{opacity:0}),sceneFile),{code:'ENOENT'});
  assert.deepEqual(await readdir(root),['picture.png']);
});

test('image preload refuses symlink escapes and accepts a contained reference',async t=>{
  const {root,asset,bytes,sceneFile}=await fixture(t);
  const outside=await mkdtemp(path.join(os.tmpdir(),'rachana-outside-image-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  await writeFile(path.join(outside,'outside.png'),bytes);
  try{await symlink(path.join(outside,'outside.png'),path.join(root,'escape.png'));await symlink(path.join(root,'picture.png'),path.join(root,'inside.png'));}
  catch(error){if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Symlink privileges unavailable');return;}throw error;}
  await assert.rejects(prepareSceneImages(scene({...asset,src:'escape.png'}),sceneFile),/symlink escapes/);
  assert.equal((await prepareSceneImages(scene({...asset,src:'inside.png'}),sceneFile)).size,1);
});

test('multiple asset IDs reuse exact bytes without losing reference identity',async t=>{
  const {asset,sceneFile}=await fixture(t),value=scene(asset);
  value.images.push({...asset,id:'second'});
  const images=await prepareSceneImages(value,sceneFile);
  assert.equal(images.size,2);assert.equal(images.get(asset.id),images.get('second'));
});

test('image scenes encode and decode with pinned asset hashes in their manifest',encoding,async t=>{
  const {root,asset,sceneFile}=await fixture(t),output=path.join(root,'film.mp4');
  const result=await renderVideo(scene(asset),sceneFile,output);
  assert.deepEqual(result.imageAssets,[{id:asset.id,sha256:asset.sha256,width:4,height:2}]);
  const disk=JSON.parse(await readFile(output+'.manifest.json','utf8'));
  assert.deepEqual(disk.imageAssets,result.imageAssets);
  const decoded=spawnSync(ffmpeg.binary,['-v','error','-i',output,'-map','0:v:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{encoding:null});
  assert.equal(decoded.status,0,decoded.stderr.toString());
  const at=(25*64+16)*4;
  close([...decoded.stdout.subarray(at,at+4)],[255,0,0,255],8);
});

test('an invalid image fails export before encoder files or output directories are created',encoding,async t=>{
  const {root,asset,sceneFile}=await fixture(t);
  await assert.rejects(renderVideo(scene({...asset,sha256:'0'.repeat(64)}),sceneFile,path.join(root,'output','bad.mp4')),/content hash differs/);
  assert.deepEqual(await readdir(root),['picture.png']);
});
