/**
 * GET  — Run one traversal pass for a hosted agent.
 * POST — Dispatch the agent to negotiate with all discovered counterparties in parallel.
 */

import { NextResponse } from "next/server";
import { dispatchToOpportunities } from "@/lib/onboarding";
import { getAgent } from "@/lib/store";
import { traverse } from "@/lib/traverse";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const agentId = new URL(req.url).searchParams.get("agent");
  if (!agentId) {
    return NextResponse.json({ error: "Pass ?agent=<agent id>." }, { status: 400 });
  }

  const agent = getAgent(agentId);
  if (!agent) {
    return NextResponse.json({ error: `No hosted agent "${agentId}".` }, { status: 404 });
  }

  const result = await traverse(agent);
  return NextResponse.json({
    agent: { id: agent.card.id, name: agent.card.name },
    ...result,
  });
}

export async function POST(req: Request) {
  let body: { agentId?: string; opportunities?: Opportunity[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json({ error: "Provide `agentId`." }, { status: 400 });
  }

  const agent = getAgent(agentId);
  if (!agent) {
    return NextResponse.json({ error: `No hosted agent "${agentId}".` }, { status: 404 });
  }

  const origin = process.env.OBN_PUBLIC_URL ?? new URL(req.url).origin;
  const opportunities =
    body.opportunities && body.opportunities.length > 0
      ? body.opportunities
      : (await traverse(agent)).opportunities;

  const runs = await dispatchToOpportunities(agent, origin, opportunities);

  return NextResponse.json({
    agent: { id: agent.card.id, name: agent.card.name },
    dispatchedCount: runs.length,
    runs: runs.map((r) => ({
      counterpartyId: r.counterparty.card.id,
      counterpartyName: r.counterparty.card.name,
      counterpartyDomain:
        r.counterparty.card.principal.kind === "company"
          ? r.counterparty.card.principal.domain
          : undefined,
      scenarioId: r.scenario.id,
      threadId: r.thread.id,
      status: r.thread.status,
      turnsCount: r.thread.turns.length,
      utility: r.thread.pendingApproval?.verdict.utility ?? 0.75,
      deal: r.thread.pendingApproval?.deal ?? r.thread.settledDeal ?? null,
    })),
  });
}
