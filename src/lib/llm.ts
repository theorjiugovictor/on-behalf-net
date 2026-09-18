/**
 * Nebius AI Studio transport.
 *
 * Nebius exposes an OpenAI-compatible surface, so this is a thin fetch wrapper
 * rather than an SDK dependency — it keeps the provider swappable by changing
 * one base URL.
 *
 * Every call site must tolerate a null return. The demo has to run on a
 * conference network with no keys, so "no model available" is a normal state,
 * not an error path.
 */

const BASE_URL = process.env.NEBIUS_BASE_URL ?? "https://api.studio.nebius.com/v1";
const MODEL = process.env.NEBIUS_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct";
const TIMEOUT_MS = Number(process.env.NEBIUS_TIMEOUT_MS ?? 20_000);

export function modelConfigured(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY);
}

export function modelName(): string {
  return MODEL;
}

type ChatOptions = {
  system: string;
  user: string;
  /** Nudges the model to emit a bare JSON object. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

async function chat(opts: ChatOptions): Promise<string | null> {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 700,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[nebius] ${res.status} ${res.statusText}; falling back to local strategy`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn(`[nebius] request failed (${(err as Error).message}); falling back`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask for a JSON object. Returns null on any failure — transport, timeout, or
 * unparseable output — so the caller's deterministic path takes over.
 */
export async function chatJSON<T>(opts: Omit<ChatOptions, "json">): Promise<T | null> {
  const raw = await chat({ ...opts, json: true });
  if (!raw) return null;
  try {
    return JSON.parse(extractJSON(raw)) as T;
  } catch {
    console.warn("[nebius] response was not valid JSON; falling back");
    return null;
  }
}

export async function chatText(opts: Omit<ChatOptions, "json">): Promise<string | null> {
  return chat(opts);
}

/** Models sometimes wrap JSON in prose or a fenced block. Recover the object. */
function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}
