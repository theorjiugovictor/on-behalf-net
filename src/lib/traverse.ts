/**
 * Traversal — reading the open web for counterparties worth approaching.
 *
 * This is the layer that makes an agent useful with nobody else in the room.
 * Tavily supplies the reading; the model turns hits into opportunities scored
 * against this agent's mandate. Without either, fixtures keep the shape intact.
 */

import { chatJSON } from "./llm";
import { search } from "./tavily";
import { fixtureOpportunities } from "./seed";
import { newId } from "./identity";
import type { LocalAgent, Opportunity } from "./types";

export type TraversalResult = {
  opportunities: Opportunity[];
  queries: string[];
  /** "live" when Tavily answered; "fixture" when we fell back. */
  source: "live" | "fixture";
};

/**
 * Search terms derived from what the agent is mandated to do. The mandate's
 * subject and the headline term it fights hardest for are enough to steer a
 * search in any industry, without the query builder knowing which one it is in.
 */
export function queriesFor(agent: LocalAgent): string[] {
  const { mandate, card } = agent;
  const subject = mandate.subject.replace(/[-_]/g, " ");
  const headline = [...mandate.terms].sort((a, b) => b.weight - a.weight)[0];
  const company = card.domain.split(".")[0];

  return [
    `companies looking for ${subject}`,
    `${subject} ${mandate.role} market ${headline ? headline.label.toLowerCase() : "terms"}`,
    `${subject} deals announced ${company}`,
  ];
}

export async function traverse(agent: LocalAgent, limit = 6): Promise<TraversalResult> {
  const queries = queriesFor(agent);
  const batches = await Promise.all(queries.map((q) => search(q, 5)));
  const hits = batches.flatMap((b) => b ?? []);

  if (hits.length === 0) {
    return {
      opportunities: fixtureOpportunities(agent.card.id).slice(0, limit),
      queries,
      source: "fixture",
    };
  }

  // De-duplicate by URL; different queries surface the same page constantly.
  const seen = new Set<string>();
  const unique = hits.filter((h) => !seen.has(h.url) && seen.add(h.url)).slice(0, 12);

  const ranked = await chatJSON<{ opportunities?: Array<Partial<Opportunity>> }>({
    system:
      `You screen web results for ${agent.card.name}.\n\n` +
      `What they do: ${agent.card.purpose}\n` +
      `They act as the ${agent.mandate.role} side of "${agent.mandate.subject}".\n\n` +
      `Keep only results that could plausibly lead to a commercial conversation. ` +
      `Discard general news with no counterparty behind it. For each kept result, ` +
      `say in one sentence why it is worth this company's time, and score it 0-1.\n\n` +
      `Reply with JSON only: {"opportunities":[{"url":string,"title":string,` +
      `"reason":string,"score":number}]}`,
    user: unique
      .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.content.slice(0, 300)}`)
      .join("\n\n"),
    temperature: 0.3,
    maxTokens: 1200,
  });

  const byUrl = new Map(unique.map((h) => [h.url, h]));
  const scored = (ranked?.opportunities ?? [])
    .filter((o) => o.url && byUrl.has(o.url))
    .map<Opportunity>((o) => {
      const hit = byUrl.get(o.url!)!;
      return {
        id: newId("opp"),
        title: o.title || hit.title,
        url: hit.url,
        snippet: hit.content.slice(0, 280),
        reason: o.reason || "Matches this agent's mandate.",
        score: clamp01(typeof o.score === "number" ? o.score : hit.score),
        counterpartyDomain: safeHost(hit.url),
      };
    });

  // No model, or it screened everything out: fall back to raw relevance so the
  // agent still reports something it actually read.
  const opportunities = scored.length
    ? scored
    : unique.slice(0, limit).map<Opportunity>((hit) => ({
        id: newId("opp"),
        title: hit.title,
        url: hit.url,
        snippet: hit.content.slice(0, 280),
        reason: "Surfaced by search relevance; not yet screened against the mandate.",
        score: clamp01(hit.score),
        counterpartyDomain: safeHost(hit.url),
      }));

  return {
    opportunities: opportunities.sort((a, b) => b.score - a.score).slice(0, limit),
    queries,
    source: "live",
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
