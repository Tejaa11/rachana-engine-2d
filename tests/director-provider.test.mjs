import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIDirector} from '../dist/packages/director/src/provider.js';

// Contract tests inject a mocked HTTP transport. They are not live provider evidence.
const key='sk-private-test-sentinel';
const request={instructions:'Choose supported shots.',input:{script:'A useful story.'},schema:{type:'object',properties:{},required:[],additionalProperties:false}};
function envelope(extra={}){return{status:'completed',id:'resp_contract_test',output:[{type:'message',content:[{type:'output_text',text:'{"schemaVersion":1}'}]}],usage:{input_tokens:300,output_tokens:200,total_tokens:500},...extra};}
function mocked(response){let calls=0;return{fetch:async()=>{calls++;return response;},calls:()=>calls};}
function provider(fetch,extra={}){return createOpenAIDirector({apiKey:key,model:'selected-test-model',fetch,...extra});}
async function rejection(promise,pattern){await assert.rejects(promise,error=>{assert.match(error.message,pattern);assert.ok(!error.message.includes(key));assert.ok(!error.message.includes('sensitive-provider-body'));return true;});}

test('mocked Responses contract uses strict structured output, store:false and one request',async()=>{
  let calls=0;
  const result=await provider(async(url,options)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,`Bearer ${key}`);assert.ok(options.signal instanceof AbortSignal);
    const body=JSON.parse(options.body);assert.equal(body.model,'selected-test-model');assert.equal(body.instructions,request.instructions);
    assert.deepEqual(JSON.parse(body.input),request.input);assert.equal(body.store,false);assert.equal(body.max_output_tokens,8000);
    assert.deepEqual(body.text.format,{type:'json_schema',name:'rachana_direction_v1',strict:true,schema:request.schema});
    assert.equal(body.tools,undefined);assert.equal(body.temperature,undefined);
    return Response.json(envelope());
  }).generate(request);
  assert.equal(calls,1);assert.deepEqual(result,{draft:{schemaVersion:1},metadata:{provider:'openai-responses',model:'selected-test-model',responseId:'resp_contract_test',inputTokens:300,outputTokens:200,totalTokens:500}});
});

test('model and local key are required and settings are bounded before any network call',()=>{
  assert.throws(()=>createOpenAIDirector({model:'',apiKey:key}),/model/);
  assert.throws(()=>createOpenAIDirector({model:'valid',apiKey:''}),/OPENAI_API_KEY/);
  assert.throws(()=>createOpenAIDirector({model:'valid',apiKey:'key\nsecret'}),/OPENAI_API_KEY/);
  for(const extra of [{timeoutMs:0},{timeoutMs:120001},{timeoutMs:1.5},{maxOutputTokens:1000},{maxOutputTokens:16001},{maxOutputTokens:NaN}])assert.throws(()=>provider(async()=>{},extra));
});

test('environment configuration is read without exporting credentials',async()=>{
  const oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.RACHANA_DIRECTOR_MODEL;
  try{
    process.env.OPENAI_API_KEY=key;process.env.RACHANA_DIRECTOR_MODEL='environment-model';
    const result=await createOpenAIDirector({fetch:async()=>Response.json(envelope())}).generate(request);
    assert.equal(result.metadata.model,'environment-model');assert.ok(!JSON.stringify(result).includes(key));
  }finally{
    if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
    if(oldModel===undefined)delete process.env.RACHANA_DIRECTOR_MODEL;else process.env.RACHANA_DIRECTOR_MODEL=oldModel;
  }
});

test('HTTP auth, quota and server failures are sanitized and never retried',async()=>{
  for(const[status,message]of [[401,/authentication/],[403,/authentication/],[429,/rate limited/],[500,/unavailable/],[400,/rejected/]]){
    const transport=mocked(new Response(`sensitive-provider-body ${key}`,{status}));
    await rejection(provider(transport.fetch).generate(request),message);assert.equal(transport.calls(),1);
  }
  const transport=mocked(null);
  await rejection(provider(async()=>{await transport.fetch();throw new Error(`sensitive-provider-body ${key}`);}).generate(request),/network/);assert.equal(transport.calls(),1);
});

test('refusal, incomplete response, malformed JSON and ambiguous text fail visibly',async()=>{
  const invalid=[
    [new Response('broken-json'),/invalid JSON/],
    [Response.json(null),/invalid response envelope/],
    [Response.json(envelope({status:'incomplete'})),/incomplete/],
    [Response.json(envelope({output:[{content:[{type:'refusal',refusal:`sensitive-provider-body ${key}`}]}]})),/declined/],
    [Response.json(envelope({output:[]})),/exactly one/],
    [Response.json(envelope({output:[{content:[{type:'output_text',text:'{}'},{type:'output_text',text:'{}'}]}]})),/exactly one/],
    [Response.json(envelope({output:[{content:[{type:'output_text',text:'```json\n{}\n```'}]}]})),/not a JSON draft/],
  ];
  for(const[response,message]of invalid)await rejection(provider(async()=>response).generate(request),message);
});

test('only bounded provider metadata is retained, never raw response or body errors',async()=>{
  const result=await provider(async()=>Response.json(envelope({id:`resp_${key}`,model:`sensitive-provider-body ${key}`,usage:{input_tokens:-1,output_tokens:1.5,total_tokens:Infinity},error:{message:key},extra:key}))).generate(request);
  assert.deepEqual(result.metadata,{provider:'openai-responses',model:'selected-test-model'});
  assert.ok(!JSON.stringify(result).includes(key));
});

test('both declared and streamed response limits cancel oversized bodies',async()=>{
  let cancelled=0;
  const known=new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'Content-Length':String(512*1024+1)}});
  await rejection(provider(async()=>known).generate(request),/512 KiB/);assert.equal(cancelled,1);
  const chunked=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(512*1024));controller.enqueue(new Uint8Array(1));},cancel(){cancelled++;}}));
  await rejection(provider(async()=>chunked).generate(request),/512 KiB/);assert.equal(cancelled,2);
});

test('deadline covers fetch and the complete body read and aborts the single request',async()=>{
  let signal,calls=0;
  await rejection(provider(async(_url,options)=>{calls++;signal=options.signal;return new Promise(()=>{});},{timeoutMs:1000}).generate(request),/timed out/);
  assert.equal(calls,1);assert.equal(signal.aborted,true);
  let cancelled=false;
  await rejection(provider(async(_url,options)=>{signal=options.signal;return new Response(new ReadableStream({cancel(){cancelled=true;}}));},{timeoutMs:1000}).generate(request),/timed out/);
  assert.equal(signal.aborted,true);assert.equal(cancelled,true);
});

test('nonserializable or oversized requests fail without transport calls',async()=>{
  let calls=0;const p=provider(async()=>{calls++;return Response.json(envelope());});
  const cyclic={};cyclic.self=cyclic;
  for(const bad of [{...request,input:undefined},{...request,input:()=>{}},{...request,input:cyclic},{...request,instructions:''},{...request,input:'x'.repeat(1024*1024)},{...request,schema:null}])await assert.rejects(p.generate(bad),/serializable/);
  assert.equal(calls,0);
});


test('streamed UTF-8 is decoded across chunks and malformed UTF-8 is rejected',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify(envelope({output:[{content:[{type:'output_text',text:JSON.stringify({title:'A quiet café'})}]}]})));
  const split=bytes.indexOf(0xc3)+1;
  const valid=new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,split));controller.enqueue(bytes.slice(split));controller.close();}}));
  const result=await provider(async()=>valid).generate(request);assert.deepEqual(result.draft,{title:'A quiet café'});
  await rejection(provider(async()=>new Response(new Uint8Array([0xff,0xfe]))).generate(request),/invalid JSON/);
});
