/**
 * Agent registry.
 *
 * GET  — every agent this node knows about, hosted or foreign.
 * POST — register a foreign agent card (the BYOA handshake), or create a hosted
 *        agent from an explicit purpose and mandate.
 */

import { NextResponse } from "next/server";
import { agentIdForDomain, generateKeyPair } from "@/lib/identity";
import { SCENARIOS } from "@/lib/seed";
import { listAgents, putAgent, rememberForeignCard, getCard } from "@/lib/store";
import { publicSpec } from "@/lib/terms";
import { PROTOCOL, type AgentCard, type LocalAgent, type Mandate } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const hosted = listAgents().map((a) => ({
    ...a.card,
    hosted: true,
    mandateVersion: a.mandate.version,
    role: a.mandate.role,
    subject: a.mandate.subject,
  }));
  return NextResponse.json({ protocol: PROTOCOL, agents: hosted, scenarios: SCENARIOS });
}

type CreateBody = {
  /** Provide `card` to register a foreign agent you are hosting yourself. */
  card?: AgentCard;
  name?: string;
  domain?: string;
  purpose?: string;
  mandate?: Omit<Mandate, "agentId">;
};

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // --- BYOA: register a card we do not host ---
  if (body.card) {
    const card = body.card;
    const missing = (["id", "name", "publicKey", "endpoint"] as const).filter((k) => !card[k]);
    if (missing.length) {
      return NextResponse.json(
        { error: `Card is missing: ${missing.join(", ")}.` },
        { status: 400 },
      );
    }
    if (card.protocol !== PROTOCOL) {
      return NextResponse.json(
        { error: `Card declares protocol "${card.protocol}"; this node speaks ${PROTOCOL}.` },
        { status: 400 },
      );
    }
    rememberForeignCard(card);
    return NextResponse.json({ registered: true, card, hosted: false }, { status: 201 });
  }

  // --- Create a hosted agent ---
  if (!body.name || !body.domain || !body.purpose || !body.mandate) {
    return NextResponse.json(
      { error: "Provide either `card`, or all of `name`, `domain`, `purpose`, `mandate`." },
      { status: 400 },
    );
  }

  const id = agentIdForDomain(body.domain);
  if (getCard(id)) {
    return NextResponse.json({ error: `Agent "${id}" already exists.` }, { status: 409 });
  }

  if (!Array.isArray(body.mandate.terms) || body.mandate.terms.length === 0) {
    return NextResponse.json(
      { error: "`mandate.terms` must list at least one term this agent may negotiate." },
      { status: 400 },
    );
  }

  const { publicKey, privateKey } = generateKeyPair();
  const base = process.env.OBN_PUBLIC_URL ?? new URL(req.url).origin;
  const mandate: Mandate = { ...body.mandate, agentId: id, approval: body.mandate.approval ?? [] };
  const agent: LocalAgent = {
    card: {
      protocol: PROTOCOL,
      id,
      name: body.name,
      domain: body.domain,
      purpose: body.purpose,
      publicKey,
      endpoint: `${base}/api/agents/${encodeURIComponent(id)}/inbox`,
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

  return NextResponse.json({ created: true, card: agent.card, mandate: agent.mandate }, { status: 201 });
}
