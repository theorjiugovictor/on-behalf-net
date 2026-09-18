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

import { generateKeyPair } from "./identity";
import { publicSpec } from "./terms";
import type { LocalAgent, Mandate, Opportunity, TermSpec } from "./types";
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
};

export const SCENARIOS: Scenario[] = [
  {
    id: "freight",
    title: "Refrigerated freight",
    blurb: "A carrier and a shipper on rate, volume, term and payment days.",
    subject: "reefer-lane-lagos-accra",
    opens: "obn:meridian-coldchain",
    responds: "obn:kairo-foods",
  },
  {
    id: "recruiting",
    title: "Executive search",
    blurb: "A recruiter and an employer on fee, guarantee period and exclusivity.",
    subject: "senior-robotics-engineer-search",
    opens: "obn:lantern-talent",
    responds: "obn:arcadia-robotics",
  },
  {
    id: "sponsorship",
    title: "Shirt sponsorship",
    blurb: "A club and a brand on fee, seasons, category exclusivity and activation.",
    subject: "harbour-fc-2027-shirt-sponsorship",
    opens: "obn:harbour-fc",
    responds: "obn:nimbus-drinks",
  },
];

export function seedAgents(): LocalAgent[] {
  return [...freightPair(), ...recruitingPair(), ...sponsorshipPair()];
}

// --- 1. Refrigerated freight ----------------------------------------------

function freightPair(): LocalAgent[] {
  const subject = "reefer-lane-lagos-accra";
  return [
    agent(
      "obn:meridian-coldchain",
      "Meridian Cold Chain",
      "meridiancoldchain.com",
      "We operate refrigerated road freight across West Africa. We sell dedicated " +
        "temperature-controlled lane capacity on fixed-term contracts, and we are " +
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
            label: "Contract clauses",
            bound: {
              kind: "set",
              allowed: ["temperature-logging", "claims-handling-sla", "volume-rebate", "backhaul-option"],
              forbidden: ["exclusivity", "unlimited-liability", "auto-renewal"],
              maxItems: 4,
            },
            direction: "match",
            weight: 0.6,
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
      "We move fresh produce and chilled dairy from Lagos into Ghana. We buy " +
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
            label: "Contract clauses",
            bound: {
              kind: "set",
              allowed: ["temperature-logging", "claims-handling-sla", "volume-rebate"],
              required: ["temperature-logging"],
              forbidden: ["exclusivity", "unlimited-liability"],
              maxItems: 4,
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
            label: "Engagement clauses",
            bound: {
              kind: "set",
              allowed: ["background-check", "reference-check", "staged-invoicing"],
              forbidden: ["fee-on-failure", "unlimited-replacements"],
              maxItems: 4,
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
            label: "Engagement clauses",
            bound: {
              kind: "set",
              allowed: ["background-check", "reference-check", "staged-invoicing"],
              required: ["background-check"],
              forbidden: ["unlimited-replacements"],
              maxItems: 4,
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
      title: "Kairo Foods expands chilled dairy distribution into Ghana",
      url: "https://kairofoods.com/press/ghana-expansion",
      snippet:
        "Kairo Foods will begin weekly chilled dairy shipments into Accra, citing " +
        "demand from three national grocery chains.",
      reason:
        "A shipper with recurring weekly volume on exactly the lane you sell. " +
        "Predictable seasonal volume is the profile your mandate targets.",
      score: 0.96,
      counterpartyDomain: "kairofoods.com",
    },
    {
      id: "opp_fx_s2",
      title: "West African produce exporters flag cold chain shortage",
      url: "https://example-trade-press.com/wa-cold-chain-shortage",
      snippet:
        "Exporters report losing up to 18% of chilled cargo to gaps in refrigerated " +
        "road capacity between Lagos and Accra.",
      reason:
        "Demand-side pressure on your lane. Supports holding nearer the top of " +
        "your permitted range in the opening quote.",
      score: 0.74,
    },
  ],
  "obn:kairo-foods": [
    {
      id: "opp_fx_b1",
      title: "Meridian Cold Chain opens second Lagos–Accra reefer corridor",
      url: "https://meridiancoldchain.com/news/lagos-accra-corridor",
      snippet:
        "Meridian has added eleven reefer units to the Lagos–Accra lane and is " +
        "offering fixed-term capacity contracts ahead of the harvest season.",
      reason:
        "Direct match for the lane in your mandate, and new capacity usually " +
        "means rate flexibility before it is committed elsewhere.",
      score: 0.94,
      counterpartyDomain: "meridiancoldchain.com",
    },
    {
      id: "opp_fx_b2",
      title: "Sahel Logistics posts spot reefer rates for Q4",
      url: "https://example-freight-index.com/sahel-q4-reefer",
      snippet: "Spot rates on the corridor are quoted between USD 910 and USD 1,040.",
      reason:
        "Useful pricing anchor: your ceiling sits near the bottom of the current " +
        "spot band, so a fixed-term deal is worth pursuing.",
      score: 0.68,
      counterpartyDomain: "example-freight-index.com",
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
      title: "Robotics controls salaries climb 11% year on year",
      url: "https://example-talent-index.com/robotics-controls-salaries",
      snippet:
        "Median compensation for senior controls engineers rose sharply as automation " +
        "hiring outpaced supply.",
      reason:
        "Rising salaries lift percentage-based placement fees. Supports opening " +
        "nearer the top of your permitted range.",
      score: 0.72,
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
      title: "Second-tier shirt deals reach record values",
      url: "https://example-sports-business.com/second-tier-shirt-values",
      snippet:
        "Front-of-shirt values outside the top flight rose 14% this cycle, driven by " +
        "direct-to-consumer brands seeking younger audiences.",
      reason:
        "Market comparable that supports your fee floor, and evidence for holding " +
        "category exclusivity back rather than bundling it in.",
      score: 0.78,
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
  ],
};

/**
 * Traversal results used when Tavily has no key. Shaped exactly like live
 * results so the floor cannot tell the difference.
 */
export function fixtureOpportunities(agentId: string): Opportunity[] {
  return (
    FIXTURES[agentId] ?? [
      {
        id: "opp_fx_generic",
        title: "No fixtures for this agent yet",
        url: "https://example.com",
        snippet:
          "This agent was created at runtime, so there is no offline fixture set for it.",
        reason: "Configure TAVILY_API_KEY to traverse the live web for this agent.",
        score: 0.2,
      },
    ]
  );
}
