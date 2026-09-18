/**
 * Demo fixtures.
 *
 * Two hosted agents whose mandates overlap: the seller's floor (820) sits below
 * the buyer's ceiling (960), so a deal exists, but the realistic settlement
 * value lands above both sides' auto-approval thresholds. The negotiation
 * therefore converges and *then* stops for a human — which is the point.
 *
 * Keys are generated fresh at boot. Nothing here should be reused in production.
 */

import { generateKeyPair } from "./identity";
import type { LocalAgent, Mandate, Opportunity } from "./types";
import { PROTOCOL } from "./types";

const publicBase = () => process.env.OBN_PUBLIC_URL ?? "http://localhost:3000";

function agent(
  id: string,
  name: string,
  domain: string,
  purpose: string,
  capabilities: LocalAgent["card"]["capabilities"],
  mandate: Omit<Mandate, "agentId">,
): LocalAgent {
  const { publicKey, privateKey } = generateKeyPair();
  return {
    card: {
      protocol: PROTOCOL,
      id,
      name,
      domain,
      purpose,
      publicKey,
      endpoint: `${publicBase()}/api/agents/${encodeURIComponent(id)}/inbox`,
      capabilities,
    },
    privateKey,
    mandate: { ...mandate, agentId: id },
    createdAt: new Date().toISOString(),
  };
}

export const SELLER_ID = "obn:meridian-coldchain";
export const BUYER_ID = "obn:kairo-foods";

export function seedAgents(): LocalAgent[] {
  return [
    agent(
      SELLER_ID,
      "Meridian Cold Chain",
      "meridiancoldchain.com",
      "We operate refrigerated road freight across West Africa. We sell dedicated " +
        "temperature-controlled lane capacity on fixed-term contracts, and we are " +
        "looking for shippers with predictable seasonal volume.",
      ["sell", "negotiate", "traverse"],
      {
        version: 3,
        role: "seller",
        sku: "reefer-lane-lagos-accra",
        currency: "USD",
        floorUnitPrice: 820,
        minVolume: 20,
        maxVolume: 400,
        maxTermMonths: 12,
        maxTotalValue: 250_000,
        allowedIncoterms: ["DAP", "CIF"],
        maxPaymentTermsDays: 45,
        forbiddenClauses: ["exclusivity", "unlimited-liability", "auto-renewal"],
        autoApproveBelowValue: 75_000,
      },
    ),
    agent(
      BUYER_ID,
      "Kairo Foods",
      "kairofoods.com",
      "We move fresh produce and chilled dairy from Lagos into Ghana. We buy " +
        "refrigerated lane capacity and care more about reliability and claims " +
        "history than headline rate.",
      ["buy", "negotiate", "traverse"],
      {
        version: 2,
        role: "buyer",
        sku: "reefer-lane-lagos-accra",
        currency: "USD",
        ceilingUnitPrice: 960,
        minVolume: 50,
        maxVolume: 300,
        maxTermMonths: 18,
        maxTotalValue: 240_000,
        allowedIncoterms: ["DAP", "CIF", "FCA"],
        maxPaymentTermsDays: 60,
        forbiddenClauses: ["exclusivity", "unlimited-liability"],
        autoApproveBelowValue: 60_000,
      },
    ),
  ];
}

/**
 * Traversal results used when Tavily has no key. Shaped exactly like live
 * results so the floor cannot tell the difference.
 */
export function fixtureOpportunities(agentId: string): Opportunity[] {
  if (agentId === BUYER_ID) {
    return [
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
        title: "Ghana lifts chilled dairy import inspection backlog",
        url: "https://example-trade-press.com/ghana-chilled-dairy-clearance",
        snippet:
          "Clearance times at Tema fell to under 14 hours in Q3, easing a bottleneck " +
          "that had discouraged chilled imports.",
        reason:
          "Shortens your effective transit and strengthens the case for committing " +
          "to a longer fixed term at a better unit rate.",
        score: 0.71,
      },
      {
        id: "opp_fx_b3",
        title: "Sahel Logistics posts spot reefer rates for Q4",
        url: "https://example-freight-index.com/sahel-q4-reefer",
        snippet: "Spot rates on the corridor are quoted between USD 910 and USD 1,040.",
        reason:
          "Useful pricing anchor: your ceiling of USD 960 sits near the bottom of " +
          "the current spot band, so a fixed-term deal is worth pursuing.",
        score: 0.68,
        counterpartyDomain: "example-freight-index.com",
      },
    ];
  }

  return [
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
    {
      id: "opp_fx_s3",
      title: "Tema port adds reefer plug capacity",
      url: "https://example-ports.com/tema-reefer-plugs",
      snippet: "Sixty additional reefer plug points came online at Tema this quarter.",
      reason:
        "Reduces your turnaround risk on the Accra end, which is worth surfacing " +
        "as a service argument rather than discounting on price.",
      score: 0.55,
    },
  ];
}
