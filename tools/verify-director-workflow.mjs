/** Offline integration smoke: an authored fixture passed through a MOCK provider.
 * It verifies workflow/export plumbing, not live model quality or automatic creativity.
 */
import{readFile,writeFile}from'node:fs/promises';
import{spawnSync}from'node:child_process';
import{directProduction,prepareDirection}from'../dist/packages/director/src/direction.js';
import{planProduction}from'../dist/packages/director/src/plan.js';
import{loadScene}from'../dist/packages/renderer/src/files.js';
import{renderVideo}from'../dist/packages/renderer/src/export.js';

const file='examples/learning-habit/production.json';
const output=process.argv[2]??'renders/director-mocked-smoke';
const input=await prepareDirection(file);
const local=planProduction(input.source.config,input.source.script,input.source.timing);
const draft={schemaVersion:1,analysis:{premise:'A focused learning habit.',audience:'Learning creators',arc:'Choose, practice, review, and continue.',visualStrategy:'Offline integration fixture using engine-supported staging.'},shots:local.shots.map((shot,index)=>({fromWord:shot.fromWord,toWord:shot.toWord,heading:shot.heading,template:shot.template,subject:shot.subject,acting:shot.template==='closing'?'celebrate':'explain',intent:'Verify a supported beat through the workflow.',transition:index%2?'cut':'fade',items:shot.items,visual:null,assetRequests:[]})),missingAssets:[],reviewNotes:['Authored local-rule fixture through mocked transport; not a live AI-directed film.']};
let calls=0;
const result=await directProduction(file,output,{name:'mocked-smoke',generate:async()=>{calls++;return{draft,metadata:{provider:'mocked-smoke',model:'authored-fixture-not-live'}};}});
if(calls!==1||result.status!=='ready-for-preview')throw new Error('Director smoke did not produce a single ready fixture.');
const sceneFile=`${output}/scene.json`,movie=`${output}/film.mp4`;
await renderVideo(await loadScene(sceneFile),sceneFile,movie);
const check=spawnSync(process.execPath,['tools/verify-smoke.mjs',movie],{encoding:'utf8'});
if(check.status!==0)throw new Error(check.stderr||'Director movie decode failed.');
const verification=JSON.parse(await readFile(`${movie}.verification.json`,'utf8'));
await writeFile(`${output}/offline-test-evidence.json`,JSON.stringify({mode:'mocked-transport',liveProviderCalled:false,unfamiliarScriptAcceptance:false,frames:verification.frames,fullDecode:verification.fullDecode},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({mode:'mocked-transport',liveProviderCalled:false,frames:verification.frames,fullDecode:verification.fullDecode}));
