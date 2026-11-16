import type { DirectorProvider, DirectorRequest, DirectorResult } from './provider.js';

const RESPONSE_LIMIT = 512 * 1024;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const RESPONSE_ID = /^[A-Za-z0-9._:-]{1,200}$/;

export interface GeminiDirectorOptions {
  model?: string;
  apiKey?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

function statusError(status: number): Error {
  if (status === 401 || status === 403) return new Error('Gemini authentication or model access failed. Check GEMINI_API_KEY and model availability.');
  if (status === 429) return new Error('Gemini quota or rate limit reached. Check the account quota before retrying. No automatic retry was made.');
  if (status >= 500) return new Error('Gemini service is unavailable. No automatic retry was made.');
  return new Error(`Gemini request failed (HTTP ${status}). Check the selected model and structured-output support.`);
}

async function readBounded(response: Response, onReader: (reader: ReadableStreamDefaultReader<Uint8Array>) => void): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > RESPONSE_LIMIT) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Gemini response exceeds the 512 KiB limit.');
  }
  if (!response.body) throw new Error('Gemini returned an empty response.');
  const reader = response.body.getReader();
  onReader(reader);
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > RESPONSE_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new Error('Gemini response exceeds the 512 KiB limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Gemini returned malformed response JSON.'); }
  return parsed;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function parseResult(input: unknown, requestedModel: string, apiKey: string): DirectorResult {
  const response = record(input);
  if (!response) throw new Error('Gemini returned an invalid response object.');
  const feedback = record(response.promptFeedback);
  if (feedback?.blockReason) throw new Error('Gemini declined the director request. Review the source material before trying again.');
  const candidates = response.candidates;
  if (!Array.isArray(candidates) || candidates.length !== 1) throw new Error('Gemini must return exactly one director candidate.');
  const candidate = record(candidates[0]);
  if (candidate?.finishReason !== 'STOP') {
    if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('Gemini reached its output-token limit. The incomplete draft was not accepted.');
    throw new Error('Gemini did not complete the director draft. The incomplete or declined candidate was not accepted.');
  }
  const content = record(candidate.content);
  const parts = content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('Gemini returned no director text.');
  let text = '';
  for (const value of parts) {
    const part = record(value);
    if (!part || part.thought === true || typeof part.text !== 'string' || Object.keys(part).some(key => !['text', 'thought'].includes(key))) {
      throw new Error('Gemini returned unsupported non-text director content.');
    }
    text += part.text;
  }
  if (!text.trim()) throw new Error('Gemini returned no director text.');
  let draft: unknown;
  try { draft = JSON.parse(text); }
  catch { throw new Error('Gemini director text is not valid JSON.'); }
  const metadata: DirectorResult['metadata'] = { provider: 'gemini', model: requestedModel };
  if (typeof response.modelVersion === 'string' && MODEL.test(response.modelVersion) && !response.modelVersion.includes(apiKey)) metadata.model = response.modelVersion;
  if (typeof response.responseId === 'string' && RESPONSE_ID.test(response.responseId) && !response.responseId.includes(apiKey)) metadata.responseId = response.responseId;
  const usage = record(response.usageMetadata);
  for (const [target, source] of [['inputTokens', 'promptTokenCount'], ['outputTokens', 'candidatesTokenCount'], ['totalTokens', 'totalTokenCount']] as const) {
    const value = usage?.[source];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000) metadata[target] = value;
  }
  return { draft, metadata };
}

/** One bounded request. A free-tier key has account/model-specific quotas; this adapter never retries. */
export function createGeminiDirector(options: GeminiDirectorOptions = {}): DirectorProvider {
  const model = options.model ?? process.env.RACHANA_DIRECTOR_MODEL;
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!model || !MODEL.test(model)) throw new Error('Choose a valid Gemini model ID using --model or RACHANA_DIRECTOR_MODEL. No default model is selected.');
  if (!apiKey?.trim() || /[\r\n]/.test(apiKey)) throw new Error('Set GEMINI_API_KEY locally before using the Gemini director. Do not put keys in project files.');
  if(model.includes(apiKey.trim()))throw new Error('Director model configuration must not contain the API key.');
  const maxOutputTokens = options.maxOutputTokens ?? 8000;
  const timeoutMs = options.timeoutMs ?? 60000;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1024 || maxOutputTokens > 16000) throw new Error('Director maxOutputTokens must be an integer from 1024 to 16000.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('Director timeoutMs must be an integer from 1000 to 120000.');
  const transport = options.fetch ?? globalThis.fetch;
  if(typeof transport!=='function')throw new Error('A fetch-capable Node.js runtime is required.');
  return {
    name: 'gemini',
    async generate(request: DirectorRequest): Promise<DirectorResult> {
      if(!request||typeof request.instructions!=='string'||!request.instructions.trim()||!record(request.schema))throw new Error('Director request needs instructions and an output schema.');
      const controller = new AbortController();
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let timedOut = false;
      let timeout: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error('Gemini director request timed out. No automatic retry was made.'));
        }, timeoutMs);
      });
      const operation = (async () => {
        let body: string;
        try {
          const input=JSON.stringify(request.input,(_key,value)=>{
            if(['undefined','function','symbol','bigint'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value)))throw new Error();
            return value;
          });
          if(typeof input!=='string')throw new Error();
          body = JSON.stringify({
            systemInstruction: { parts: [{ text: request.instructions }] },
            contents: [{ role: 'user', parts: [{ text: input }] }],
            generationConfig: { responseMimeType: 'application/json', responseJsonSchema: request.schema, maxOutputTokens, candidateCount: 1 },
          });
        } catch { throw new Error('Director request input must be serializable JSON.'); }
        if(Buffer.byteLength(body,'utf8')>1024*1024)throw new Error('Director request exceeds the 1 MiB input limit.');
        let response: Response;
        try {
          response = await transport(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey.trim() },
            body, signal: controller.signal, redirect: 'error',
          });
        } catch {
          throw new Error(timedOut ? 'Gemini director request timed out. No automatic retry was made.' : 'Gemini network request failed. Check connectivity before retrying.');
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw statusError(response.status);
        }
        let data: unknown;
        try { data = await readBounded(response, reader=>{activeReader=reader;}); }
        catch (error) {
          if (error instanceof Error && /^Gemini (response exceeds|returned)/.test(error.message)) throw error;
          throw new Error(timedOut ? 'Gemini director request timed out. No automatic retry was made.' : 'Gemini response could not be read.');
        }
        return parseResult(data, model, apiKey.trim());
      })();
      try { return await Promise.race([operation, deadline]); }
      finally { clearTimeout(timeout!); controller.abort(); void activeReader?.cancel().catch(() => {}); }
    },
  };
}
