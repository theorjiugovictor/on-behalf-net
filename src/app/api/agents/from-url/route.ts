/**
 * Onboarding from nothing but a URL — the QR-code moment.
 *
 * Read the company's own site, work out what it actually trades and on which
 * terms, mint a keypair, and the agent is live. Because a mandate is data, the
 * inferred term vocabulary can be anything: a day rate, a licence territory, a
 * delivery window. Nothing here is specialised to an industry.
 *
 * The draft mandate is deliberately cautious — a human widens it afterwards,
 * which is the right direction for a governance default to fail in.
 */

import { NextResponse } from "next/server";
import { agentIdForDomain, generateKeyPair } from "@/lib/identity";
import { chatJSON } from "@/lib/llm";
import { extract } from "@/lib/tavily";
import { getCard, putAgent } from "@/lib/store";
import { publicSpec } from "@/lib/terms";
import {
  PROTOCOL,
  type Direction,
  type LocalAgent,
  type Mandate,
  type TermSpec,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type DraftTerm = {
  key?: string;
  label?: string;
  type?: "number" | "date" | "enum" | "set" | "boolean";
  unit?: string;
  options?: string[];
  /** Which way this company wants the term to move. */
  direction?: Direction;
  /** The edge of what a cautious first mandate should allow. */
  limit?: number;
  importance?: number;
};

type Draft = {
  name?: string;
  purpose?: string;
  role?: string;
  subject?: string;
  terms?: DraftTerm[];
};

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const raw = body.url?.trim();
  if (!raw) return NextResponse.json({ error: "Provide a company `url`." }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: `"${raw}" is not a valid URL.` }, { status: 400 });
  }

  const domain = url.hostname.replace(/^www\./, "");
  const id = agentIdForDomain(domain);
  if (getCard(id)) {
    return NextResponse.json({ error: `An agent for ${domain} already exists.` }, { status: 409 });
  }

  const pageText = await extract(url.toString());
  const draft = pageText ? await draftFromPage(domain, pageText) : null;

  const name = draft?.name?.trim() || titleFromDomain(domain);
  const purpose =
    draft?.purpose?.trim() ||
    `${name} trades on the open market. This agent's purpose has not yet been ` +
      `reviewed by a human — confirm it before the agent commits to anything.`;

  const mandate = starterMandate(id, draft);
  const { publicKey, privateKey } = generateKeyPair();
  const origin = process.env.OBN_PUBLIC_URL ?? new URL(req.url).origin;

  const agent: LocalAgent = {
    card: {
      protocol: PROTOCOL,
      id,
      name,
      domain,
      purpose,
      publicKey,
      endpoint: `${origin}/api/agents/${encodeURIComponent(id)}/inbox`,
      capabilities: ["negotiate", "traverse"],
      negotiates: {
        subject: mandate.subject,
        role: mandate.role,
        terms: mandate.terms.map(publicSpec),
      },
    },
    privateKey,
    mandate,
    createdAt: new Date().toISOString(),
  };

  putAgent(agent);

  return NextResponse.json(
    {
      created: true,
      card: agent.card,
      mandate: agent.mandate,
      drafted: Boolean(draft),
      readSite: Boolean(pageText),
      notice:
        "This mandate is a conservative draft and every deal it reaches will stop " +
        "for a human. Review the terms and widen it before the agent negotiates " +
        "anything that matters.",
    },
    { status: 201 },
  );
}

async function draftFromPage(domain: string, pageText: string): Promise<Draft | null> {
  return chatJSON<Draft>({
    system:
      `You are setting up a commercial agent for the company at ${domain}. From the ` +
      `page text, work out what this company trades and the terms a deal with them ` +
      `would actually turn on. Those terms differ by industry: a logistics firm ` +
      `negotiates rate and volume, a recruiter negotiates fee and guarantee period, ` +
      `a licensor negotiates territory and royalty. Infer the ones that fit.\n\n` +
      `Reply with JSON only:\n` +
      `{"name":string,"purpose":string,"role":string,"subject":string,` +
      `"terms":[{"key":string,"label":string,"type":"number"|"date"|"enum"|"set"|"boolean",` +
      `"unit":string,"options":string[],"direction":"higher-better"|"lower-better"|"match",` +
      `"limit":number,"importance":number}]}\n\n` +
      `"purpose": two or three sentences in the company's own voice.\n` +
      `"role": this company's side, e.g. "carrier", "recruiter", "licensor".\n` +
      `"subject": short lowercase-hyphenated name for what is being traded.\n` +
      `"terms": three to six terms. "direction" is which way THIS company wants it ` +
      `to move. "limit" is the edge of what a cautious first mandate should permit ` +
      `for a number term (a floor when higher is better, a ceiling when lower is ` +
      `better). "importance" is 0 to 1. "unit" and "options" only where they apply.`,
    user: pageText,
    temperature: 0.3,
    maxTokens: 1200,
  });
}

/**
 * Build a cautious mandate from whatever the model inferred. Anything it left
 * out falls back to a minimal fee-and-term shape, so onboarding never produces
 * an agent with nothing to negotiate.
 */
function starterMandate(agentId: string, draft: Draft | null): Mandate {
  const terms = (draft?.terms ?? [])
    .map(toSpec)
    .filter((s): s is TermSpec => s !== null)
    .slice(0, 6);

  return {
    agentId,
    version: 1,
    role: draft?.role?.trim() || "counterparty",
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

function toSpec(term: DraftTerm): TermSpec | null {
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

function fallbackTerms(): TermSpec[] {
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
        forbidden: ["exclusivity", "unlimited-liability", "auto-renewal"],
        maxItems: 4,
      },
      direction: "match",
      weight: 0.5,
    },
  ];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));

function titleFromDomain(domain: string): string {
  return domain
    .split(".")[0]
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
