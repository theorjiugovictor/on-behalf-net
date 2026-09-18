/**
 * Onboarding — turning a description of someone into a cautious first mandate.
 *
 * Shared by both doors onto the network: a company described by its website,
 * and a person describing themselves. The only difference between them is where
 * the text comes from, which is exactly as it should be — the mandate model
 * does not care whether a principal has employees.
 *
 * Every mandate produced here carries an `always` approval rule. An agent whose
 * mandate no human has reviewed may negotiate, but it may not close.
 */

import { chatJSON } from "./llm";
import type { Direction, Mandate, TermSpec } from "./types";

export type DraftTerm = {
  key?: string;
  label?: string;
  type?: "number" | "date" | "enum" | "set" | "boolean";
  unit?: string;
  options?: string[];
  /** Which way this principal wants the term to move. */
  direction?: Direction;
  /** The edge of what a cautious first mandate should allow. */
  limit?: number;
  importance?: number;
};

export type Draft = {
  name?: string;
  purpose?: string;
  role?: string;
  subject?: string;
  terms?: DraftTerm[];
};

const SCHEMA =
  `Reply with JSON only:\n` +
  `{"name":string,"purpose":string,"role":string,"subject":string,` +
  `"terms":[{"key":string,"label":string,"type":"number"|"date"|"enum"|"set"|"boolean",` +
  `"unit":string,"options":string[],"direction":"higher-better"|"lower-better"|"match",` +
  `"limit":number,"importance":number}]}\n\n` +
  `"subject": short lowercase-hyphenated name for what is being traded.\n` +
  `"terms": three to six terms. "direction" is which way THIS side wants it to ` +
  `move. "limit" is the edge of what a cautious first mandate should permit for ` +
  `a number term (a floor when higher is better, a ceiling when lower is ` +
  `better). "importance" is 0 to 1. "unit" and "options" only where they apply.`;

/** Infer what a company trades, from its own website copy. */
export async function draftFromPage(domain: string, pageText: string): Promise<Draft | null> {
  return chatJSON<Draft>({
    system:
      `You are setting up a commercial agent for the company at ${domain}. From the ` +
      `page text, work out what this company trades and the terms a deal with them ` +
      `would actually turn on. Those terms differ by industry: a logistics firm ` +
      `negotiates rate and volume, a recruiter negotiates fee and guarantee period, ` +
      `a licensor negotiates territory and royalty. Infer the ones that fit.\n\n` +
      SCHEMA +
      `\n\n"purpose": two or three sentences in the company's own voice.\n` +
      `"role": this company's side, e.g. "carrier", "recruiter", "licensor".`,
    user: pageText,
    temperature: 0.3,
    maxTokens: 1200,
  });
}

/** Infer what an individual trades, from how they describe themselves. */
export async function draftFromDescription(name: string, description: string): Promise<Draft | null> {
  return chatJSON<Draft>({
    system:
      `You are setting up an agent that will negotiate on behalf of ${name}, an ` +
      `individual rather than a company. From their own description, work out what ` +
      `they are trading and the terms a deal would turn on — a freelancer ` +
      `negotiates a day rate and a start date, a tenant negotiates rent and a ` +
      `break clause, a musician negotiates a fee and a territory. Infer the ones ` +
      `that fit, and set cautious limits: this person has less room to absorb a ` +
      `bad deal than a company does.\n\n` +
      SCHEMA +
      `\n\n"purpose": two or three sentences in their own voice.\n` +
      `"role": their side of it, e.g. "contractor", "tenant", "performer".`,
    user: description,
    temperature: 0.3,
    maxTokens: 1000,
  });
}

/**
 * Build a cautious mandate from whatever the model inferred. Anything it left
 * out falls back to a minimal fee-and-term shape, so onboarding never produces
 * an agent with nothing to negotiate.
 */
export function starterMandate(agentId: string, draft: Draft | null, fallbackRole: string): Mandate {
  const terms = (draft?.terms ?? [])
    .map(toSpec)
    .filter((s): s is TermSpec => s !== null)
    .slice(0, 6);

  return {
    agentId,
    version: 1,
    role: draft?.role?.trim() || fallbackRole,
    subject: draft?.subject?.trim() || "unspecified-engagement",
    terms: terms.length ? terms : fallbackTerms(),
    // Everything stops for a human until someone deliberately relaxes this.
    approval: [
      {
        kind: "always",
        reason:
          "This agent's mandate has not been reviewed by a human yet, so nothing it " +
          "agrees to is binding until someone signs it off.",
      },
    ],
  };
}

export function toSpec(term: DraftTerm): TermSpec | null {
  const key = term.key?.trim();
  if (!key) return null;
  const label = term.label?.trim() || key.replace(/[-_]/g, " ");
  const direction: Direction = term.direction ?? "match";
  const weight = clamp01(term.importance ?? 0.5);

  switch (term.type) {
    case "number": {
      const limit = typeof term.limit === "number" && Number.isFinite(term.limit) ? term.limit : null;
      if (limit === null) return null;
      // A floor when higher is better, a ceiling when lower is better.
      const bound =
        direction === "lower-better"
          ? { kind: "number" as const, max: limit, unit: term.unit }
          : { kind: "number" as const, min: limit, unit: term.unit };
      return { key, label, bound, direction, weight };
    }
    case "enum": {
      const allowed = (term.options ?? []).filter((o) => typeof o === "string" && o.trim());
      if (allowed.length === 0) return null;
      return {
        key,
        label,
        bound: { kind: "enum", allowed, preference: allowed },
        direction: "match",
        weight,
      };
    }
    case "boolean":
      return { key, label, bound: { kind: "boolean" }, direction, weight };
    case "set":
      return {
        key,
        label,
        // No allowlist means nothing may be added. An unreviewed mandate should
        // not let an agent agree to clauses a model invented.
        bound: {
          kind: "set",
          allowed: [],
          forbidden: ["exclusivity", "unlimited-liability", "auto-renewal"],
          maxItems: 4,
        },
        direction: "match",
        weight,
      };
    case "date":
      return { key, label, bound: { kind: "date" }, direction, weight };
    default:
      return null;
  }
}

export function fallbackTerms(): TermSpec[] {
  return [
    {
      key: "fee",
      label: "Fee",
      bound: { kind: "number", min: 1, unit: "USD" },
      direction: "higher-better",
      weight: 0.9,
    },
    {
      key: "term_months",
      label: "Term",
      bound: { kind: "number", min: 1, max: 12, unit: "months", integer: true },
      direction: "higher-better",
      weight: 0.4,
    },
    {
      key: "clauses",
      label: "Contract clauses",
      bound: {
        kind: "set",
        allowed: [],
        forbidden: ["exclusivity", "unlimited-liability", "auto-renewal"],
        maxItems: 4,
      },
      direction: "match",
      weight: 0.5,
    },
  ];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));

export function titleFromDomain(domain: string): string {
  return domain
    .split(".")[0]
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
