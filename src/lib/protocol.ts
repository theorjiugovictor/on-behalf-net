/**
 * Envelope construction, verification, and thread inspection.
 *
 * These helpers are the only place envelopes are made or trusted. Routes call
 * `verifyInbound` before anything else touches a foreign message.
 */

import { newId, signEnvelope, verifyEnvelope } from "./identity";
import type { AgentCard, Envelope, EnvelopeBody, MessageType, Offer, Thread } from "./types";
import { PROTOCOL } from "./types";

export function buildEnvelope(args: {
  from: string;
  to: string;
  threadId: string;
  type: MessageType;
  body: EnvelopeBody;
  privateKey: string;
}): Envelope {
  const unsigned: Omit<Envelope, "sig"> = {
    protocol: PROTOCOL,
    id: newId("msg"),
    threadId: args.threadId,
    from: args.from,
    to: args.to,
    type: args.type,
    ts: new Date().toISOString(),
    body: args.body,
  };
  return signEnvelope(unsigned, args.privateKey);
}

export type InboundCheck = { ok: true } | { ok: false; error: string; status: number };

/**
 * Validate a message that arrived from outside this process. Order matters:
 * shape, then protocol version, then identity, then signature. A caller that
 * skips any step is trusting an unauthenticated stranger.
 */
export function verifyInbound(envelope: Envelope, card: AgentCard | undefined): InboundCheck {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, error: "Body is not an envelope.", status: 400 };
  }
  if (envelope.protocol !== PROTOCOL) {
    return {
      ok: false,
      error: `Unsupported protocol "${envelope.protocol}". This node speaks ${PROTOCOL}.`,
      status: 400,
    };
  }
  for (const field of ["id", "threadId", "from", "to", "type", "ts", "sig"] as const) {
    if (typeof envelope[field] !== "string" || !envelope[field]) {
      return { ok: false, error: `Envelope is missing "${field}".`, status: 400 };
    }
  }
  if (!card) {
    return {
      ok: false,
      error:
        `Unknown sender "${envelope.from}". Include your agent card in body.card on ` +
        `the first message of a thread so this node can learn your public key.`,
      status: 404,
    };
  }
  if (card.id !== envelope.from) {
    return { ok: false, error: "Card id does not match envelope sender.", status: 400 };
  }
  if (!verifyEnvelope(envelope, card.publicKey)) {
    return { ok: false, error: "Signature does not verify against the sender's public key.", status: 401 };
  }
  return { ok: true };
}

/** Shape-check an offer that arrived over the wire before policy sees it. */
export function isWellFormedOffer(value: unknown): value is Offer {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.sku === "string" &&
    typeof o.currency === "string" &&
    typeof o.unitPrice === "number" &&
    Number.isFinite(o.unitPrice) &&
    typeof o.volume === "number" &&
    Number.isFinite(o.volume) &&
    typeof o.termMonths === "number" &&
    typeof o.incoterm === "string" &&
    typeof o.paymentTermsDays === "number" &&
    Array.isArray(o.clauses) &&
    o.clauses.every((c) => typeof c === "string")
  );
}

export const counterpartOf = (thread: Thread, agentId: string) =>
  thread.a === agentId ? thread.b : thread.a;

export function lastEnvelope(thread: Thread): Envelope | undefined {
  return thread.turns[thread.turns.length - 1]?.envelope;
}

/** Most recent offer put on the table by `agentId`, if any. */
export function lastOfferFrom(thread: Thread, agentId: string): Offer | undefined {
  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const { envelope } = thread.turns[i];
    if (envelope.from === agentId && envelope.body.offer) return envelope.body.offer;
  }
  return undefined;
}

export const turnsBy = (thread: Thread, agentId: string) =>
  thread.turns.filter((t) => t.envelope.from === agentId).length;

/**
 * Whose move it is. The opener speaks first; after that it alternates, and a
 * terminal message ends the thread.
 */
export function whoseTurn(thread: Thread): string | null {
  if (thread.status !== "open") return null;
  const last = lastEnvelope(thread);
  if (!last) return thread.a;
  if (last.type === "accept" || last.type === "reject") return null;
  return counterpartOf(thread, last.from);
}

/** Human-readable one-liner for logs and the floor's status strip. */
export function summariseOffer(offer: Offer, currency = offer.currency): string {
  return (
    `${currency} ${offer.unitPrice.toLocaleString()}/unit × ${offer.volume.toLocaleString()} units, ` +
    `${offer.termMonths}mo, ${offer.incoterm}, net ${offer.paymentTermsDays}`
  );
}
