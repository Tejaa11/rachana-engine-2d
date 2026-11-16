// Transport fixtures are mocked API responses, not evidence of a live Gemini call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiDirector } from '../dist/packages/director/src/gemini.js';

const KEY = 'local-test-secret-never-log';
const model = 'test-model';
const request = { instructions: 'Director instructions', input: { script: 'A new story.', words: [] }, schema: { type: 'object', properties: {}, required: [], additionalProperties: false } };
const complete = (extra = {}) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"shots":[]}' }] } }], ...extra });
function provider(fetch, extra = {}) { return createGeminiDirector({ apiKey: KEY, model, fetch, ...extra }); }
function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

test('Gemini sends a single schema-constrained request with a header key and explicit model', async () => {
  let calls = 0;
  const result = await provider(async (url, options) => {
    calls++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
    assert.equal(url.includes(KEY), false);
    assert.equal(options.headers['x-goog-api-key'], KEY);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: request.instructions }] });
    assert.equal(body.contents[0].role, 'user');
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), request.input);
    assert.deepEqual(body.generationConfig.responseJsonSchema, request.schema);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.generationConfig.maxOutputTokens, 8000);
    assert.equal(body.generationConfig.candidateCount, 1);
    assert.equal(JSON.stringify(body).includes(KEY), false);
    return response(complete({ modelVersion: 'test-model-v1', responseId: 'response-123', usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 60, totalTokenCount: 110 } }));
  }).generate(request);
  assert.equal(calls, 1);
  assert.deepEqual(result.draft, { shots: [] });
  assert.deepEqual(result.metadata, { provider: 'gemini', model: 'test-model-v1', responseId: 'response-123', inputTokens: 50, outputTokens: 60, totalTokens: 110 });
});

test('Gemini validates credentials, model and request bounds without a request', () => {
  for (const extra of [{ apiKey: '' }, { apiKey: 'bad\nkey' }, { model: '' }, { model: '../secret' }, { model: 'models/test' }, { model: 'a?key=b' }, { timeoutMs: 999 }, { timeoutMs: 120001 }, { timeoutMs: Infinity }, { maxOutputTokens: 1023 }, { maxOutputTokens: 16001 }, { maxOutputTokens: NaN }]) {
    assert.throws(() => provider(() => assert.fail('Unexpected request'), extra));
  }
});

test('Gemini authentication, quota and server errors are sanitized and never retried', async () => {
  for (const [status, message] of [[401, /authentication/], [403, /authentication/], [429, /quota or rate limit/], [500, /unavailable/], [400, /HTTP 400/]]) {
    let calls = 0;
    await assert.rejects(provider(async () => { calls++; return response({ error: { message: KEY } }, status); }).generate(request), error => {
      assert.match(error.message, message); assert.equal(error.message.includes(KEY), false); return true;
    });
    assert.equal(calls, 1);
  }
});

test('Gemini transport errors never expose thrown fetch messages or keys', async () => {
  await assert.rejects(provider(async () => { throw new Error(`Request headers contained ${KEY}`); }).generate(request), error => {
    assert.match(error.message, /network request failed/); assert.equal(error.message.includes(KEY), false); return true;
  });
});

test('Gemini rejects blocked prompts, refusals, incomplete candidates and ambiguous outputs', async () => {
  const values = [
    complete({ promptFeedback: { blockReason: 'SAFETY' } }),
    { candidates: [] },
    { candidates: [complete().candidates[0], complete().candidates[0]] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] },
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: KEY }] } }] },
    { candidates: [{ content: { parts: [{ text: '{}' }] } }] },
    null,
  ];
  for (const value of values) await assert.rejects(provider(async () => response(value)).generate(request), error => {
    assert.equal(error.message.includes(KEY), false); return true;
  });
});

test('Gemini accepts split text parts but rejects reasoning, tool content and empty text', async () => {
  const split = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] } }] };
  assert.deepEqual((await provider(async () => response(split)).generate(request)).draft, { ok: true });
  for (const parts of [[], [{ text: '' }], [{ text: '{}', thought: true }], [{ functionCall: { name: 'unexpected' } }], [{ text: '{}', inlineData: {} }]]) {
    await assert.rejects(provider(async () => response({ candidates: [{ finishReason: 'STOP', content: { parts } }] })).generate(request));
  }
});

test('Gemini requires response and draft JSON, with no raw malformed body in errors', async () => {
  await assert.rejects(provider(async () => new Response(KEY)).generate(request), /malformed response JSON/);
  await assert.rejects(provider(async () => response({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: KEY }] } }] })).generate(request), /not valid JSON/);
  await assert.rejects(provider(async () => new Response(null)).generate(request), /empty response/);
});

test('Gemini drops malformed usage and arbitrary metadata instead of exporting it', async () => {
  const result = await provider(async () => response(complete({ modelVersion: 'https://bad/private', responseId: '\nraw data', usageMetadata: { promptTokenCount: -1, candidatesTokenCount: '999', totalTokenCount: Infinity } }))).generate(request);
  assert.deepEqual(result.metadata, { provider: 'gemini', model });
});

test('Gemini enforces declared and streamed response limits', async () => {
  await assert.rejects(provider(async () => new Response('{}', { headers: { 'content-length': '524289' } })).generate(request), /512 KiB/);
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(524289)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(provider(async () => new Response(body)).generate(request), /512 KiB/);
  assert.equal(cancelled, true);
});

test('Gemini timeout bounds fetch even when a test transport ignores abort', async () => {
  let signal;
  await assert.rejects(provider(async (_, options) => { signal = options.signal; return new Promise(() => {}); }, { timeoutMs: 1000 }).generate(request), /timed out/);
  assert.equal(signal.aborted, true);
});

test('Gemini timeout includes a stalled body after response headers', async () => {
  let signal, cancelled=false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); },cancel(){cancelled=true;} });
  await assert.rejects(provider(async (_, options) => { signal = options.signal; return new Response(body); }, { timeoutMs: 1000 }).generate(request), /timed out/);
  assert.equal(signal.aborted, true);
  assert.equal(cancelled,true);
});


test('Gemini rejects malformed requests before contacting the provider',async()=>{
  for(const value of [null,{}, {...request,instructions:'  '},{...request,schema:null}])await assert.rejects(provider(()=>assert.fail('Unexpected request')).generate(value),/instructions and an output schema/);
});


test('Gemini rejects undefined, function, circular and oversized input before network use',async()=>{
  const circular={};circular.self=circular;
  for(const input of [undefined,()=>{},circular,{lost:undefined},{nested:()=>{}},BigInt(1),{bad:Infinity}])await assert.rejects(provider(()=>assert.fail('Unexpected request')).generate({...request,input}),/serializable JSON/);
  await assert.rejects(provider(()=>assert.fail('Unexpected request')).generate({...request,input:{script:'x'.repeat(1024*1024)}}),/1 MiB/);
});

test('Gemini omits key-bearing metadata and excessive usage values',async()=>{
  const result=await provider(async()=>response(complete({modelVersion:KEY,responseId:`response-${KEY}`,usageMetadata:{promptTokenCount:1000000001,candidatesTokenCount:999999999,totalTokenCount:Number.MAX_SAFE_INTEGER}}))).generate(request);
  assert.deepEqual(result.metadata,{provider:'gemini',model,outputTokens:999999999});
  assert.equal(JSON.stringify(result.metadata).includes(KEY),false);
});
