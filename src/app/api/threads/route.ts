/**
 * Negotiation threads.
 *
 * GET  — every thread, newest first, for the floor and the inbox.
 * POST — open a negotiation between two agents this node knows about.
 */

import { NextResponse } from "next/server";
import { openThread } from "@/lib/negotiate";
import { getCard, listThreads } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const threads = listThreads().map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    a: getCard(t.a)?.name ?? t.a,
    b: getCard(t.b)?.name ?? t.b,
    turns: t.turns.length,
    updatedAt: t.updatedAt,
  }));
  return NextResponse.json({ threads });
}

export async function POST(req: Request) {
  let body: { a?: string; b?: string; subject?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { a, b } = body;
  if (!a || !b) {
    return NextResponse.json({ error: "Provide agent ids `a` and `b`." }, { status: 400 });
  }
  if (a === b) {
    return NextResponse.json({ error: "An agent cannot negotiate with itself." }, { status: 400 });
  }

  const cardA = getCard(a);
  const cardB = getCard(b);
  if (!cardA || !cardB) {
    return NextResponse.json(
      { error: `Unknown agent: ${!cardA ? a : b}. Register its card first.` },
      { status: 404 },
    );
  }

  const subject = body.subject?.trim() || `${cardA.name} ⇄ ${cardB.name}`;
  const thread = openThread(a, b, subject);
  return NextResponse.json({ thread }, { status: 201 });
}
