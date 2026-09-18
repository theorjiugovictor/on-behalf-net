/**
 * The agent inbox — the one endpoint a foreign agent needs.
 *
 * This is what makes BYOA real rather than aspirational: any agent, written in
 * any language, that can serve an agent card and sign an ed25519 envelope can
 * negotiate here. Our own hosted agents are simply the first clients of it.
 *
 * POST a signed envelope; the hosted agent's signed reply comes back in the
 * response body, so a full negotiation is a loop around one HTTP call.
 */

import { NextResponse } from "next/server";
import { advance, ingestInbound, openThread } from "@/lib/negotiate";
import { verifyInbound } from "@/lib/protocol";
import {
  getAgent,
  getCard,
  getThread,
  isLocal,
  putThread,
  rememberForeignCard,
} from "@/lib/store";
import type { AgentCard, Envelope, Thread, TurnRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const recipient = getAgent(decodeURIComponent(id));
  if (!recipient) {
    return NextResponse.json({ error: `No agent "${id}" is hosted here.` }, { status: 404 });
  }

  let envelope: Envelope;
  try {
    envelope = (await req.json()) as Envelope;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Trust-on-first-use: a stranger presents its card on the opening message and
  // that card's key is what every later message is checked against. Key rotation
  // means a new agent id — a familiar id arriving under a new key is exactly
  // what an impostor looks like, so the stored key always wins.
  const known = getCard(envelope?.from);
  const presented = envelope?.body?.card as AgentCard | undefined;
  const presentedIsUsable =
    presented?.id === envelope?.from && typeof presented?.publicKey === "string";

  let card = known;
  if (!card && presentedIsUsable) {
    card = presented;
  } else if (card && presentedIsUsable && presented!.publicKey === card.publicKey) {
    // Same key, so same agent: let it update the rest of its card. An agent may
    // legitimately start negotiating a different subject, or rename itself.
    card = presented;
  }

  const check = verifyInbound(envelope, card);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  if (envelope.to !== recipient.card.id) {
    return NextResponse.json(
      { error: `Envelope is addressed to "${envelope.to}", not "${recipient.card.id}".` },
      { status: 400 },
    );
  }

  if (card && !isLocal(card.id)) rememberForeignCard(card);

  // Attach to the named thread, or start one if this is an opening message.
  let thread: Thread | undefined = getThread(envelope.threadId);
  if (!thread) {
    thread = openThread(envelope.from, recipient.card.id, subjectFor(envelope));
    // Honour the sender's thread id so both sides agree on the identifier.
    thread.id = envelope.threadId;
    putThread(thread);
  }

  if (thread.status !== "open") {
    return NextResponse.json(
      { error: `Thread is ${thread.status} and accepts no further messages.`, thread },
      { status: 409 },
    );
  }

  const inbound: TurnRecord = { envelope, foreign: !isLocal(envelope.from) };
  thread.turns.push(inbound);

  // An acceptance is re-checked against our own mandate before it can settle.
  const before = thread.turns.length;
  const status = ingestInbound(thread, envelope, recipient);
  // Ingest appends a turn only when it had something to say (e.g. refusing an
  // acceptance of terms we cannot honour). That turn is the reply.
  const ingestReply = thread.turns.length > before ? thread.turns[thread.turns.length - 1] : null;

  // Reply in-band so a foreign agent never has to run a server of its own.
  const reply = status === "open" ? await advance(thread) : ingestReply;

  const settled = putThread(thread);
  return NextResponse.json({
    accepted: true,
    threadId: settled.id,
    status: settled.status,
    reply: reply?.envelope ?? null,
    verdict: reply?.verdict ?? null,
    ...(settled.status === "awaiting-approval" && settled.pendingApproval
      ? {
          pendingApproval: {
            reason: settled.pendingApproval.reason,
            deal: settled.pendingApproval.deal,
          },
        }
      : {}),
  });
}

function subjectFor(envelope: Envelope): string {
  const subject = envelope.body?.deal?.subject;
  return subject ? `Inbound negotiation — ${subject}` : "Inbound negotiation";
}
