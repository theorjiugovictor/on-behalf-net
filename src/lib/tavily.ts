/**
 * Tavily transport — the agent's eyes on the open web.
 *
 * Traversal is the layer that makes an agent useful with nobody else in the
 * room: it reads the public web for counterparties worth approaching. As with
 * the model transport, every function degrades to a null/fixture result rather
 * than throwing, so the floor still runs unkeyed.
 */

const BASE_URL = process.env.TAVILY_BASE_URL ?? "https://api.tavily.com";
const TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS ?? 20_000);

export function searchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export type SearchHit = {
  title: string;
  url: string;
  content: string;
  score: number;
};

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[tavily] ${path} returned ${res.status}; falling back to fixtures`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[tavily] ${path} failed (${(err as Error).message}); falling back`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function search(query: string, maxResults = 8): Promise<SearchHit[] | null> {
  const data = await post<{ results?: SearchHit[] }>("/search", {
    query,
    search_depth: "advanced",
    max_results: maxResults,
  });
  return data?.results ?? null;
}

/**
 * Pull readable text off a page. Used at onboarding: a company URL becomes a
 * purpose statement and a draft mandate without anyone typing a form.
 */
export async function extract(url: string): Promise<string | null> {
  const data = await post<{ results?: Array<{ raw_content?: string }> }>("/extract", {
    urls: [url],
  });
  const content = data?.results?.[0]?.raw_content;
  if (!content) return null;
  // Page text only feeds a summarisation prompt; a few thousand chars is plenty
  // and keeps the request well inside context.
  return content.slice(0, 6000);
}
