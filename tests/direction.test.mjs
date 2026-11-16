import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCanvas} from '@napi-rs/canvas';
import {inspectPng} from '../dist/packages/assets/src/index.js';
import {prepareDirection,prepareDirectionBundle,inspectDirection,applyDirection,directProduction} from '../dist/packages/director/src/direction.js';
import {planProduction} from '../dist/packages/director/src/plan.js';
import {loadProduction} from '../dist/packages/director/src/project.js';
import {evaluateScene} from '../dist/packages/core/src/evaluate.js';

async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'rachana-direction-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source');await cp(new URL('../examples/learning-habit/',import.meta.url),source,{recursive:true});
  const file=path.join(source,'production.json');
  const prepared=await prepareDirection(file,'Make the progression clear.');
  const local=planProduction(prepared.source.config,prepared.source.script,prepared.source.timing);
  // Deliberately authored fixture returned by mocked providers; not a live AI result.
  const draft={schemaVersion:1,analysis:{premise:'Choose a small useful learning habit.',audience:'Curious creators',arc:'A focused start, practice, review, and the next session.',visualStrategy:'Alternate Mira poses and functional comparison cards.'},shots:local.shots.map(shot=>({fromWord:shot.fromWord,toWord:shot.toWord,heading:shot.heading,template:shot.template,subject:shot.subject,acting:shot.template==='closing'?'celebrate':'explain',intent:'Clarify this narration beat.',transition:'cut',items:shot.items,visual:null,assetRequests:[]})),missingAssets:[],reviewNotes:['Authored offline transport fixture; review the actual film.']};
  return{root,source,file,draft,prepared};
}
function provider(draft,callback=()=>{}){return{name:'mock',generate:async request=>{await callback(request);return{draft:structuredClone(draft),metadata:{provider:'mock',model:'fixture-only',inputTokens:1,outputTokens:1,totalTokens:2}};}};}
function requestArt(draft){
  const copy=structuredClone(draft);
  copy.shots[0]={...copy.shots[0],template:'illustration',items:[],visual:{image:'study-room',prop:null,layout:'left',focalPoint:[.5,.5]},assetRequests:['study-room']};
  copy.missingAssets=[{id:'study-room',kind:'background',description:'A quiet study room.',prompt:'Original wordless paper-cut study room with open space for text.',transparency:false}];return copy;
}

test('prepared request has no audio/image bytes, keys, file paths or authored beat hints',async t=>{
  const{root,file,prepared}=await fixture(t);
  assert.match(prepared.request.sourceHash,/^[a-f0-9]{64}$/);
  const raw=JSON.stringify(prepared.request);
  assert.ok(!raw.includes(root));assert.ok(!raw.includes('voice.wav'));assert.ok(!raw.includes('base64'));assert.ok(!raw.includes('OPENAI_API_KEY'));
  assert.equal(prepared.request.input.assets.length,0);
  assert.equal('beats' in prepared.request.input,false);
  const result=await prepareDirectionBundle(file,path.join(root,'request'));
  assert.equal(result.providerCalled,false);
  assert.deepEqual((await readdir(result.directory)).sort(),['director-instructions.txt','director-request.json','director-schema.json']);
});

test('provider draft compiles to the existing composer with traceable output',async t=>{
  const{root,file,draft}=await fixture(t),out=path.join(root,'draft');let calls=0;
  const result=await directProduction(file,out,provider(draft,()=>calls++));
  assert.equal(calls,1);assert.equal(result.mode,'provider');assert.equal(result.status,'ready-for-preview');
  assert.equal(result.humanReviewRequired,true);
  const loaded=await loadProduction(path.join(out,'production.json'));
  assert.deepEqual(loaded.plan.shots.map(s=>s.heading),draft.shots.map(s=>s.heading));
  assert.ok(loaded.plan.shots.every(s=>s.transition==='cut'));
  const saved=JSON.parse(await readFile(path.join(out,'director-report.json'),'utf8'));
  assert.equal(saved.provider.model,'fixture-only');
});

test('cut transitions have exactly one visible shot at a narration boundary',async t=>{
  const{root,file,draft}=await fixture(t);const out=path.join(root,'cut');await applyDirection(file,out,draft);
  const scene=JSON.parse(await readFile(path.join(out,'scene.json'),'utf8'));
  const plan=JSON.parse(await readFile(path.join(out,'plan.json'),'utf8'));
  const at=plan.shots[1].start;
  const frame=evaluateScene(scene,at);
  const groups=frame.layers[0].children.filter(l=>/^shot-\d+$/.test(l.id));
  assert.equal(groups[0].opacity,0);assert.equal(groups[1].opacity,1);
  assert.equal(groups.filter(l=>l.opacity>0).length,1);
  assert.equal(evaluateScene(scene,at-.01).layers[0].children[0].opacity,1);
});

test('bad timing coverage and unsupported IDs fail without publishing a bundle',async t=>{
  const{root,file,draft}=await fixture(t);
  const gap=structuredClone(draft);gap.shots[1].fromWord='w1';
  await assert.rejects(applyDirection(file,path.join(root,'gap'),gap),/cover every word/);
  const invalid=requestArt(draft);invalid.shots[0].visual.image='unknown';
  await assert.rejects(applyDirection(file,path.join(root,'unknown'),invalid),/unknown asset|visual binding/);
  assert.deepEqual(await readdir(root),['source']);
});

test('missing art yields explicit needs-assets, no scene or silent placeholder',async t=>{
  const{root,file,draft}=await fixture(t);const out=path.join(root,'needs');
  const result=await applyDirection(file,out,requestArt(draft));
  assert.equal(result.status,'needs-assets');assert.deepEqual(result.missingAssets,['study-room']);
  const files=await readdir(out);assert.ok(files.includes('asset-needs.json'));assert.ok(!files.includes('scene.json'));assert.ok(!files.includes('film.mp4'));
});

test('approved matching registry assets resolve the original request without another provider call',async t=>{
  const{root,source,file,draft}=await fixture(t),needs=requestArt(draft);
  const canvas=createCanvas(40,20);canvas.getContext('2d').fillRect(0,0,40,20);
  const png=path.join(source,'room.png');await writeFile(png,canvas.toBuffer('image/png'));
  const{image,bytes,...measurements}=await inspectPng(png);
  const registry={schemaVersion:1,styleId:'room-v1',assets:[{id:'study-room',kind:'background',src:'room.png',...measurements,provenance:{kind:'procedural',creator:'Test fixture',source:'Original Canvas pixels',usage:'Fixture only'},review:{status:'approved'}}]};
  await writeFile(path.join(source,'registry.json'),JSON.stringify(registry));
  const config=JSON.parse(await readFile(file,'utf8'));Object.assign(config,{assetRegistry:'registry.json',assetStyle:'room-v1'});await writeFile(file,JSON.stringify(config));
  const result=await applyDirection(file,path.join(root,'resolved'),needs);
  assert.equal(result.status,'ready-for-preview');assert.deepEqual(result.missingAssets,[]);
  const saved=JSON.parse(await readFile(path.join(result.directory,'director-draft.json'),'utf8'));
  assert.deepEqual(saved.shots[0].assetRequests,[]);assert.equal(saved.shots[0].visual.image,'study-room');
});

test('existing output is preserved and no provider request occurs',async t=>{
  const{root,file,draft}=await fixture(t);let calls=0;
  await assert.rejects(directProduction(file,root,provider(draft,()=>calls++)),/already exists/);
  assert.equal(calls,0);assert.deepEqual(await readdir(root),['source']);
});

test('source changes during a provider call reject stale direction',async t=>{
  const{root,file,source,draft}=await fixture(t);
  await assert.rejects(directProduction(file,path.join(root,'stale'),provider(draft,async()=>{
    const config=JSON.parse(await readFile(file,'utf8'));config.title='Changed during call';await writeFile(file,JSON.stringify(config));
  })),/sources changed/);
  assert.deepEqual(await readdir(root),['source']);
});

test('scoped revision accepts selected edits and rejects changes to locked ranges/content',async t=>{
  const{root,file,draft}=await fixture(t);
  const updated=structuredClone(draft);updated.shots[1].heading='One useful idea';
  const success=await directProduction(file,path.join(root,'revision'),provider(updated),{revision:{draft,shots:[2]}});
  assert.equal(success.status,'ready-for-preview');
  for(const[change,error]of [[d=>d.shots[0].heading='Wrong shot',/locked shot/],[d=>d.shots[1].fromWord='w1',/narration range/],[d=>d.analysis.arc='Wrong arc',/locked analysis/]]){
    const invalid=structuredClone(updated);change(invalid);
    await assert.rejects(directProduction(file,path.join(root,'invalid'),provider(invalid),{revision:{draft,shots:[2]}}),error);
  }
});

test('CLI prepare/apply works without credentials and rejects duplicate options',async t=>{
  const{root,file,draft}=await fixture(t);const cli=new URL('../dist/apps/cli/src/main.js',import.meta.url).pathname;
  const call=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:'',GEMINI_API_KEY:''}});
  assert.equal(call(['director','prepare',file,'--out',path.join(root,'cli-request')]).status,0);
  const plan=path.join(root,'plan.json');await writeFile(plan,JSON.stringify(draft));
  const applied=call(['director','apply',file,'--plan',plan,'--out',path.join(root,'cli-draft')]);assert.equal(applied.status,0,applied.stderr);
  assert.equal(JSON.parse(applied.stdout).mode,'imported');
  assert.notEqual(call(['director','prepare',file,'--out','x','--out','y']).status,0);
});


test('artwork requests must be visible bindings, not unused checklist entries',async t=>{
  const{file,draft}=await fixture(t),needs=requestArt(draft);needs.shots[0].visual.image='other';
  await assert.rejects(inspectDirection(file,needs),/visual binding/);
});
