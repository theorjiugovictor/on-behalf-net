/**
 * Onboarding from nothing but a URL — the QR-code moment.
 *
 * Read the company's own site, draft a purpose and a starter mandate, mint a
 * keypair, and the agent is live. The draft mandate is deliberately cautious:
 * a human widens it afterwards, which is the right direction for a governance
 * default to fail in.
 */

import { NextResponse } from "next/server";
import { agentIdForDomain, generateKeyPair } from "@/lib/identity";
import { chatJSON } from "@/lib/llm";
import { extract } from "@/lib/tavily";
import { getCard, putAgent } from "@/lib/store";
import { PROTOCOL, type LocalAgent, type Mandate } from "@/lib/types";

export const dynamic = "force-dynamic";

type Draft = {
  name?: string;
  purpose?: string;
  role?: "seller" | "buyer";
  sku?: string;
  indicativeUnitPrice?: number;
  currency?: string;
};

export async function POST(req: Request) {
  let body: { url?: string; role?: "seller" | "buyer" };
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

  const role = body.role ?? draft?.role ?? "seller";
  const name = draft?.name?.trim() || titleFromDomain(domain);
  const purpose =
    draft?.purpose?.trim() ||
    `${name} trades on the open market. This agent's purpose has not yet been ` +
      `reviewed by a human — confirm it before the agent commits to anything.`;

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
      capabilities: [role === "seller" ? "sell" : "buy", "negotiate", "traverse"],
    },
    privateKey,
    mandate: starterMandate(id, role, draft),
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
        "This mandate is a conservative draft. Review and widen it before the agent " +
        "negotiates anything that matters.",
    },
    { status: 201 },
  );
}

async function draftFromPage(domain: string, pageText: string): Promise<Draft | null> {
  return chatJSON<Draft>({
    system:
      `You are setting up a commercial agent for the company at ${domain}. ` +
      `From the page text, work out what the company actually trades.\n\n` +
      `Reply with JSON only: {"name":string,"purpose":string,"role":"seller"|"buyer",` +
      `"sku":string,"indicativeUnitPrice":number,"currency":string}\n\n` +
      `"purpose" is two or three sentences in the company's own voice describing ` +
      `what it sells or buys and who it wants to deal with. "sku" is a short ` +
      `lowercase-hyphenated identifier for its main traded item. ` +
      `"indicativeUnitPrice" is your best estimate of a typical unit price; use 0 ` +
      `if you genuinely cannot tell.`,
    user: pageText,
    temperature: 0.3,
    maxTokens: 600,
  });
}

/**
 * A starter mandate sized around whatever the model guessed, or a small,
 * clearly-provisional envelope when it guessed nothing.
 */
function starterMandate(agentId: string, role: "seller" | "buyer", draft: Draft | null): Mandate {
  const indicative =
    draft?.indicativeUnitPrice && draft.indicativeUnitPrice > 0 ? draft.indicativeUnitPrice : 100;
  const currency = draft?.currency?.toUpperCase() || "USD";

  return {
    agentId,
    version: 1,
    role,
    sku: draft?.sku?.trim() || "unspecified-item",
    currency,
    ...(role === "seller"
      ? { floorUnitPrice: round2(indicative * 0.85) }
      : { ceilingUnitPrice: round2(indicative * 1.15) }),
    minVolume: 1,
    maxVolume: 100,
    maxTermMonths: 6,
    maxTotalValue: round2(indicative * 100),
    allowedIncoterms: ["DAP", "CIF"],
    maxPaymentTermsDays: 30,
    forbiddenClauses: ["exclusivity", "unlimited-liability", "auto-renewal"],
    // Everything needs a human until someone deliberately raises this.
    autoApproveBelowValue: 0,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function titleFromDomain(domain: string): string {
  return domain
    .split(".")[0]
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
