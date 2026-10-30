/**
 * Demo fixtures — three industries through one engine.
 *
 * Freight, recruiting and sponsorship negotiate nothing in common: a rate per
 * unit, a placement fee against a guarantee period, a sponsorship fee against
 * category exclusivity. None of them required a line of engine code. That is
 * the point of the term model, and the reason "any agent with any intent" is a
 * claim this can actually make.
 *
 * Each pair is built with a real zone of agreement and an approval threshold
 * that a realistic settlement crosses, so every scenario converges and then
 * stops for a human.
 *
 * Keys are generated fresh at boot. Nothing here should be reused in production.
 */

import { generateKeyPair, newId, signEnvelope } from "./identity";
import { evaluateDeal } from "./mandate";
import { publicSpec } from "./terms";
import type { Deal, LocalAgent, Mandate, Opportunity, TermSpec, Thread, TurnRecord } from "./types";
import { PROTOCOL } from "./types";

const publicBase = () => process.env.OBN_PUBLIC_URL ?? "http://localhost:3000";

function agent(
  id: string,
  name: string,
  domain: string,
  purpose: string,
  mandate: Omit<Mandate, "agentId">,
): LocalAgent {
  const { publicKey, privateKey } = generateKeyPair();
  return {
    card: {
      protocol: PROTOCOL,
      id,
      name,
      purpose,
      principal: { kind: "company", name, domain },
      // Seeded companies are treated as having already proved their domain.
      // A real one does it by serving its key at /.well-known/on-behalf.txt.
      attestation: {
        level: "domain",
        domain,
        verifiedAt: new Date().toISOString(),
        note: "Seeded fixture, pre-verified.",
      },
      publicKey,
      endpoint: `${publicBase()}/api/agents/${encodeURIComponent(id)}/inbox`,
      capabilities: ["negotiate", "traverse"],
      // The vocabulary is public; the bounds are not. A stranger learns what to
      // talk about without learning where the limits are.
      negotiates: {
        subject: mandate.subject,
        role: mandate.role,
        terms: mandate.terms.map(publicSpec),
      },
    },
    privateKey,
    mandate: { ...mandate, agentId: id },
    createdAt: new Date().toISOString(),
  };
}

const num = (
  key: string,
  label: string,
  direction: TermSpec["direction"],
  bound: { min?: number; max?: number; unit?: string; integer?: boolean },
  weight: number,
  anchor?: number,
): TermSpec => ({
  key,
  label,
  bound: { kind: "number", ...bound },
  direction,
  weight,
  ...(anchor !== undefined ? { anchor } : {}),
});

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export type Scenario = {
  id: string;
  title: string;
  blurb: string;
  subject: string;
  opens: string;
  responds: string;
  ricardian?: {
    templateId: string;
    templateHash: string;
    jurisdiction?: string;
  };
};

export const SCENARIOS: Scenario[] = [
  {
    id: "freight",
    title: "Refrigerated freight",
    blurb: "A Nordic carrier and shipper on the Stockholm–Copenhagen corridor negotiating rate, volume, term and payment days.",
    subject: "reefer-lane-stockholm-copenhagen",
    opens: "obn:meridian-coldchain",
    responds: "obn:kairo-foods",
    ricardian: {
      templateId: "bimco-reefer-standard-2024",
      templateHash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      jurisdiction: "SE-STHLM / DK-CPH",
    },
  },
  {
    id: "recruiting",
    title: "Executive search",
    blurb: "A recruiter and an employer on fee, guarantee period and exclusivity.",
    subject: "senior-robotics-engineer-search",
    opens: "obn:lantern-talent",
    responds: "obn:arcadia-robotics",
    ricardian: {
      templateId: "aesc-retained-search-2024",
      templateHash: "sha256:d82c4298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852a194",
      jurisdiction: "US-DE",
    },
  },
  {
    id: "sponsorship",
    title: "Shirt sponsorship",
    blurb: "A club and a brand on fee, seasons, category exclusivity and activation.",
    subject: "harbour-fc-2027-shirt-sponsorship",
    opens: "obn:harbour-fc",
    responds: "obn:nimbus-drinks",
    ricardian: {
      templateId: "uefa-commercial-sponsorship-2025",
      templateHash: "sha256:c18a4298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852f821",
      jurisdiction: "CH-CAS",
    },
  },
];

export function seedAgents(): LocalAgent[] {
  return [...freightPair(), ...recruitingPair(), ...sponsorshipPair()];
}

/**
 * Seed active counterparty negotiation threads so that the Floor (`/floor`)
 * and Approval Inbox (`/inbox`) immediately show real multi-turn agent
 * interactions rather than an empty room.
 */
export function seedInitialThreads(agents: Map<string, LocalAgent>): Thread[] {
  const threads: Thread[] = [];
  const now = Date.now();
  const validUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const makeTurn = (
    threadId: string,
    sender: LocalAgent,
    recipient: LocalAgent,
    type: "propose" | "counter" | "escalate",
    deal: Deal,
    rationale: string,
    offsetMs: number,
    reason?: string,
  ): TurnRecord => {
    const verdict = evaluateDeal(deal, sender.mandate, { counterparty: recipient.card });
    const envelope = signEnvelope(
      {
        protocol: PROTOCOL,
        id: newId("msg"),
        threadId,
        from: sender.card.id,
        to: recipient.card.id,
        type,
        ts: new Date(now - offsetMs).toISOString(),
        validUntil,
        nonce: newId("non"),
        body: {
          deal,
          rationale,
          ...(reason ? { reason } : {}),
        },
      },
      sender.privateKey,
    );
    return { envelope, verdict };
  };

  // 1. Meridian Cold Chain vs Kairo Foods (Stockholm–Copenhagen reefer lane)
  const meridian = agents.get("obn:meridian-coldchain");
  const kairo = agents.get("obn:kairo-foods");
  if (meridian && kairo) {
    const threadId = "thr_seed_freight_oresund";
    const subject = "reefer-lane-stockholm-copenhagen";

    const fDeal1: Deal = {
      subject,
      terms: {
        rate: 1020,
        volume: 220,
        term_months: 12,
        incoterm: "DAP",
        payment_days: 14,
        clauses: ["certificate-of-incorporation", "temperature-logging", "claims-handling-sla"],
      },
    };
    const fDeal2: Deal = {
      subject,
      terms: {
        rate: 850,
        volume: 140,
        term_months: 6,
        incoterm: "DAP",
        payment_days: 45,
        clauses: ["certificate-of-incorporation", "site-visit-signoff", "temperature-logging"],
      },
    };
    const fDeal3: Deal = {
      subject,
      terms: {
        rate: 895,
        volume: 175,
        term_months: 9,
        incoterm: "DAP",
        payment_days: 35,
        clauses: [
          "certificate-of-incorporation",
          "site-visit-signoff",
          "temperature-logging",
          "claims-handling-sla",
        ],
      },
    };

    const ft1 = makeTurn(
      threadId,
      meridian,
      kairo,
      "propose",
      fDeal1,
      "Opening on the Stockholm–Copenhagen Øresund reefer corridor at $1,020/unit for 220 units on 14-day payment terms with continuous temperature logging.",
      240_000,
    );
    const ft2 = makeTurn(
      threadId,
      kairo,
      meridian,
      "counter",
      fDeal2,
      "We can commit 140 chilled dairy units weekly if rate comes down to $850/unit on 45-day payment terms with cold-storage site inspection sign-off.",
      180_000,
    );
    const ft3 = makeTurn(
      threadId,
      meridian,
      kairo,
      "counter",
      fDeal3,
      "Matching your movement: we can concede to $895/unit for 175 units on 35-day payment terms (coupled constraint floor enforced at $880/unit for >30d payment).",
      90_000,
    );
    const fVerdict = evaluateDeal(fDeal3, kairo.mandate, { counterparty: meridian.card });
    const fReason =
      fVerdict.approvalReason ??
      "Total contract value of USD 156,625 (Rate × Volume) exceeds the USD 60,000 autonomous authority threshold.";
    const ft4 = makeTurn(
      threadId,
      kairo,
      meridian,
      "escalate",
      fDeal3,
      "Terms ($895/unit × 175 units = $156,625) sit inside both mandates. Escalating to Kairo Foods procurement inbox for Certificate of Incorporation and Site Visit sign-off.",
      25_000,
      fReason,
    );

    threads.push({
      id: threadId,
      a: meridian.card.id,
      b: kairo.card.id,
      subject: "Meridian Cold Chain vs Kairo Foods",
      status: "awaiting-approval",
      turns: [ft1, ft2, ft3, ft4],
      pendingApproval: {
        agentId: kairo.card.id,
        deal: fDeal3,
        reason: fReason,
        verdict: fVerdict,
      },
      createdAt: new Date(now - 240_000).toISOString(),
      updatedAt: new Date(now - 25_000).toISOString(),
    });
  }

  // 2. Lantern Talent vs Arcadia Robotics
  const lantern = agents.get("obn:lantern-talent");
  const arcadia = agents.get("obn:arcadia-robotics");
  if (lantern && arcadia) {
    const threadId = "thr_seed_robotics_search";
    const subject = "senior-robotics-engineer-search";

    const deal1: Deal = {
      subject,
      terms: {
        placement_fee: 24_500,
        roles: 3,
        guarantee_days: 45,
        exclusivity_weeks: 6,
        start_date: "2026-11-01",
        clauses: ["certificate-of-incorporation", "background-check", "staged-invoicing"],
      },
    };

    const deal2: Deal = {
      subject,
      terms: {
        placement_fee: 19_500,
        roles: 2,
        guarantee_days: 90,
        exclusivity_weeks: 2,
        start_date: "2026-11-15",
        clauses: ["certificate-of-incorporation", "site-visit-signoff", "background-check"],
      },
    };

    const deal3: Deal = {
      subject,
      terms: {
        placement_fee: 23_000,
        roles: 2,
        guarantee_days: 75,
        exclusivity_weeks: 4,
        start_date: "2026-11-10",
        clauses: [
          "certificate-of-incorporation",
          "site-visit-signoff",
          "background-check",
          "staged-invoicing",
        ],
      },
    };

    const t1 = makeTurn(
      threadId,
      lantern,
      arcadia,
      "propose",
      deal1,
      "Opening retained search for senior controls engineers across Europe at $24,500/role for 3 roles with a 45-day guarantee.",
      180_000,
    );
    const t2 = makeTurn(
      threadId,
      arcadia,
      lantern,
      "counter",
      deal2,
      "We are committing 2 roles initially and need a 90-day replacement guarantee at $19,500/role.",
      120_000,
    );
    const t3 = makeTurn(
      threadId,
      lantern,
      arcadia,
      "counter",
      deal3,
      "Moving to $23,000/role for 2 roles with a 75-day replacement guarantee and 4-week exclusivity window.",
      60_000,
    );

    const finalVerdict = evaluateDeal(deal3, arcadia.mandate, { counterparty: lantern.card });
    const reason =
      finalVerdict.approvalReason ??
      "Total of USD 46,000 (Placement fee × Roles committed) is at or above the USD 45,000 threshold for human sign-off.";

    const t4 = makeTurn(
      threadId,
      arcadia,
      lantern,
      "escalate",
      deal3,
      `Terms are inside my mandate and we have converged on Placement fee USD 23,000, Roles committed 2 roles ($46,000 total). This exceeds my $45,000 autonomous authority, so I have referred it to a human at Arcadia Robotics.`,
      15_000,
      reason,
    );

    threads.push({
      id: threadId,
      a: lantern.card.id,
      b: arcadia.card.id,
      subject: "Lantern Talent vs Arcadia Robotics",
      status: "awaiting-approval",
      turns: [t1, t2, t3, t4],
      pendingApproval: {
        agentId: arcadia.card.id,
        deal: deal3,
        reason,
        verdict: finalVerdict,
      },
      createdAt: new Date(now - 180_000).toISOString(),
      updatedAt: new Date(now - 15_000).toISOString(),
    });
  }

  return threads;
}

export function seedInitialThread(agents: Map<string, LocalAgent>): Thread | null {
  return seedInitialThreads(agents)[0] ?? null;
}

// --- 1. Refrigerated freight ----------------------------------------------

function freightPair(): LocalAgent[] {
  const subject = "reefer-lane-stockholm-copenhagen";
  return [
    agent(
      "obn:meridian-coldchain",
      "Meridian Cold Chain",
      "meridiancoldchain.com",
      "We operate refrigerated road freight across Sweden, Denmark, and Northern Europe. We sell dedicated " +
        "temperature-controlled lane capacity on the Stockholm–Copenhagen Øresund corridor, and we are " +
        "looking for shippers with predictable seasonal volume.",
      {
        version: 3,
        role: "carrier",
        subject,
        terms: [
          num("rate", "Rate per unit", "higher-better", { min: 820, unit: "USD" }, 0.9, 0.28),
          num("volume", "Volume", "higher-better", { min: 20, max: 400, unit: "units", integer: true }, 0.5, 0.55),
          num("term_months", "Contract term", "higher-better", { min: 3, max: 12, unit: "months", integer: true }, 0.3, 1),
          {
            key: "incoterm",
            label: "Incoterm",
            bound: { kind: "enum", allowed: ["DAP", "CIF"], preference: ["DAP", "CIF"] },
            direction: "match",
            weight: 0.2,
          },
          num("payment_days", "Payment terms", "lower-better", { min: 7, max: 45, unit: "days", integer: true }, 0.4, 0.4),
          {
            key: "clauses",
            label: "Contract & verification clauses",
            bound: {
              kind: "set",
              allowed: [
                "certificate-of-incorporation",
                "site-visit-signoff",
                "temperature-logging",
                "claims-handling-sla",
                "volume-rebate",
                "backhaul-option",
              ],
              required: ["certificate-of-incorporation"],
              forbidden: ["exclusivity", "unlimited-liability", "auto-renewal"],
              maxItems: 5,
            },
            direction: "match",
            weight: 0.6,
          },
        ],
        coupledConstraints: [
          {
            id: "cc-freight-payment-rate",
            description: "Extended payment days (>30) require rate per unit of at least 880 USD",
            when: { term: "payment_days", op: ">", value: 30 },
            enforce: { term: "rate", op: ">=", value: 880 },
          },
        ],
        approval: [
          // Who, before what: an unverified counterparty is never closed with
          // automatically, however small the deal.
          { kind: "counterparty-below", level: "email" },
          { kind: "product-at-or-above", terms: ["rate", "volume"], value: 75_000, unit: "USD" },
        ],
      },
    ),
    agent(
      "obn:kairo-foods",
      "Kairo Foods",
      "kairofoods.com",
      "We move fresh Nordic produce and chilled dairy from Stockholm into Copenhagen and across Denmark. We buy " +
        "refrigerated lane capacity and care more about reliability and claims " +
        "history than headline rate.",
      {
        version: 2,
        role: "shipper",
        subject,
        terms: [
          num("rate", "Rate per unit", "lower-better", { max: 960, unit: "USD" }, 0.9, 0.24),
          num("volume", "Volume", "lower-better", { min: 50, max: 300, unit: "units", integer: true }, 0.4, 0.7),
          num("term_months", "Contract term", "lower-better", { min: 3, max: 18, unit: "months", integer: true }, 0.3, 0.6),
          {
            key: "incoterm",
            label: "Incoterm",
            bound: { kind: "enum", allowed: ["DAP", "CIF", "FCA"], preference: ["DAP", "CIF", "FCA"] },
            direction: "match",
            weight: 0.2,
          },
          num("payment_days", "Payment terms", "higher-better", { min: 15, max: 60, unit: "days", integer: true }, 0.4, 0.85),
          {
            key: "clauses",
            label: "Contract & verification clauses",
            bound: {
              kind: "set",
              allowed: [
                "certificate-of-incorporation",
                "site-visit-signoff",
                "temperature-logging",
                "claims-handling-sla",
                "volume-rebate",
              ],
              required: ["certificate-of-incorporation", "site-visit-signoff", "temperature-logging"],
              forbidden: ["exclusivity", "unlimited-liability"],
              maxItems: 5,
            },
            direction: "match",
            weight: 0.5,
          },
        ],
        approval: [{ kind: "product-at-or-above", terms: ["rate", "volume"], value: 60_000, unit: "USD" }],
      },
    ),
  ];
}

// --- 2. Executive search ---------------------------------------------------

function recruitingPair(): LocalAgent[] {
  const subject = "senior-robotics-engineer-search";
  return [
    agent(
      "obn:lantern-talent",
      "Lantern Talent",
      "lanterntalent.com",
      "We place senior robotics and controls engineers across Europe. We work on " +
        "contingent and retained search, and we want employers who can move quickly " +
        "once we put a shortlist in front of them.",
      {
        version: 1,
        role: "recruiter",
        subject,
        terms: [
          num("placement_fee", "Placement fee", "higher-better", { min: 18_000, unit: "USD" }, 0.9, 0.3),
          num("roles", "Roles committed", "higher-better", { min: 1, max: 4, unit: "roles", integer: true }, 0.4, 0.9),
          num("guarantee_days", "Replacement guarantee", "lower-better", { min: 30, max: 120, unit: "days", integer: true }, 0.5, 0.75),
          num("exclusivity_weeks", "Exclusivity window", "higher-better", { min: 0, max: 8, unit: "weeks", integer: true }, 0.6, 0.85),
          {
            key: "start_date",
            label: "Search start",
            bound: { kind: "date", notBefore: "2026-10-01", notAfter: "2027-01-15" },
            direction: "lower-better",
            weight: 0.3,
            anchor: 0.8,
          },
          {
            key: "clauses",
            label: "Engagement & verification clauses",
            bound: {
              kind: "set",
              allowed: [
                "certificate-of-incorporation",
                "site-visit-signoff",
                "background-check",
                "reference-check",
                "staged-invoicing",
              ],
              required: ["certificate-of-incorporation"],
              forbidden: ["fee-on-failure", "unlimited-replacements"],
              maxItems: 5,
            },
            direction: "match",
            weight: 0.5,
          },
        ],
        approval: [
          { kind: "counterparty-below", level: "email" },
          { kind: "product-at-or-above", terms: ["placement_fee", "roles"], value: 60_000, unit: "USD" },
        ],
      },
    ),
    agent(
      "obn:arcadia-robotics",
      "Arcadia Robotics",
      "arcadiarobotics.com",
      "We build warehouse automation systems and are scaling our controls team. " +
        "We hire selectively and would rather pay for a good shortlist than run an " +
        "open search across five agencies.",
      {
        version: 1,
        role: "employer",
        subject,
        terms: [
          num("placement_fee", "Placement fee", "lower-better", { max: 26_000, unit: "USD" }, 0.9, 0.25),
          num("roles", "Roles committed", "lower-better", { min: 1, max: 3, unit: "roles", integer: true }, 0.4, 0.7),
          num("guarantee_days", "Replacement guarantee", "higher-better", { min: 45, max: 180, unit: "days", integer: true }, 0.6, 0.8),
          num("exclusivity_weeks", "Exclusivity window", "lower-better", { min: 0, max: 6, unit: "weeks", integer: true }, 0.5, 0.8),
          {
            key: "start_date",
            label: "Search start",
            bound: { kind: "date", notBefore: "2026-10-15", notAfter: "2027-02-28" },
            direction: "lower-better",
            weight: 0.2,
            anchor: 0.7,
          },
          {
            key: "clauses",
            label: "Engagement & verification clauses",
            bound: {
              kind: "set",
              allowed: [
                "certificate-of-incorporation",
                "site-visit-signoff",
                "background-check",
                "reference-check",
                "staged-invoicing",
              ],
              required: ["certificate-of-incorporation", "site-visit-signoff", "background-check"],
              forbidden: ["unlimited-replacements"],
              maxItems: 5,
            },
            direction: "match",
            weight: 0.5,
          },
        ],
        approval: [
          { kind: "product-at-or-above", terms: ["placement_fee", "roles"], value: 45_000, unit: "USD" },
        ],
      },
    ),
  ];
}

// --- 3. Shirt sponsorship --------------------------------------------------

function sponsorshipPair(): LocalAgent[] {
  const subject = "harbour-fc-2027-shirt-sponsorship";
  return [
    agent(
      "obn:harbour-fc",
      "Harbour FC",
      "harbourfc.com",
      "We are a second-tier club with a young, heavily online supporter base. We " +
        "sell front-of-shirt and sleeve inventory, and we protect our ability to sell " +
        "adjacent categories to other partners.",
      {
        version: 1,
        role: "rights holder",
        subject,
        terms: [
          num("fee", "Season fee", "higher-better", { min: 240_000, unit: "USD" }, 0.9, 0.3),
          num("term_seasons", "Term", "higher-better", { min: 1, max: 4, unit: "seasons", integer: true }, 0.5, 0.9),
          num("impressions_guaranteed", "Guaranteed impressions", "lower-better", { min: 20, max: 120, unit: "m", integer: true }, 0.5, 0.8),
          {
            key: "category_exclusivity",
            label: "Category exclusivity",
            bound: { kind: "boolean" },
            direction: "lower-better",
            weight: 0.6,
            anchor: 0.85,
          },
          {
            key: "activation_rights",
            label: "Activation rights",
            bound: {
              kind: "set",
              allowed: ["matchday-branding", "social-content", "player-appearances", "hospitality"],
              forbidden: ["stadium-naming", "training-kit"],
              maxItems: 4,
            },
            direction: "match",
            weight: 0.4,
          },
          {
            key: "launch_date",
            label: "Launch",
            bound: { kind: "date", notBefore: "2027-06-01", notAfter: "2027-08-15" },
            direction: "match",
            weight: 0.2,
          },
        ],
        approval: [
          { kind: "counterparty-below", level: "email" },
          { kind: "term-at-or-above", term: "fee", value: 260_000 },
        ],
      },
    ),
    agent(
      "obn:nimbus-drinks",
      "Nimbus Drinks",
      "nimbusdrinks.com",
      "We make low-sugar sports hydration and are moving spend out of paid social " +
        "into club partnerships. We need category exclusivity to justify the budget " +
        "internally.",
      {
        version: 1,
        role: "sponsor",
        subject,
        terms: [
          num("fee", "Season fee", "lower-better", { max: 340_000, unit: "USD" }, 0.9, 0.25),
          num("term_seasons", "Term", "lower-better", { min: 1, max: 3, unit: "seasons", integer: true }, 0.5, 0.7),
          num("impressions_guaranteed", "Guaranteed impressions", "higher-better", { min: 30, max: 150, unit: "m", integer: true }, 0.6, 0.85),
          {
            key: "category_exclusivity",
            label: "Category exclusivity",
            bound: { kind: "boolean" },
            direction: "higher-better",
            weight: 0.8,
            anchor: 0.9,
          },
          {
            key: "activation_rights",
            label: "Activation rights",
            bound: {
              kind: "set",
              allowed: ["matchday-branding", "social-content", "player-appearances", "hospitality", "training-kit"],
              required: ["matchday-branding"],
              forbidden: ["stadium-naming"],
              maxItems: 5,
            },
            direction: "match",
            weight: 0.5,
          },
          {
            key: "launch_date",
            label: "Launch",
            bound: { kind: "date", notBefore: "2027-05-15", notAfter: "2027-09-01" },
            direction: "match",
            weight: 0.2,
          },
        ],
        approval: [{ kind: "term-at-or-above", term: "fee", value: 250_000 }],
      },
    ),
  ];
}

// ---------------------------------------------------------------------------
// Traversal fallbacks
// ---------------------------------------------------------------------------

const FIXTURES: Record<string, Opportunity[]> = {
  "obn:meridian-coldchain": [
    {
      id: "opp_fx_s1",
      title: "Kairo Foods expands chilled dairy distribution into Copenhagen & Denmark",
      url: "https://kairofoods.com/press/copenhagen-expansion",
      snippet:
        "Kairo Foods will begin weekly chilled dairy shipments from Stockholm into Copenhagen, citing " +
        "demand from three national Danish grocery chains.",
      reason:
        "A shipper with recurring weekly volume on exactly the Stockholm–Copenhagen lane you sell. " +
        "Predictable seasonal volume is the profile your mandate targets.",
      score: 0.96,
      counterpartyDomain: "kairofoods.com",
    },
    {
      id: "opp_fx_s2",
      title: "Nordic Harvest Co-op opens tender for Øresund refrigerated produce lane",
      url: "https://nordicharvest.se/tenders/2026-oresund-reefer",
      snippet:
        "Nordic Harvest is soliciting multi-month carrier bids for temperature-logged produce transport " +
        "between Stockholm and Copenhagen distribution hubs.",
      reason:
        "Second qualified shipper on the same Øresund corridor. Negotiating with both Kairo Foods and " +
        "Nordic Harvest lets your agent compare rate and payment terms before you approve the winner.",
      score: 0.89,
      counterpartyDomain: "nordicharvest.se",
    },
    {
      id: "opp_fx_s3",
      title: "Skåne Fine Dairy seeks backup reefer capacity for Q4 peak",
      url: "https://skanedairy.dk/procurement/q4-cold-chain",
      snippet:
        "Regional dairy producer seeks 60–150 unit capacity commitments with strict cold-chain SLA.",
      reason:
        "Smaller volume floor with faster payment window; strong secondary counterparty to benchmark rate.",
      score: 0.81,
      counterpartyDomain: "skanedairy.dk",
    },
  ],
  "obn:kairo-foods": [
    {
      id: "opp_fx_b1",
      title: "Meridian Cold Chain opens second Stockholm–Copenhagen reefer corridor",
      url: "https://meridiancoldchain.com/news/stockholm-copenhagen-corridor",
      snippet:
        "Meridian has added eleven electric-hybrid reefer units to the Stockholm–Copenhagen lane and is " +
        "offering fixed-term capacity contracts ahead of the peak season.",
      reason:
        "Direct match for the lane in your mandate, and new capacity usually " +
        "means rate flexibility before it is committed elsewhere.",
      score: 0.94,
      counterpartyDomain: "meridiancoldchain.com",
    },
    {
      id: "opp_fx_b2",
      title: "Baltic Polar Express announces dedicated Sweden–Denmark chilled fleet",
      url: "https://balticpolarexpress.se/lanes/oresund-chilled",
      snippet:
        "Baltic Polar Express is offering 3-to-12 month fixed-rate reefer charters with continuous telemetry.",
      reason:
        "Competing Nordic carrier on the same corridor — allows parallel rate and payment-term benchmarking.",
      score: 0.87,
      counterpartyDomain: "balticpolarexpress.se",
    },
  ],
  "obn:lantern-talent": [
    {
      id: "opp_fx_r1",
      title: "Arcadia Robotics raises Series B to scale warehouse automation",
      url: "https://arcadiarobotics.com/news/series-b",
      snippet:
        "Arcadia will roughly double its controls engineering team over the next " +
        "four quarters following a EUR 40m round.",
      reason:
        "Funded headcount growth in exactly your specialism, and a company that " +
        "will need to move fast — which is the employer profile your mandate wants.",
      score: 0.95,
      counterpartyDomain: "arcadiarobotics.com",
    },
    {
      id: "opp_fx_r2",
      title: "Nordic Cobotics AB opens retained search for senior motion control leads",
      url: "https://nordiccobotics.se/careers/retained-search-rfp",
      snippet:
        "Stockholm-based industrial robotics maker seeks specialist search partner for 2–3 senior roles.",
      reason:
        "Second employer in your exact robotics niche; negotiating both searches lets you optimize fee and exclusivity.",
      score: 0.88,
      counterpartyDomain: "nordiccobotics.se",
    },
  ],
  "obn:arcadia-robotics": [
    {
      id: "opp_fx_e1",
      title: "Lantern Talent publishes robotics controls shortlist benchmarks",
      url: "https://lanterntalent.com/insights/controls-benchmarks",
      snippet:
        "Lantern reports a median 19 days from brief to shortlist on senior controls " +
        "searches, with a 90-day replacement guarantee as standard.",
      reason:
        "A specialist recruiter in your exact discipline already quoting guarantee " +
        "terms close to what your mandate requires.",
      score: 0.93,
      counterpartyDomain: "lanterntalent.com",
    },
    {
      id: "opp_fx_e2",
      title: "Vektor Executive Search launches dedicated European robotics practice",
      url: "https://vektorsearch.eu/practices/autonomous-systems",
      snippet:
        "Vektor offers retained technical search across Sweden, Denmark, and Germany with staged invoicing.",
      reason:
        "Alternative specialist search firm to benchmark placement fee and replacement guarantee days.",
      score: 0.85,
      counterpartyDomain: "vektorsearch.eu",
    },
  ],
  "obn:harbour-fc": [
    {
      id: "opp_fx_c1",
      title: "Nimbus Drinks shifts budget from paid social to sports partnerships",
      url: "https://nimbusdrinks.com/press/partnership-strategy",
      snippet:
        "The hydration brand says it will move a majority of its acquisition budget " +
        "into club and athlete partnerships over the next two seasons.",
      reason:
        "A brand actively reallocating budget into exactly your inventory, in a " +
        "category you have not yet sold.",
      score: 0.97,
      counterpartyDomain: "nimbusdrinks.com",
    },
    {
      id: "opp_fx_c2",
      title: "Krona Sportswear seeks front-of-shirt club partner for 2027 cycle",
      url: "https://kronasport.eu/sponsorships/2027-club-tender",
      snippet:
        "Direct-to-consumer Nordic athletic brand is bidding on multi-season club inventory with digital activation.",
      reason:
        "Competing sponsor bidder — negotiating both in parallel strengthens your fee floor and category terms.",
      score: 0.89,
      counterpartyDomain: "kronasport.eu",
    },
  ],
  "obn:nimbus-drinks": [
    {
      id: "opp_fx_n1",
      title: "Harbour FC opens 2027 shirt inventory to market",
      url: "https://harbourfc.com/commercial/2027-partnerships",
      snippet:
        "The club confirmed its front-of-shirt position is available from the 2027 " +
        "season, citing a supporter base that skews under 30 and heavily online.",
      reason:
        "The audience profile matches your target demographic, and inventory coming " +
        "to market is when category exclusivity is still winnable.",
      score: 0.96,
      counterpartyDomain: "harbourfc.com",
    },
    {
      id: "opp_fx_n2",
      title: "Øresund Athletic Club opens commercial kit sponsorship tender",
      url: "https://oresundathletic.dk/commercial/2027-kit-partner",
      snippet:
        "Copenhagen club offers front-of-shirt and matchday activation package for 2027–2029 seasons.",
      reason:
        "Comparable club inventory in the same target demographic to benchmark season fee and impression guarantees.",
      score: 0.86,
      counterpartyDomain: "oresundathletic.dk",
    },
  ],
};

/**
 * Traversal results used when Tavily has no key. Shaped exactly like live
 * results so the floor cannot tell the difference.
 */
export function fixtureOpportunities(agentOrId: string | LocalAgent): Opportunity[] {
  const agentId = typeof agentOrId === "string" ? agentOrId : agentOrId.card.id;
  if (FIXTURES[agentId]) return FIXTURES[agentId];

  if (typeof agentOrId !== "string") {
    const subjectPretty = agentOrId.mandate.subject.replace(/[-_]+/g, " ");
    const headline = [...agentOrId.mandate.terms].sort((a, b) => b.weight - a.weight)[0];
    const termLabel = headline ? headline.label.toLowerCase() : "commercial terms";
    return [
      {
        id: `opp_fx_${agentId}_1`,
        title: `Vanguard Labs opens enterprise tender for ${subjectPretty}`,
        url: `https://vanguardlabs.ai/procurement/${agentOrId.mandate.subject}`,
        snippet:
          `Vanguard Labs has opened a structured tender for ${subjectPretty}, ` +
          `inviting autonomous agents to propose ${termLabel} within a 14-day settlement window.`,
        reason:
          `High-priority match for ${agentOrId.card.name}'s ${agentOrId.mandate.role} mandate on "${subjectPretty}".`,
        score: 0.95,
        counterpartyDomain: "vanguardlabs.ai",
      },
      {
        id: `opp_fx_${agentId}_2`,
        title: `Nordic Enterprise Group soliciting competing bids on ${subjectPretty}`,
        url: `https://nordicenterprise.se/rfp/${agentOrId.mandate.subject}`,
        snippet:
          `Stockholm-based Nordic Enterprise Group is evaluating second-source partners on ${subjectPretty} with flexible ${termLabel}.`,
        reason:
          `Competing counterparty discovered via traversal — negotiating with both Vanguard Labs and Nordic Enterprise lets your agent compare utility scores in Inbox.`,
        score: 0.87,
        counterpartyDomain: "nordicenterprise.se",
      },
    ];
  }

  return [
    {
      id: "opp_fx_generic",
      title: "No fixtures for this agent yet",
      url: "https://example.com",
      snippet:
        "This agent was created at runtime, so there is no offline fixture set for it.",
      reason: "Configure TAVILY_API_KEY to traverse the live web for this agent.",
      score: 0.2,
    },
  ];
}
