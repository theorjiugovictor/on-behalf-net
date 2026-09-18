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
import { extract } from "@/lib/tavily";
import { draftFromPage, starterMandate, titleFromDomain } from "@/lib/onboarding";
import { getCard, putAgent } from "@/lib/store";
import { publicSpec } from "@/lib/terms";
import { PROTOCOL, type LocalAgent } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  const mandate = starterMandate(id, draft, "counterparty");
  const { publicKey, privateKey } = generateKeyPair();
  const origin = process.env.OBN_PUBLIC_URL ?? new URL(req.url).origin;

  const agent: LocalAgent = {
    card: {
      protocol: PROTOCOL,
      id,
      name,
      purpose,
      principal: { kind: "company", name, domain },
      attestation: { level: "none" },
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
