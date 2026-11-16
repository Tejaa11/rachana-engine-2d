/** Optional network boundary. This adapter makes one bounded, non-retried request. */
export interface DirectorRequest {
  instructions: string;
  input: unknown;
  schema: Record<string, unknown>;
}
export interface DirectorResult {
  draft: unknown;
  metadata: {
    provider: string;
    model: string;
    responseId?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}
export interface DirectorProvider {
  name: string;
  generate(request: DirectorRequest): Promise<DirectorResult>;
}
export interface OpenAIDirectorOptions {
  model?: string;
  apiKey?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Injectable transport for contract tests. CLI callers use the native fetch. */
  fetch?: typeof globalThis.fetch;
}

const ENDPOINT = 'https://api.openai.com/v1/responses';
const RESPONSE_LIMIT = 512 * 1024;
class ProviderError extends Error {}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function tokenCount(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000_000 ? Number(value) : undefined;
}
function failureForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('Director authentication failed. Check your local API key and model access.');
  if (status === 429) return new ProviderError('Director request was rate limited or exceeded quota. Check your account before retrying explicitly.');
  if (status >= 500) return new ProviderError('Director provider is unavailable. No automatic retry was made.');
  return new ProviderError('Director provider rejected the request. Check the model supports Responses structured output and the request settings.');
}

/** The caller must select a model; no changing default or account access is assumed. */
export function createOpenAIDirector(options: OpenAIDirectorOptions = {}): DirectorProvider {
  const model = options.model ?? process.env.RACHANA_DIRECTOR_MODEL;
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!model || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) throw new Error('Choose a Responses structured-output model with --model or RACHANA_DIRECTOR_MODEL.');
  if (!apiKey?.trim() || /[\r\n]/.test(apiKey)) throw new Error('Set OPENAI_API_KEY locally before using the OpenAI director. Never put the key in project files.');
  const maxOutputTokens = options.maxOutputTokens ?? 8000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1024 || maxOutputTokens > 16_000) throw new Error('Director maxOutputTokens must be an integer from 1024 to 16000.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) throw new Error('Director timeoutMs must be an integer from 1000 to 120000.');
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('A fetch-capable Node.js runtime is required.');

  return {
    name: 'openai-responses',
    async generate(request: DirectorRequest): Promise<DirectorResult> {
      let body: string;
      try {
        if (!request || typeof request.instructions !== 'string' || !request.instructions.trim() || !record(request.schema)) throw new Error();
        const input = JSON.stringify(request.input);
        if (input === undefined) throw new Error();
        body = JSON.stringify({
          model, instructions: request.instructions, input, store: false,
          max_output_tokens: maxOutputTokens,
          text: { format: { type: 'json_schema', name: 'rachana_direction_v1', strict: true, schema: request.schema } },
        });
        if (Buffer.byteLength(body) > 1024 * 1024) throw new Error();
      } catch { throw new Error('Director request must contain serializable instructions, input and schema within the 1 MiB request limit.'); }
      const controller = new AbortController();
      let timedOut = false;
      let cancelBody: (() => void) | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          cancelBody?.();
          reject(new ProviderError('Director request timed out. No automatic retry was made; check usage before retrying.'));
        }, timeoutMs);
      });
      const operation = async (): Promise<DirectorResult> => {
        const response = await fetcher(ENDPOINT, {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
          body, signal: controller.signal, redirect: 'error',
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw failureForStatus(response.status);
        }
        const declaredLength = response.headers.get('content-length');
        if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > RESPONSE_LIMIT) {
          void response.body?.cancel().catch(() => {});
          controller.abort();
          throw new ProviderError('Director response exceeds the 512 KiB limit.');
        }
        if (!response.body) throw new ProviderError('Director provider returned an empty response.');
        const reader = response.body.getReader();
        cancelBody = () => { void reader.cancel().catch(() => {}); };
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > RESPONSE_LIMIT) {
              cancelBody(); controller.abort();
              throw new ProviderError('Director response exceeds the 512 KiB limit.');
            }
            chunks.push(part.value);
          }
        } finally {
          cancelBody = undefined;
          reader.releaseLock();
        }
        let payload: unknown;
        try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { throw new ProviderError('Director provider returned invalid JSON. No draft was accepted.'); }
        if (!record(payload)) throw new ProviderError('Director provider returned an invalid response envelope.');
        const parts: Record<string, unknown>[] = [];
        if (Array.isArray(payload.output)) for (const item of payload.output) {
          if (record(item) && Array.isArray(item.content)) for (const part of item.content) if (record(part)) parts.push(part);
        }
        if (parts.some(part => part.type === 'refusal')) throw new ProviderError('Director provider declined this request. No draft was accepted.');
        if (payload.status !== 'completed') throw new ProviderError('Director response was incomplete or unsuccessful. No draft was accepted; review output limits before retrying.');
        const outputs = parts.filter(part => part.type === 'output_text');
        if (outputs.length !== 1 || typeof outputs[0].text !== 'string' || !outputs[0].text.trim()) throw new ProviderError('Director response must contain exactly one JSON output text.');
        let draft: unknown;
        try { draft = JSON.parse(outputs[0].text); }
        catch { throw new ProviderError('Director output text is not a JSON draft. No draft was accepted.'); }
        const usage = record(payload.usage) ? payload.usage : {};
        const metadata: DirectorResult['metadata'] = { provider: 'openai-responses', model };
        // Preserve only selected bounded fields. Never retain the raw envelope/error body.
        if (typeof payload.id === 'string' && /^resp_[A-Za-z0-9_-]{1,200}$/.test(payload.id) && !payload.id.includes(apiKey.trim())) metadata.responseId = payload.id;
        for (const [target, source] of [['inputTokens', 'input_tokens'], ['outputTokens', 'output_tokens'], ['totalTokens', 'total_tokens']] as const) {
          const count = tokenCount(usage[source]);
          if (count !== undefined) metadata[target] = count;
        }
        return { draft, metadata };
      };
      try { return await Promise.race([operation(), deadline]); }
      catch (error) {
        if (timedOut) throw new Error('Director request timed out. No automatic retry was made; check usage before retrying.');
        if (error instanceof ProviderError) throw new Error(error.message);
        throw new Error('Director network request failed. No automatic retry was made; check your connection and account usage before retrying.');
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
