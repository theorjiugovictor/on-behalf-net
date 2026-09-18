/** Run one traversal pass for a hosted agent. */

import { NextResponse } from "next/server";
import { getAgent } from "@/lib/store";
import { traverse } from "@/lib/traverse";

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
