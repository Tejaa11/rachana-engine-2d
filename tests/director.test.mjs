import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, cp, rm, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { planProduction, compact, templates } from '../dist/packages/director/src/plan.js';
import { composePlan } from '../dist/packages/director/src/compose.js';
import { validateProductionConfig, loadProduction, composeProduction } from '../dist/packages/director/src/project.js';
import { validateScene } from '../dist/packages/core/src/validate.js';
import { evaluateScene } from '../dist/packages/core/src/evaluate.js';
import { createSurface, drawFrame } from '../dist/packages/renderer/src/draw.js';

const config={schemaVersion:1,id:'unfamiliar-example',title:'A useful observation',script:'script.txt',audio:'voice.wav',timing:'timing.json'};
const script='Notice a sound in the room. Notice how that sound changes over time. First, listen for a moment. Then describe one small detail. Compare your first description with your second description. Leave a quiet moment for another observation.';
function timingFor(text=script) {
  const tokens=text.split(/\s+/);
  return {durationSeconds:tokens.length*.4, timingSource:'manual',words:tokens.map((text,i)=>({id:`w${i+1}`,text,start:i*.4,end:(i+1)*.4}))};
}
function planned(extra={}) { return planProduction({...config,...extra},script,timingFor()); }
function flatten(layer) {return [layer,...(layer.type==='group'?layer.children.flatMap(flatten):[])];}
async function temporary(t) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'rachana-director-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return dir;
}
async function fixture(t) {
  const dir=await temporary(t), source=path.join(dir,'source');
  await cp(new URL('../examples/learning-habit/',import.meta.url),source,{recursive:true});
  return {dir,source,file:path.join(source,'production.json')};
}

test('production schema rejects unsupported settings, extra fields and invisible labels',()=>{
  assert.doesNotThrow(()=>validateProductionConfig(config));
  for(const extra of [{width:1},{style:'random'},{output:{width:1920,height:720,fps:30}},{title:'  '},{beats:[{fromWord:'w1',toWord:'w4',heading:'  '},{fromWord:'w5',toWord:'w12',heading:'End'}]}]) {
    assert.throws(()=>validateProductionConfig({...config,...extra}));
  }
});

test('a new script is deterministic, covers every word and keeps complete source headings',()=>{
  const before=JSON.stringify(config), timing=timingFor(), snapshot=JSON.stringify(timing);
  const first=planProduction(config,script,timing);
  assert.deepEqual(first,planned());
  assert.equal(JSON.stringify(config),before);assert.equal(JSON.stringify(timing),snapshot);
  const source=script.split(/(?<=[.!?])\s+/).map(s=>s.replace(/[.!?]$/,''));
  assert.ok(first.shots.every(s=>source.includes(s.heading)));
  assert.equal(first.shots[0].start,0);
  assert.equal(first.shots.at(-1).end,timing.durationSeconds);
  let next=0;
  for(const shot of first.shots){
    assert.equal(shot.fromWord,timing.words[next].id);
    const last=timing.words.findIndex(w=>w.id===shot.toWord);
    assert.ok(last>=next);next=last+1;
  }
  assert.equal(next,timing.words.length);
  assert.equal(first.planningMode,'local-rules');
});

test('repeated words preserve distinct sentence anchors and timed item reveals',()=>{
  const plan=planned();
  const compared=plan.shots.find(s=>s.template==='compare');
  assert.deepEqual(compared.items,['your first description','your second description']);
  const first=plan.narration.words.find(w=>w.id===compared.fromWord);
  assert.ok(compared.itemStarts[0]>first.start);
  assert.ok(compared.itemStarts[1]>compared.itemStarts[0]);
  assert.equal(compared.itemStarts[0],plan.narration.words.find(w=>w.text==='your').start);
});

test('captions cover the transcript once and never cross a shot boundary',()=>{
  const plan=planned();
  assert.equal(compact(plan.captions.map(c=>c.text).join(' ')),compact(script));
  for(const cue of plan.captions) {
    assert.ok(cue.end>cue.start);
    assert.ok(cue.text.split(/\s+/).length<=8);
    assert.ok(plan.shots.some(shot=>cue.start>=shot.start-1e-6&&cue.end<=shot.end+1e-6));
  }
  assert.ok(plan.captions.some(c=>c.text.endsWith('.')));
  assert.ok(plan.captions.every(c=>c.text.split(/\s+/).length>1));
});

test('mismatched transcripts and malformed, overlapping or duplicated words fail before composition',()=>{
  assert.throws(()=>planProduction(config,script+' Different.',timingFor()),/Script and timing text differ/);
  for(const mutate of [t=>t.words[1].id=t.words[0].id,t=>t.words[1].start=0,t=>t.words[1].end=Infinity,t=>t.words[0]=null,t=>t.timingSource='estimated',t=>t.durationSeconds=91,t=>t.words=[]]) {
    const t=timingFor();mutate(t);assert.throws(()=>planProduction(config,script,t));
  }
});

test('explicit beats must cover all words exactly once in order',()=>{
  const timing=timingFor();
  const beats=[{fromWord:'w1',toWord:'w12',heading:'Listen closely',template:'focus'},{fromWord:'w13',toWord:timing.words.at(-1).id,heading:'Try another observation',template:'closing'}];
  const plan=planProduction({...config,beats},script,timing);
  assert.equal(plan.planningMode,'explicit-beats');
  assert.equal(plan.shots[0].heading,'Listen closely');
  for(const mutate of [b=>b[1].fromWord='w14',b=>b[1].fromWord='w12',b=>b[1].toWord='missing',b=>b[1].toWord='w30']) {
    const b=structuredClone(beats);mutate(b);assert.throws(()=>planProduction({...config,beats:b},script,timing),/beats/);
  }
});

test('a long single sentence is rejected for revision rather than chopped into incomplete headings',()=>{
  const value=Array(30).fill('observation').join(' ')+'.';
  assert.throws(()=>planProduction(config,value,timingFor(value)),/too much display text/);
  const short='A careful observation can leave enough room for another useful question to explore together today.';
  const plan=planProduction(config,short,timingFor(short));
  assert.equal(plan.shots.length,1);
  assert.equal(plan.shots[0].heading,short.slice(0,-1));
  assert.ok(plan.warnings.some(s=>s.includes('Fewer than three')));
});

test('dense labels fail visibly instead of silent truncation or unbounded shrinking',()=>{
  const plan=planned();
  plan.shots[1].template='cards';plan.shots[1].items=['W'.repeat(70),'W'.repeat(70),'W'.repeat(70)];
  plan.shots[1].itemStarts=[plan.shots[1].start+.2,plan.shots[1].start+.3,plan.shots[1].start+.4];
  assert.throws(()=>composePlan(plan),/does not fit/);
});

test('every vector template and palette draws with separate caption space at 720p and 1080p',()=>{
  const base=planned();
  for(const style of ['paper','ocean','midnight'])for(const [width,height] of [[1280,720],[1920,1080]]){
    const plan=structuredClone(base);plan.style=style;plan.output.width=width;plan.output.height=height;
    // Same script and timings, six explicit staging choices with complete labels.
    plan.shots=templates.filter(t=>t!=='illustration').map((template,i)=>({id:`shot-${i+1}`,template,start:i*2.8,end:(i+1)*2.8,fromWord:'w1',toWord:'w2',heading:'An observation worth sharing',items:['Listen to the sound','Describe the change'],itemStarts:[i*2.8+.2,i*2.8+1],subject:['idea','book','leaf','board','shield','idea'][i],direction:'Template coverage fixture'}));
    plan.output.durationSeconds=16.8;
    plan.narration.words=plan.narration.words.filter(w=>w.end<=16.8);
    plan.captions=[];
    const {scene,report}=composePlan(plan);
    assert.equal(validateScene(scene).valid,true);
    assert.equal(report.humanReviewRequired,true);
    assert.equal(report.status,'ready-for-preview');
    const canvas=createSurface(width,height);
    // Exercise peak entrance scale, not only settled templates.
    for(const shot of plan.shots)for(const offset of [.52,1.32,2.3])drawFrame(canvas,evaluateScene(scene,shot.start+offset));
    const captions=flatten(scene.layers[0]).find(l=>l.id==='caption-band');
    assert.equal(captions.position[1],632);
  }
});

test('all public topic fixtures compose through the same API without custom scene files',async()=>{
  const seen=new Set();
  for(const id of ['learning-habit','team-flow','seed-story']) {
    const loaded=await loadProduction(new URL(`../examples/${id}/production.json`,import.meta.url).pathname);
    const {scene,report}=composePlan(loaded.plan);
    assert.equal(report.projectId,id);assert.equal(report.planningMode,'local-rules');
    assert.ok(report.templates.length>=3);assert.ok(report.layoutSamplesChecked>=11);
    assert.ok(scene.narration.words.length>40);seen.add(report.style);
  }
  assert.equal(seen.size,3);
});

test('a portable editable bundle contains its inputs, valid scene and traceable report',async t=>{
  const {dir,file}=await fixture(t), target=path.join(dir,'composed');
  const result=await composeProduction(file,target);
  assert.equal(result.report.humanReviewRequired,true);
  const files=await readdir(target);
  for(const name of ['scene.json','plan.json','script.txt','voice.wav','timing.json','production.json','quality-report.json'])assert.ok(files.includes(name));
  const scene=JSON.parse(await readFile(result.sceneFile,'utf8'));
  assert.equal(validateScene(scene).valid,true);
  assert.equal(scene.audio.src,'voice.wav');
  const report=JSON.parse(await readFile(path.join(target,'quality-report.json'),'utf8'));
  assert.match(report.sources.audioSha256,/^[a-f0-9]{64}$/);
  assert.ok(report.audio.durationSeconds>10);
  assert.deepEqual((await loadProduction(path.join(target,'production.json'))).plan,result.plan);
});

test('existing production directories and their contents are preserved',async t=>{
  const {dir,file}=await fixture(t), target=path.join(dir,'existing');
  await mkdir(target);await writeFile(path.join(target,'keep.txt'),'my draft');
  await assert.rejects(composeProduction(file,target),{code:'EEXIST'});
  assert.deepEqual(await readdir(target),['keep.txt']);
  assert.equal(await readFile(path.join(target,'keep.txt'),'utf8'),'my draft');
});

test('bad duration, script or display text publishes no partial bundle',async t=>{
  const {dir,file,source}=await fixture(t);
  const timing=JSON.parse(await readFile(path.join(source,'timing.json'),'utf8'));
  await writeFile(path.join(source,'timing.json'),JSON.stringify({...timing,durationSeconds:timing.durationSeconds+2}));
  await assert.rejects(composeProduction(file,path.join(dir,'invalid-duration')),/duration differ/);
  await writeFile(path.join(source,'timing.json'),JSON.stringify(timing));
  await writeFile(path.join(source,'script.txt'),'Unrelated text.');
  await assert.rejects(composeProduction(file,path.join(dir,'invalid-script')),/Script and timing text differ/);
  assert.deepEqual((await readdir(dir)).sort(),['source']);
});

test('each production reference is constrained even when a symlink points outside',async t=>{
  const {dir,file,source}=await fixture(t);
  await writeFile(path.join(dir,'outside.txt'),'outside');
  try{await symlink(path.join(dir,'outside.txt'),path.join(source,'escape.txt'));}
  catch(error){if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Symlink privilege unavailable');return;}throw error;}
  const value=JSON.parse(await readFile(file,'utf8'));
  for(const key of ['script','audio','timing']){
    await writeFile(file,JSON.stringify({...value,[key]:'escape.txt'}));
    await assert.rejects(loadProduction(file),/symlink escapes/);
    await writeFile(file,JSON.stringify({...value,[key]:'../outside.txt'}));
    await assert.rejects(loadProduction(file));
  }
});

test('compose CLI creates an editable bundle and rejects unknown or duplicate options',async t=>{
  const {dir,file}=await fixture(t), cli=new URL('../dist/apps/cli/src/main.js',import.meta.url).pathname;
  const good=spawnSync(process.execPath,[cli,'compose',file,'--out',path.join(dir,'cli-result')],{encoding:'utf8'});
  assert.equal(good.status,0,good.stderr);
  assert.equal(JSON.parse(good.stdout).rendered,false);
  for(const flags of [['--out'],['--output','x'],['--out','x','--out','y']]){
    const bad=spawnSync(process.execPath,[cli,'compose',file,...flags],{encoding:'utf8'});
    assert.notEqual(bad.status,0);
  }
});


test('item counts and unused labels are rejected instead of silently discarded',()=>{
  const timing=timingFor();
  for(const [template,items] of [['compare',['First','Second','Third']],['cards',['First']],['process',['One','Two','Three','Four']],['focus',['First','Second']]]){
    const beats=[{fromWord:'w1',toWord:'w12',heading:'A clear choice',template,items},{fromWord:'w13',toWord:timing.words.at(-1).id,heading:'Another observation',template:'closing'}];
    assert.throws(()=>planProduction({...config,beats},script,timing),/items|labels/);
  }
});
