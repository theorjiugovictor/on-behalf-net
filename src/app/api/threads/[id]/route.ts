/**
 * Full thread state, including every signed turn and its policy verdict.
 *
 * Also returns a term dictionary — labels, types and units for the keys in play.
 * The UI needs it to render a deal in any industry without knowing the industry.
 * Only the public half of each spec is exposed: no bounds, no directions, no
 * weights, so reading a thread never leaks where an agent's limits sit.
 */

import { NextResponse } from "next/server";
import { whoseTurn } from "@/lib/protocol";
import { getAgent, getCard, getThread } from "@/lib/store";
import { publicSpec } from "@/lib/terms";
import type { PublicTermSpec, Thread } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const thread = getThread(id);
  if (!thread) return NextResponse.json({ error: `Unknown thread "${id}".` }, { status: 404 });

  const next = whoseTurn(thread);
  return NextResponse.json({
    thread,
    participants: {
      [thread.a]: getCard(thread.a) ?? null,
      [thread.b]: getCard(thread.b) ?? null,
    },
    terms: termDictionary(thread),
    nextTurn: next,
    nextTurnName: next ? getCard(next)?.name ?? next : null,
  });
}

/** Public term metadata for every key either side might use. */
function termDictionary(thread: Thread): Record<string, PublicTermSpec> {
  const dict: Record<string, PublicTermSpec> = {};

  for (const agentId of [thread.a, thread.b]) {
    const local = getAgent(agentId);
    if (local) {
      for (const spec of local.mandate.terms) dict[spec.key] = publicSpec(spec);
      continue;
    }
    // Foreign agents advertise the same metadata on their card.
    for (const spec of getCard(agentId)?.negotiates?.terms ?? []) {
      dict[spec.key] ??= spec;
    }
  }

  // Anything that appeared on the wire but neither side declared still needs a
  // label, or the floor would render a bare key.
  for (const turn of thread.turns) {
    for (const key of Object.keys(turn.envelope.body.deal?.terms ?? {})) {
      dict[key] ??= { key, label: key.replace(/[-_]/g, " "), type: "text" };
    }
  }

  return dict;
}
