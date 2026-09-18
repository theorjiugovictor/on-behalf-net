/**
 * The human decision point.
 *
 * A parked thread resumes only from here. The approval is recorded as a signed
 * message on the wire like any other move, so the audit trail shows a human
 * closed the deal rather than an agent.
 */

import { NextResponse } from "next/server";
import { resolveApproval } from "@/lib/negotiate";
import { getThread } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const thread = getThread(id);
  if (!thread) return NextResponse.json({ error: `Unknown thread "${id}".` }, { status: 404 });

  if (thread.status !== "awaiting-approval") {
    return NextResponse.json(
      { error: `Thread is ${thread.status}; nothing is awaiting approval.` },
      { status: 409 },
    );
  }

  let body: { approve?: boolean; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "`approve` must be true or false." }, { status: 400 });
  }

  const updated = resolveApproval(thread, body.approve, body.note);
  if (!updated) {
    return NextResponse.json({ error: "Approval could not be applied." }, { status: 409 });
  }

  return NextResponse.json({ thread: updated });
}
