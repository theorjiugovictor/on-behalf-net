/**
 * The public agent card.
 *
 * Deliberately unauthenticated and CORS-open: discovery has to work from any
 * origin for BYOA to mean anything. Nothing secret is served here — the card is
 * a public key and an endpoint.
 */

import { NextResponse } from "next/server";
import { getCard, getAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agentId = decodeURIComponent(id);
  const card = getCard(agentId);

  if (!card) {
    return NextResponse.json({ error: `Unknown agent "${agentId}".` }, { status: 404 });
  }

  const local = getAgent(agentId);
  // Spreading the card is safe because contact details are never stored on one —
  // they live in a separate map in store.ts, keyed by agent id. If that ever
  // changes, this is the line that starts leaking email addresses to strangers.
  return NextResponse.json(
    {
      ...card,
      hosted: Boolean(local),
      // The mandate's *shape* is public; its thresholds are not. Counterparties
      // learn the bounds by hitting them, exactly as in human negotiation.
      mandateVersion: local?.mandate.version,
      role: local?.mandate.role,
    },
    { headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
