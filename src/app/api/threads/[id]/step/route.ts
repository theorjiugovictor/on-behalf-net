/**
 * Advance a negotiation by exactly one turn.
 *
 * Turn-at-a-time rather than run-to-completion for two reasons: the floor can
 * pace the exchange so an audience can read it, and a slow model call stalls one
 * turn instead of the whole thread.
 */

import { NextResponse } from "next/server";
import { advance } from "@/lib/negotiate";
import { whoseTurn } from "@/lib/protocol";
import { getCard, getThread, isLocal } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const thread = getThread(id);
  if (!thread) return NextResponse.json({ error: `Unknown thread "${id}".` }, { status: 404 });

  const actor = whoseTurn(thread);

  if (!actor) {
    return NextResponse.json({
      advanced: false,
      reason:
        thread.status === "awaiting-approval"
          ? "Waiting on a human decision."
          : `Thread is ${thread.status}.`,
      thread,
    });
  }

  if (!isLocal(actor)) {
    return NextResponse.json({
      advanced: false,
      reason: `Waiting on ${getCard(actor)?.name ?? actor}, which is not hosted here.`,
      waitingOn: actor,
      thread,
    });
  }

  const turn = await advance(thread);
  return NextResponse.json({
    advanced: Boolean(turn),
    turn,
    thread,
    nextTurn: whoseTurn(thread),
  });
}
