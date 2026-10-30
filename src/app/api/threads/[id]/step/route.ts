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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const thread = getThread(id);
  if (!thread) return NextResponse.json({ error: `Unknown thread "${id}".` }, { status: 404 });

  const url = new URL(req.url);
  const fast = url.searchParams.get("fast") === "1";

  const actor = whoseTurn(thread);

  if (!actor) {
    return NextResponse.json({
      advanced: false,
      status: thread.status,
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
      status: thread.status,
      reason: `Waiting on ${getCard(actor)?.name ?? actor}, which is not hosted here.`,
      waitingOn: actor,
      thread,
    });
  }

  const turn = await advance(thread, { fast });
  return NextResponse.json({
    advanced: Boolean(turn),
    status: thread.status,
    turn,
    thread,
    nextTurn: whoseTurn(thread),
  });
}
