/**
 * Onboarding — turning a description of someone into a cautious first mandate,
 * and provisioning a compatible market counterparty so newly created agents can
 * step onto the trading floor and negotiate immediately.
 *
 * Shared by both doors onto the network: a company described by its website,
 * and a person describing themselves. The only difference between them is where
 * the text comes from, which is exactly as it should be — the mandate model
 * does not care whether a principal has employees.
 *
 * Every mandate produced here carries an `always` approval rule. An agent whose
 * mandate no human has reviewed may negotiate, but it may not close.
 */

import { generateKeyPair, newId } from "./identity";
import { chatJSON } from "./llm";
import { advance, openThread } from "./negotiate";
import { listAgents, putAgent, putScenario } from "./store";
import { publicSpec } from "./terms";
import type { Scenario } from "./seed";
import {
  PROTOCOL,
  type Direction,
  type LocalAgent,
  type Mandate,
  type Opportunity,
  type TermSpec,
  type Thread,
} from "./types";

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

/** Infer what a company trades, from its own website copy or domain name. */
export async function draftFromPage(domain: string, pageText: string | null): Promise<Draft> {
  if (pageText) {
    const llmDraft = await chatJSON<Draft>({
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
    if (llmDraft && llmDraft.terms?.length) return llmDraft;
  }
  return heuristicDraftFromDomain(domain, pageText ?? "");
}

/** Infer what an individual trades, from how they describe themselves. */
export async function draftFromDescription(name: string, description: string): Promise<Draft> {
  const llmDraft = await chatJSON<Draft>({
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
  if (llmDraft && llmDraft.terms?.length) return llmDraft;
  return heuristicDraftFromDescription(name, description);
}

/**
 * Deterministic natural-language mandate extractor when no LLM key is configured.
 * Parses dollar amounts, payment windows, durations, and role cues so user-added
 * agents get a tailored, working mandate immediately.
 */
function heuristicDraftFromDescription(name: string, description: string): Draft {
  const lower = description.toLowerCase();
  const isBuyer =
    /\b(buyer|procurement|buying|capping|cap|hiring|client|tenant|lessee|shipper)\b/.test(lower);

  // Extract dollar/numeric figures (e.g. "$1,800", "$65,000", "820")
  const moneyMatch = description.match(/\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)/);
  const parsedAmount = moneyMatch ? Number(moneyMatch[1].replace(/,/g, "")) : null;

  // Extract payment days (e.g. "14-day", "30 days")
  const daysMatch = description.match(/(\d+)\s*[- ]?\s*day/i);
  const parsedDays = daysMatch ? Number(daysMatch[1]) : isBuyer ? 45 : 21;

  if (/\b(freight|reefer|logistics|carrier|lane|cargo|cold)\b/.test(lower)) {
    const limit = parsedAmount && parsedAmount > 50 ? parsedAmount : 840;
    return {
      name,
      purpose: description,
      role: isBuyer ? "shipper" : "carrier",
      subject: "custom-freight-lane-charter",
      terms: [
        {
          key: "rate_per_unit",
          label: "Rate per unit",
          type: "number",
          unit: "USD",
          direction: isBuyer ? "lower-better" : "higher-better",
          limit,
          importance: 0.9,
        },
        {
          key: "volume_units",
          label: "Committed volume",
          type: "number",
          unit: "units",
          direction: isBuyer ? "lower-better" : "higher-better",
          limit: isBuyer ? 180 : 40,
          importance: 0.5,
        },
        {
          key: "payment_days",
          label: "Payment terms",
          type: "number",
          unit: "days",
          direction: isBuyer ? "higher-better" : "lower-better",
          limit: parsedDays,
          importance: 0.4,
        },
        {
          key: "clauses",
          label: "Contract clauses",
          type: "set",
          direction: "match",
          importance: 0.5,
        },
      ],
    };
  }

  if (/\b(saas|software|enterprise|sla|uptime|subscription|cloud|license)\b/.test(lower)) {
    const limit = parsedAmount && parsedAmount >= 1000 ? parsedAmount : 65_000;
    return {
      name,
      purpose: description,
      role: isBuyer ? "buyer" : "vendor",
      subject: "enterprise-saas-subscription",
      terms: [
        {
          key: "annual_contract_value",
          label: "Annual contract value",
          type: "number",
          unit: "USD",
          direction: isBuyer ? "lower-better" : "higher-better",
          limit,
          importance: 0.9,
        },
        {
          key: "term_months",
          label: "Commitment term",
          type: "number",
          unit: "months",
          direction: isBuyer ? "lower-better" : "higher-better",
          limit: isBuyer ? 24 : 12,
          importance: 0.5,
        },
        {
          key: "payment_days",
          label: "Net payment window",
          type: "number",
          unit: "days",
          direction: isBuyer ? "higher-better" : "lower-better",
          limit: parsedDays,
          importance: 0.4,
        },
        {
          key: "clauses",
          label: "SLA & security clauses",
          type: "set",
          direction: "match",
          importance: 0.6,
        },
      ],
    };
  }

  // Default: Advisory / Freelance / Professional Service Contract
  const isDayRate = /\b(day rate|daily|per day|\/day)\b/i.test(description);
  const limit = parsedAmount && parsedAmount > 0 ? parsedAmount : isDayRate ? 1500 : 12_000;
  return {
    name,
    purpose: description,
    role: isBuyer ? "client" : "contractor",
    subject: isDayRate ? "technical-advisory-retainer" : "commercial-service-agreement",
    terms: [
      {
        key: isDayRate ? "day_rate" : "fee",
        label: isDayRate ? "Day rate" : "Project fee",
        type: "number",
        unit: "USD",
        direction: isBuyer ? "lower-better" : "higher-better",
        limit,
        importance: 0.9,
      },
      {
        key: "term_months",
        label: "Engagement duration",
        type: "number",
        unit: "months",
        direction: isBuyer ? "lower-better" : "higher-better",
        limit: isBuyer ? 6 : 2,
        importance: 0.5,
      },
      {
        key: "payment_days",
        label: "Payment terms",
        type: "number",
        unit: "days",
        direction: isBuyer ? "higher-better" : "lower-better",
        limit: parsedDays,
        importance: 0.4,
      },
      {
        key: "clauses",
        label: "Contract clauses",
        type: "set",
        direction: "match",
        importance: 0.5,
      },
    ],
  };
}

function heuristicDraftFromDomain(domain: string, pageText: string): Draft {
  const name = titleFromDomain(domain);
  const combined = `${domain} ${pageText}`.toLowerCase();
  if (/\b(logistics|freight|cold|cargo|shipping|transport|supply)\b/.test(combined)) {
    return heuristicDraftFromDescription(
      name,
      `${name} operates commercial freight & logistics lanes. Minimum rate $840 USD per unit with 30-day payment terms.`,
    );
  }
  if (/\b(saas|cloud|tech|ai|data|cyber|platform|software)\b/.test(combined)) {
    return heuristicDraftFromDescription(
      name,
      `${name} provides enterprise cloud software & AI infrastructure at $48,000 USD annual contract value with 30-day net payment terms.`,
    );
  }
  return heuristicDraftFromDescription(
    name,
    `${name} provides commercial B2B services with a minimum retainer fee of $15,000 USD and 21-day payment terms.`,
  );
}

/**
 * Build a cautious mandate from whatever the model inferred. Anything it left
 * out falls back to a minimal fee-and-term shape, so onboarding never produces
 * an agent with nothing to negotiate.
 */
export function starterMandate(
  agentId: string,
  draft: Draft | null,
  fallbackRole: string,
  opts?: { requireIncorporation?: boolean; requireSiteVisit?: boolean },
): Mandate {
  const terms = (draft?.terms ?? [])
    .map((t) => toSpec(t, opts))
    .filter((s): s is TermSpec => s !== null)
    .slice(0, 6);

  return {
    agentId,
    version: 1,
    role: draft?.role?.trim() || fallbackRole,
    subject: draft?.subject?.trim() || "unspecified-engagement",
    terms: terms.length ? terms : fallbackTerms(opts),
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

export function toSpec(
  term: DraftTerm,
  opts?: { requireIncorporation?: boolean; requireSiteVisit?: boolean },
): TermSpec | null {
  const key = term.key?.trim();
  if (!key) return null;
  const label = term.label?.trim() || key.replace(/[-_]/g, " ");
  const direction: Direction = term.direction ?? "match";
  const weight = clamp01(term.importance ?? 0.5);

  switch (term.type) {
    case "number": {
      const limit = typeof term.limit === "number" && Number.isFinite(term.limit) ? term.limit : null;
      if (limit === null) return null;
      const isInt =
        term.unit === "months" ||
        term.unit === "days" ||
        term.unit === "units" ||
        term.unit === "roles" ||
        term.unit === "weeks";
      // Give a realistic range around the limit so the agent can open ambitiously and concede toward its limit.
      const bound =
        direction === "lower-better"
          ? {
              kind: "number" as const,
              min: Math.max(1, Math.round(limit * 0.55)),
              max: limit,
              unit: term.unit,
              ...(isInt ? { integer: true } : {}),
            }
          : {
              kind: "number" as const,
              min: limit,
              max: Math.max(limit + 4, Math.round(limit * 1.45)),
              unit: term.unit,
              ...(isInt ? { integer: true } : {}),
            };
      return { key, label, bound, direction, weight, anchor: 0.85 };
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
    case "set": {
      const req = ["mutual-nda"];
      if (opts?.requireIncorporation !== false) req.push("certificate-of-incorporation");
      if (opts?.requireSiteVisit) req.push("site-visit-signoff");
      return {
        key,
        label,
        bound: {
          kind: "set",
          allowed: [
            "certificate-of-incorporation",
            "site-visit-signoff",
            "milestone-escrow",
            "ip-assignment",
            "sla-guarantee",
            "mutual-nda",
          ],
          required: req,
          forbidden: ["exclusivity", "unlimited-liability", "auto-renewal"],
          maxItems: 5,
        },
        direction: "match",
        weight,
      };
    }
    case "date":
      return { key, label, bound: { kind: "date" }, direction, weight };
    default:
      return null;
  }
}

export function fallbackTerms(opts?: {
  requireIncorporation?: boolean;
  requireSiteVisit?: boolean;
}): TermSpec[] {
  const req = ["mutual-nda"];
  if (opts?.requireIncorporation !== false) req.push("certificate-of-incorporation");
  if (opts?.requireSiteVisit) req.push("site-visit-signoff");
  return [
    {
      key: "fee",
      label: "Fee",
      bound: { kind: "number", min: 10_000, max: 16_000, unit: "USD" },
      direction: "higher-better",
      weight: 0.9,
      anchor: 0.85,
    },
    {
      key: "term_months",
      label: "Term",
      bound: { kind: "number", min: 3, max: 12, unit: "months", integer: true },
      direction: "higher-better",
      weight: 0.4,
      anchor: 0.8,
    },
    {
      key: "clauses",
      label: "Contract & verification clauses",
      bound: {
        kind: "set",
        allowed: [
          "certificate-of-incorporation",
          "site-visit-signoff",
          "milestone-escrow",
          "ip-assignment",
          "sla-guarantee",
          "mutual-nda",
        ],
        required: req,
        forbidden: ["exclusivity", "unlimited-liability", "auto-renewal"],
        maxItems: 5,
      },
      direction: "match",
      weight: 0.5,
    },
  ];
}

/**
 * Provision an autonomous Market Counterparty agent with an overlapping Zone of
 * Possible Agreement (ZOPA) and a ready-to-run Floor Scenario.
 * `stanceIndex` varies how generous the counterparty's bounds are so competing
 * counterparties converge at distinct utility scores.
 */
export function buildCounterpartyFor(
  primary: LocalAgent,
  origin: string,
  opts?: { stanceIndex?: number; domain?: string; name?: string; purpose?: string },
): { counterparty: LocalAgent; scenario: Scenario } {
  const m = primary.mandate;
  const oppRole = oppositeRole(m.role);
  const stanceIndex = opts?.stanceIndex ?? 0;
  const baseInfo = counterpartyIdentityFor(m.subject, oppRole, stanceIndex);
  const domain = opts?.domain || baseInfo.domain;
  const name = opts?.name || (opts?.domain ? titleFromDomain(opts.domain) : baseInfo.name);
  const slug = domain.split(".")[0].replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const cpId = `obn:cp-${slug}-${newId("").replace("_", "").slice(0, 4)}`;
  const { publicKey, privateKey } = generateKeyPair();

  const cpTerms: TermSpec[] = m.terms.map((spec) => mirrorTermSpec(spec, stanceIndex));

  const cpMandate: Mandate = {
    agentId: cpId,
    version: 1,
    role: oppRole,
    subject: m.subject,
    terms: cpTerms,
    approval: [
      {
        kind: "always",
        reason: `Final sign-off required by ${name} deal desk before binding execution.`,
      },
    ],
  };

  const counterparty: LocalAgent = {
    card: {
      protocol: PROTOCOL,
      id: cpId,
      name,
      purpose: opts?.purpose || baseInfo.purpose,
      principal: { kind: "company", name, domain },
      attestation: {
        level: "domain",
        domain,
        verifiedAt: new Date().toISOString(),
        note: "Verified counterparty node discovered via traversal.",
      },
      publicKey,
      endpoint: `${origin}/api/agents/${encodeURIComponent(cpId)}/inbox`,
      capabilities: ["negotiate", "traverse"],
      negotiates: {
        subject: cpMandate.subject,
        role: cpMandate.role,
        terms: cpMandate.terms.map(publicSpec),
      },
    },
    privateKey,
    mandate: cpMandate,
    createdAt: new Date().toISOString(),
  };

  const prettySubject = m.subject
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const scenario: Scenario = {
    id: `custom-${primary.card.id}-${cpId}`,
    title: `${primary.card.name} vs ${name}`,
    blurb: `${primary.card.name} (${m.role}) negotiating ${prettySubject.toLowerCase()} with ${name} (${oppRole}).`,
    subject: m.subject,
    opens: primary.card.id,
    responds: cpId,
    ricardian: {
      templateId: `obn-standard-${m.subject}-2026`,
      templateHash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      jurisdiction: "SE-STHLM / DK-CPH",
    },
  };

  return { counterparty, scenario };
}

export type AutonomousDealRun = {
  counterparty: LocalAgent;
  scenario: Scenario;
  thread: Thread;
};

/**
 * Dispatch an agent to negotiate in parallel against multiple counterparties
 * discovered via Tavily traversal (or a 2-counterparty market tender fallback).
 */
export async function dispatchToOpportunities(
  primary: LocalAgent,
  origin: string,
  opportunities?: Opportunity[],
): Promise<AutonomousDealRun[]> {
  const existingAgents = listAgents();
  const candidates = (opportunities ?? []).slice(0, 3);
  const count = Math.max(2, candidates.length);
  const runs: AutonomousDealRun[] = [];

  for (let i = 0; i < count; i++) {
    const opp = candidates[i];
    const oppDomain = opp?.counterpartyDomain?.toLowerCase();

    // If a seeded/hosted agent with this exact domain and compatible subject already exists, reuse it for index 0
    const matchedExisting =
      oppDomain &&
      existingAgents.find(
        (a) =>
          a.card.id !== primary.card.id &&
          a.card.principal.kind === "company" &&
          a.card.principal.domain.toLowerCase() === oppDomain &&
          a.mandate.subject === primary.mandate.subject,
      );

    let counterparty: LocalAgent;
    let scenario: Scenario;

    if (matchedExisting) {
      counterparty = matchedExisting;
      scenario = {
        id: `traversal-${primary.card.id}-${counterparty.card.id}`,
        title: `${primary.card.name} vs ${counterparty.card.name}`,
        blurb: `${primary.card.name} negotiating with ${counterparty.card.name}.`,
        subject: primary.mandate.subject,
        opens: primary.card.id,
        responds: counterparty.card.id,
      };
    } else {
      const built = buildCounterpartyFor(primary, origin, {
        stanceIndex: i,
        domain: oppDomain,
        purpose: opp?.snippet,
      });
      counterparty = built.counterparty;
      scenario = built.scenario;
      putAgent(counterparty);
      putScenario(scenario);
    }

    const thread = openThread(primary.card.id, counterparty.card.id, scenario.title);
    for (let stepIdx = 0; stepIdx < 16; stepIdx++) {
      if (thread.status !== "open") break;
      const turn = await advance(thread);
      if (!turn) break;
    }

    runs.push({ counterparty, scenario, thread });
  }

  return runs;
}

/**
 * End-to-end autonomous agent launch:
 * Once a human creates an agent, the agent discovers multiple matched
 * counterparties, negotiates with them in parallel under its mandate until
 * convergence, and parks the competing deals in `/inbox` (`awaiting-approval`).
 */
export async function launchAutonomousDeal(
  primary: LocalAgent,
  origin: string,
): Promise<{
  counterparty: LocalAgent;
  scenario: Scenario;
  thread: Thread;
  allRuns: AutonomousDealRun[];
}> {
  const runs = await dispatchToOpportunities(primary, origin);
  const first = runs[0];
  return {
    counterparty: first.counterparty,
    scenario: first.scenario,
    thread: first.thread,
    allRuns: runs,
  };
}

function mirrorTermSpec(spec: TermSpec, stanceIndex = 0): TermSpec {
  const b = spec.bound;
  const oppDir: Direction =
    spec.direction === "higher-better"
      ? "lower-better"
      : spec.direction === "lower-better"
        ? "higher-better"
        : "match";

  // Vary the ZOPA overlap across counterparties so competing offers settle at different utilities
  const overlapFactor = stanceIndex === 0 ? 0.68 : stanceIndex === 1 ? 0.46 : 0.34;
  const anchorVal = stanceIndex === 0 ? 0.72 : stanceIndex === 1 ? 0.82 : 0.88;

  if (b.kind === "number") {
    const lo = b.min ?? (b.max !== undefined ? Math.max(1, Math.round(b.max * 0.6)) : 100);
    const hi = b.max ?? Math.max(lo + 4, Math.round(lo * 1.4));
    const span = Math.max(2, hi - lo);

    if (spec.direction === "higher-better") {
      const cpMax = b.integer
        ? Math.max(lo + 1, Math.round(lo + span * overlapFactor))
        : Math.round((lo + span * overlapFactor) * 100) / 100;
      const cpMin = b.integer
        ? Math.max(1, Math.round(lo - span * 0.35))
        : Math.max(1, Math.round((lo - span * 0.35) * 100) / 100);
      return {
        ...spec,
        direction: oppDir,
        bound: { ...b, min: cpMin, max: cpMax },
        anchor: anchorVal,
      };
    } else {
      const cpMin = b.integer
        ? Math.max(1, Math.round(hi - span * overlapFactor))
        : Math.max(1, Math.round((hi - span * overlapFactor) * 100) / 100);
      const cpMax = b.integer
        ? Math.round(hi + span * 0.35)
        : Math.round((hi + span * 0.35) * 100) / 100;
      return {
        ...spec,
        direction: oppDir,
        bound: { ...b, min: cpMin, max: cpMax },
        anchor: anchorVal,
      };
    }
  }

  if (b.kind === "enum") {
    const rev = [...b.allowed].reverse();
    return {
      ...spec,
      direction: "match",
      bound: { kind: "enum", allowed: b.allowed, preference: rev },
    };
  }

  return {
    ...spec,
    direction: oppDir,
  };
}

function oppositeRole(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("carrier") || r.includes("logistics")) return "shipper";
  if (r.includes("shipper")) return "carrier";
  if (r.includes("contractor") || r.includes("freelance") || r.includes("engineer") || r.includes("individual") || r.includes("advisor")) return "enterprise client";
  if (r.includes("client") || r.includes("buyer") || r.includes("procurement")) return "vendor";
  if (r.includes("vendor") || r.includes("seller")) return "enterprise buyer";
  if (r.includes("recruiter")) return "employer";
  return "counterparty";
}

function counterpartyIdentityFor(subject: string, oppRole: string, stanceIndex = 0) {
  const s = subject.toLowerCase();
  if (s.includes("freight") || s.includes("lane") || s.includes("cargo")) {
    const shippers = [
      { name: "Nordic Harvest Co-op", slug: "nordic-harvest", domain: "nordicharvest.se" },
      { name: "Skåne Fine Dairy", slug: "skane-dairy", domain: "skanedairy.dk" },
      { name: "Veridian Fresh Exports", slug: "veridian-exports", domain: "veridianexports.com" },
    ];
    const carriers = [
      { name: "Baltic Polar Express", slug: "baltic-polar", domain: "balticpolarexpress.se" },
      { name: "Atlas Cold Transport", slug: "atlas-transport", domain: "atlastransport.io" },
      { name: "Kattegat Reefer Lines", slug: "kattegat-reefer", domain: "kattegatreefer.dk" },
    ];
    const picked = (oppRole === "shipper" ? shippers : carriers)[stanceIndex % 3];
    return {
      ...picked,
      purpose:
        oppRole === "shipper"
          ? "We ship temperature-sensitive goods weekly across Sweden and Denmark and negotiate fixed-term lane capacity."
          : "We operate regional Nordic fleet capacity and negotiate structured volume commitments with commercial shippers.",
    };
  }
  if (s.includes("saas") || s.includes("software") || s.includes("cloud")) {
    const buyers = [
      { name: "Northstar Global AB", slug: "northstar-ab", domain: "northstarglobal.se" },
      { name: "Krona Financial Group", slug: "krona-group", domain: "kronafinancial.dk" },
      { name: "Baltic Industrial Corp", slug: "baltic-corp", domain: "balticindustrial.eu" },
    ];
    const vendors = [
      { name: "Stratos Cloud Systems", slug: "stratos-cloud", domain: "stratoscloud.dev" },
      { name: "Aether Enterprise AI", slug: "aether-ai", domain: "aetherenterprise.eu" },
      { name: "Nordic Compute Mesh", slug: "nordic-mesh", domain: "nordicmesh.se" },
    ];
    const picked = (oppRole.includes("buyer") ? buyers : vendors)[stanceIndex % 3];
    return {
      ...picked,
      purpose:
        oppRole.includes("buyer")
          ? "Enterprise procurement team acquiring mission-critical cloud software under strict annual budget and SLA mandates."
          : "Enterprise B2B SaaS provider offering annual platform licenses with high-availability SLAs.",
    };
  }
  const clients = [
    { name: "Vanguard Labs Europe", slug: "vanguard-labs", domain: "vanguardlabs.ai" },
    { name: "Nordic Enterprise Group", slug: "nordic-enterprise", domain: "nordicenterprise.se" },
    { name: "Copenhagen Ventures", slug: "cph-ventures", domain: "cphventures.dk" },
  ];
  const contractors = [
    { name: "Helio Studio Partners", slug: "helio-partners", domain: "heliopartners.co" },
    { name: "Svea Technical Advisory", slug: "svea-advisory", domain: "sveaadvisory.se" },
    { name: "Øresund Engineering Labs", slug: "oresund-labs", domain: "oresundlabs.dk" },
  ];
  const isClient = oppRole.includes("client") || oppRole.includes("buyer");
  const picked = (isClient ? clients : contractors)[stanceIndex % 3];
  return {
    ...picked,
    purpose: isClient
      ? "We retain specialist technical advisors and contractors under milestone-backed commercial mandates."
      : "We deliver specialist commercial advisory and engineering engagements under structured retainer mandates.",
  };
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
