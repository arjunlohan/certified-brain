// OpenAI-compatible chat client. One code path for the teacher (DeepSeek via
// the Vercel AI Gateway) and any owned judge that exposes the same API.

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  provider: string;
  latencyMs: number;
}

export interface Endpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Gateway provider pin; logged on every call so provider drift is visible. */
  pinProvider?: string;
}

export function teacher(): Endpoint {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY missing (put it in .env.local)");
  return {
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    apiKey,
    model: process.env.TEACHER_MODEL ?? "deepseek/deepseek-v4-flash-0731",
    pinProvider: process.env.TEACHER_PROVIDER || undefined,
  };
}

export async function chat(
  ep: Endpoint,
  prompt: string,
  opts: { maxTokens?: number; temperature?: number; json?: boolean } = {},
): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: ep.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: opts.maxTokens ?? 400,
    temperature: opts.temperature ?? 0,
    reasoning: { enabled: false },
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (ep.pinProvider) body.providerOptions = { gateway: { only: [ep.pinProvider] } };

  for (let attempt = 0; ; attempt++) {
    const t0 = performance.now();
    const res = await fetch(`${ep.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ep.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 12) {
      // Gateway asks for "retry after 10s" on per-minute team limits.
      await Bun.sleep(10_000 + Math.random() * 2_000);
      continue;
    }
    if (res.status >= 500 && attempt < 5) {
      await Bun.sleep(500 * 2 ** attempt);
      continue;
    }
    const j = (await res.json()) as any;
    if (!res.ok || j.error) throw new Error(`chat ${res.status}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
    const msg = j.choices?.[0]?.message ?? {};
    return {
      text: msg.content ?? "",
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
      costUsd: Number(j.usage?.cost ?? 0),
      provider: msg.provider_metadata?.gateway?.routing?.resolvedProvider ?? j.provider ?? "unknown",
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

/** Run async jobs with bounded concurrency; preserves input order. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}
