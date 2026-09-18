/**
 * Envelope construction, verification, and thread inspection.
 *
 * These helpers are the only place envelopes are made or trusted. Routes call
 * `verifyInbound` before anything else touches a foreign message.
 */

import { newId, signEnvelope, verifyDelegation, verifyEnvelope } from "./identity";
import { hasSeenNonce, recordNonce } from "./store";
import type { AgentCard, Deal, Envelope, EnvelopeBody, MessageType, Thread } from "./types";
import { PROTOCOL, SUPPORTED_PROTOCOLS } from "./types";

export function buildEnvelope(args: {
  from: string;
  to: string;
  threadId: string;
  type: MessageType;
  body: EnvelopeBody;
  privateKey: string;
  validForMs?: number;
}): Envelope {
  const now = new Date();
  const ts = now.toISOString();
  const validUntil = new Date(now.getTime() + (args.validForMs ?? 24 * 60 * 60 * 1000)).toISOString();
  const unsigned: Omit<Envelope, "sig"> = {
    protocol: PROTOCOL,
    id: newId("msg"),
    threadId: args.threadId,
    from: args.from,
    to: args.to,
    type: args.type,
    ts,
    validUntil,
    nonce: newId("non"),
    body: args.body,
  };
  return signEnvelope(unsigned, args.privateKey);
}

export type InboundCheck = { ok: true } | { ok: false; error: string; status: number };

/**
 * Validate a message that arrived from outside this process. Order matters:
 * shape, then protocol version, then replay/expiry, then identity, then signature.
 * A caller that skips any step is trusting an unauthenticated stranger.
 */
export function verifyInbound(envelope: Envelope, card: AgentCard | undefined): InboundCheck {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, error: "Body is not an envelope.", status: 400 };
  }
  if (!SUPPORTED_PROTOCOLS.includes(envelope.protocol as (typeof SUPPORTED_PROTOCOLS)[number])) {
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

  // Replay and expiration checks for obn/0.3
  if (envelope.protocol === "obn/0.3") {
    if (typeof envelope.validUntil !== "string" || !envelope.validUntil) {
      return { ok: false, error: 'Envelope is missing "validUntil".', status: 400 };
    }
    if (typeof envelope.nonce !== "string" || !envelope.nonce) {
      return { ok: false, error: 'Envelope is missing "nonce".', status: 400 };
    }
    const expiry = Date.parse(envelope.validUntil);
    if (Number.isNaN(expiry)) {
      return { ok: false, error: 'Envelope "validUntil" is not a valid date.', status: 400 };
    }
    if (Date.now() > expiry + 60_000) {
      return { ok: false, error: `Envelope has expired (validUntil: ${envelope.validUntil}).`, status: 400 };
    }
    if (hasSeenNonce(envelope.nonce)) {
      return {
        ok: false,
        error: `Envelope nonce "${envelope.nonce}" has already been processed (replay detected).`,
        status: 409,
      };
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

  // If card presents a delegation, verify it against the operational key
  if (card.delegation) {
    if (!verifyDelegation(card.delegation)) {
      return { ok: false, error: "Card key delegation is invalid or expired.", status: 401 };
    }
    if (card.delegation.delegatedTo !== card.publicKey) {
      return { ok: false, error: "Card delegation does not match operational public key.", status: 400 };
    }
  }

  if (!verifyEnvelope(envelope, card.publicKey)) {
    return {
      ok: false,
      error: "Signature does not verify against the sender's public key.",
      status: 401,
    };
  }

  // Record nonce once signature is verified
  if (envelope.nonce) {
    recordNonce(envelope.nonce);
  }

  return { ok: true };
}

/**
 * Shape-check a deal that arrived over the wire, before policy sees it. Only
 * structure is checked here — whether the values are *permitted* is the
 * mandate's business, not the protocol's.
 */
export function isWellFormedDeal(value: unknown): value is Deal {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  if (typeof d.subject !== "string" || !d.subject) return false;
  if (!d.terms || typeof d.terms !== "object" || Array.isArray(d.terms)) return false;
  return Object.values(d.terms as Record<string, unknown>).every(isTermValue);
}

function isTermValue(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" || typeof v === "boolean") return true;
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export const counterpartOf = (thread: Thread, agentId: string) =>
  thread.a === agentId ? thread.b : thread.a;

export function lastEnvelope(thread: Thread): Envelope | undefined {
  return thread.turns[thread.turns.length - 1]?.envelope;
}

/** Most recent set of terms put on the table by `agentId`, if any. */
export function lastDealFrom(thread: Thread, agentId: string): Deal | undefined {
  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const { envelope } = thread.turns[i];
    if (envelope.from === agentId && envelope.body.deal) return envelope.body.deal;
  }
  return undefined;
}

/** Most recent deals put on the table by `agentId`, oldest to newest. */
export function recentDealsFrom(thread: Thread, agentId: string, limit = 2): Deal[] {
  const deals: Deal[] = [];
  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const { envelope } = thread.turns[i];
    if (envelope.from === agentId && envelope.body.deal) {
      deals.unshift(envelope.body.deal);
      if (deals.length >= limit) break;
    }
  }
  return deals;
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
