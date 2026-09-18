/** Full thread state, including every signed turn and its policy verdict. */

import { NextResponse } from "next/server";
import { whoseTurn } from "@/lib/protocol";
import { getCard, getThread } from "@/lib/store";

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
    nextTurn: next,
    nextTurnName: next ? getCard(next)?.name ?? next : null,
  });
}
