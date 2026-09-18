/**
 * The negotiation driver.
 *
 * Three rules hold no matter which model is behind it, or whether any model is:
 *
 *  1. The model never emits a commitment directly. It proposes a structured
 *     offer; `evaluateOffer` decides whether that offer may leave the process,
 *     and `clampToMandate` pulls near-misses back inside the bounds.
 *  2. Proposing is not committing. A counter-offer only has to be inside the
 *     mandate. *Accepting* is the binding act, and that is where the human
 *     approval gate sits.
 *  3. If the model is unavailable, a deterministic concession strategy takes
 *     over and the negotiation still completes. No key is required to demo.
 */

import { chatJSON } from "./llm";
import { clampToMandate, describeMandate, evaluateOffer, totalValueOf } from "./mandate";
import {
  buildEnvelope,
  counterpartOf,
  isWellFormedOffer,
  lastOfferFrom,
  summariseOffer,
  turnsBy,
  whoseTurn,
} from "./protocol";
import { getAgent, getCard, isLocal, putThread } from "./store";
import { newId } from "./identity";
import type {
  Envelope,
  LocalAgent,
  Mandate,
  Offer,
  Thread,
  ThreadStatus,
  TurnRecord,
} from "./types";

/** After this many turns each, an unconverged thread is abandoned. */
const MAX_ROUNDS = 8;
/** Price gap, as a fraction, below which another round is not worth the delay. */
const CONVERGENCE = 0.02;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Thread lifecycle
// ---------------------------------------------------------------------------

export function openThread(a: string, b: string, subject: string): Thread {
  const now = new Date().toISOString();
  return putThread({
    id: newId("thr"),
    a,
    b,
    subject,
    status: "open",
    turns: [],
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Advance the thread by one turn, if it is a hosted agent's move.
 * Returns the turn taken, or null when the thread is waiting on a foreign agent,
 * a human, or is already settled.
 */
export async function advance(thread: Thread): Promise<TurnRecord | null> {
  const actor = whoseTurn(thread);
  if (!actor || !isLocal(actor)) return null;

  const agent = getAgent(actor);
  if (!agent) return null;

  const turn = await takeTurn(thread, agent);
  thread.turns.push(turn);
  applyTerminalState(thread, turn);
  putThread(thread);
  return turn;
}

/** Fold a just-appended turn into the thread's status. */
function applyTerminalState(thread: Thread, turn: TurnRecord) {
  const { type, body, from } = turn.envelope;
  if (type === "accept") {
    thread.status = "accepted";
    thread.settledOffer = body.offer;
  } else if (type === "reject") {
    thread.status = "rejected";
  } else if (type === "escalate") {
    thread.status = "awaiting-approval";
    if (body.offer && turn.verdict) {
      thread.pendingApproval = {
        agentId: from,
        offer: body.offer,
        reason: body.reason ?? "Human sign-off required before this commitment is binding.",
        verdict: turn.verdict,
      };
    }
  }
}

/**
 * Fold an inbound message from a counterparty into the thread.
 *
 * The case that matters here is an inbound `accept`. Our agent's own proposals
 * are non-binding, so a counterparty accepting one would otherwise close a deal
 * that our mandate says needs a human — letting the other side bind us past our
 * own authority simply by agreeing. So an acceptance is re-checked against the
 * recipient's mandate before the thread is allowed to settle.
 */
export function ingestInbound(
  thread: Thread,
  envelope: Envelope,
  recipient: LocalAgent,
): ThreadStatus {
  const offer = envelope.body.offer;

  if (envelope.type === "reject") {
    return (thread.status = "rejected");
  }

  if (envelope.type !== "accept") return thread.status;

  if (!offer) {
    return (thread.status = "accepted");
  }

  const verdict = evaluateOffer(offer, recipient.mandate);

  if (verdict.decision === "violates-mandate") {
    // They accepted terms we cannot honour. Say so on the wire rather than
    // silently closing.
    thread.turns.push({
      envelope: buildEnvelope({
        from: recipient.card.id,
        to: envelope.from,
        threadId: thread.id,
        type: "reject",
        body: {
          reason: verdict.violations.map((v) => v.message).join(" "),
          rationale:
            "Those are not terms I am authorised to agree, so I cannot treat that " +
            "acceptance as binding.",
        },
        privateKey: recipient.privateKey,
      }),
      verdict,
    });
    return (thread.status = "rejected");
  }

  if (verdict.decision === "needs-approval") {
    thread.pendingApproval = {
      agentId: recipient.card.id,
      offer,
      reason: verdict.approvalReason ?? "Human sign-off required before this becomes binding.",
      verdict,
    };
    return (thread.status = "awaiting-approval");
  }

  thread.settledOffer = offer;
  return (thread.status = "accepted");
}

// ---------------------------------------------------------------------------
// One agent's move
// ---------------------------------------------------------------------------

async function takeTurn(thread: Thread, agent: LocalAgent): Promise<TurnRecord> {
  const me = agent.card.id;
  const them = counterpartOf(thread, me);
  const mandate = agent.mandate;
  const theirOffer = lastOfferFrom(thread, them);
  const myLastOffer = lastOfferFrom(thread, me);
  const round = turnsBy(thread, me);

  const sign = (type: Parameters<typeof buildEnvelope>[0]["type"], body: Parameters<typeof buildEnvelope>[0]["body"]) =>
    buildEnvelope({ from: me, to: them, threadId: thread.id, type, body, privateKey: agent.privateKey });

  // --- Opening move ---
  if (!theirOffer) {
    const offer = openingOffer(mandate);
    const rationale =
      (await draftRationale(agent, thread, offer, undefined, "opening")) ??
      openingRationale(agent, offer);
    return {
      envelope: sign("propose", { offer, rationale, card: agent.card }),
      verdict: evaluateOffer(offer, mandate),
    };
  }

  // --- Is their offer acceptable to us? ---
  const theirVerdict = evaluateOffer(theirOffer, mandate);
  const acceptable = theirVerdict.decision !== "violates-mandate";
  const exhausted = round >= MAX_ROUNDS;

  // Take the deal when haggling on would not improve it: either their price
  // already beats the counter we were about to make, or the remaining gap is
  // too small to be worth another round. Computed from the deterministic
  // strategy so the decision to close never depends on the model.
  const nextCounter = heuristicCounter(mandate, myLastOffer, theirOffer, round).offer;
  const beatsOurNextMove =
    mandate.role === "seller"
      ? theirOffer.unitPrice >= nextCounter.unitPrice
      : theirOffer.unitPrice <= nextCounter.unitPrice;
  const converged = myLastOffer
    ? priceGap(myLastOffer, theirOffer) <= CONVERGENCE || beatsOurNextMove
    : beatsOurNextMove;

  if (acceptable && (converged || exhausted)) {
    // Accepting is the binding act, so this is the approval gate.
    if (theirVerdict.decision === "needs-approval") {
      return {
        envelope: sign("escalate", {
          offer: theirOffer,
          reason: theirVerdict.approvalReason,
          rationale:
            `Terms are inside my mandate and we have converged at ` +
            `${summariseOffer(theirOffer)}. This exceeds my authority to close, so ` +
            `I have referred it to a human at ${agent.card.name}.`,
        }),
        verdict: theirVerdict,
      };
    }
    return {
      envelope: sign("accept", {
        offer: theirOffer,
        rationale:
          (await draftRationale(agent, thread, theirOffer, theirOffer, "accept")) ??
          `Agreed at ${summariseOffer(theirOffer)}. This sits inside my mandate and I can close it.`,
      }),
      verdict: theirVerdict,
    };
  }

  if (exhausted) {
    return {
      envelope: sign("reject", {
        reason: "No overlap found inside my mandate within the available rounds.",
        rationale:
          `I cannot reach ${summariseOffer(theirOffer)} without breaching my mandate, ` +
          `and we have run out of room to converge.`,
      }),
      verdict: theirVerdict,
    };
  }

  // --- Counter ---
  const proposed = (await modelCounter(agent, thread, theirOffer)) ?? heuristicCounter(mandate, myLastOffer, theirOffer, round);

  const verdict = evaluateOffer(proposed.offer, mandate);
  let offer = proposed.offer;
  let clamped: TurnRecord["clamped"];

  if (verdict.decision === "violates-mandate") {
    const fixed = clampToMandate(proposed.offer, mandate);
    if (!fixed) {
      return {
        envelope: sign("reject", {
          reason: verdict.violations.map((v) => v.message).join(" "),
          rationale: "The only terms on the table fall outside what I am authorised to agree.",
        }),
        verdict,
      };
    }
    clamped = { from: proposed.offer, violations: verdict.violations };
    offer = fixed;
  }

  return {
    envelope: sign("counter", { offer, rationale: proposed.rationale }),
    verdict: evaluateOffer(offer, mandate),
    clamped,
  };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

function openingOffer(mandate: Mandate): Offer {
  const seller = mandate.role === "seller";
  // Both sides anchor roughly the same distance outside the likely zone of
  // agreement, so neither wins purely on having opened more aggressively.
  const anchor = seller
    ? (mandate.floorUnitPrice ?? 100) * 1.28
    : (mandate.ceilingUnitPrice ?? 100) * 0.76;
  const span = mandate.maxVolume - mandate.minVolume;
  return {
    sku: mandate.sku,
    currency: mandate.currency,
    unitPrice: round2(anchor),
    // Sellers open asking for more volume, buyers for less.
    volume: Math.round(mandate.minVolume + span * (seller ? 0.45 : 0.25)),
    termMonths: seller ? mandate.maxTermMonths : Math.max(3, Math.round(mandate.maxTermMonths * 0.5)),
    incoterm: mandate.allowedIncoterms[0],
    paymentTermsDays: seller ? Math.round(mandate.maxPaymentTermsDays * 0.4) : mandate.maxPaymentTermsDays,
    clauses: [],
  };
}

function priceGap(mine: Offer, theirs: Offer): number {
  const base = Math.max(mine.unitPrice, 1);
  return Math.abs(mine.unitPrice - theirs.unitPrice) / base;
}

/** Deterministic concession. Used when no model is configured, or as a floor under one. */
function heuristicCounter(
  mandate: Mandate,
  myLast: Offer | undefined,
  theirs: Offer,
  round: number,
): { offer: Offer; rationale: string } {
  const seller = mandate.role === "seller";
  const base = myLast ?? openingOffer(mandate);
  // Concede faster as the thread ages, so threads terminate.
  const rate = Math.min(0.6, 0.35 + round * 0.05);

  let unitPrice = base.unitPrice;
  if (seller) {
    // Never move up; never cross the floor.
    if (theirs.unitPrice < base.unitPrice) {
      unitPrice = base.unitPrice - (base.unitPrice - theirs.unitPrice) * rate;
    }
    unitPrice = Math.max(unitPrice, mandate.floorUnitPrice ?? 0);
  } else {
    if (theirs.unitPrice > base.unitPrice) {
      unitPrice = base.unitPrice + (theirs.unitPrice - base.unitPrice) * rate;
    }
    unitPrice = Math.min(unitPrice, mandate.ceilingUnitPrice ?? Infinity);
  }

  const volume = Math.round(
    Math.min(Math.max(base.volume + (theirs.volume - base.volume) * rate, mandate.minVolume), mandate.maxVolume),
  );
  const termMonths = Math.min(
    Math.round(base.termMonths + (theirs.termMonths - base.termMonths) * rate),
    mandate.maxTermMonths,
  );
  const paymentTermsDays = Math.min(
    Math.round(base.paymentTermsDays + (theirs.paymentTermsDays - base.paymentTermsDays) * rate),
    mandate.maxPaymentTermsDays,
  );

  const offer: Offer = {
    sku: mandate.sku,
    currency: mandate.currency,
    unitPrice: round2(unitPrice),
    volume,
    termMonths,
    incoterm: mandate.allowedIncoterms.includes(theirs.incoterm)
      ? theirs.incoterm
      : mandate.allowedIncoterms[0],
    paymentTermsDays,
    clauses: theirs.clauses.filter((c) => !mandate.forbiddenClauses.includes(c)),
  };

  const moved = round2(Math.abs(base.unitPrice - offer.unitPrice));
  return { offer, rationale: concessionLine(mandate, offer, moved, round, seller) };
}

/**
 * Wording for a deterministic concession. Varied by round so a fallback
 * transcript does not read as the same sentence three times — this text is on
 * screen, and repetition is what makes a demo look scripted.
 */
function concessionLine(
  mandate: Mandate,
  offer: Offer,
  moved: number,
  round: number,
  seller: boolean,
): string {
  const c = mandate.currency;
  if (!moved) {
    return (
      `Holding at ${c} ${offer.unitPrice}. I have room on ` +
      `${seller ? "payment terms" : "volume"} rather than rate if that helps close it.`
    );
  }

  const sellerLines = [
    `We can come down ${c} ${moved} to ${c} ${offer.unitPrice} if you take ${offer.volume} units. ` +
      `Committed volume is what makes the lane work at that rate.`,
    `${c} ${offer.unitPrice} against ${offer.volume} units over ${offer.termMonths} months. ` +
      `That is a real move on our side, not a rounding of the last number.`,
    `Taking another ${c} ${moved} off, to ${c} ${offer.unitPrice}. ` +
      `We are close to where this lane stops carrying at that volume.`,
    `${c} ${offer.unitPrice}. That is the last meaningful step we have on rate — ` +
      `beyond this we would be talking about term, not price.`,
  ];

  const buyerLines = [
    `We can go to ${c} ${offer.unitPrice} for ${offer.volume} units. ` +
      `The volume is firm, which should be worth something against the rate.`,
    `${c} ${offer.unitPrice} over ${offer.termMonths} months. ` +
      `We are moving ${c} ${moved} on the strength of the commitment behind it.`,
    `Up ${c} ${moved} to ${c} ${offer.unitPrice}. ` +
      `We would rather settle this than keep trading numbers.`,
    `${c} ${offer.unitPrice} and ${offer.volume} units. ` +
      `That is close to the end of what this route justifies for us.`,
  ];

  const lines = seller ? sellerLines : buyerLines;
  return lines[Math.min(round, lines.length - 1)];
}

// ---------------------------------------------------------------------------
// Model-assisted moves
// ---------------------------------------------------------------------------

type ModelMove = { offer?: unknown; rationale?: string };

/**
 * Ask the model for a counter-offer. Returns null whenever the model is absent
 * or its output is unusable, which sends the caller to the heuristic.
 */
async function modelCounter(
  agent: LocalAgent,
  thread: Thread,
  theirs: Offer,
): Promise<{ offer: Offer; rationale: string } | null> {
  const mandate = agent.mandate;
  const result = await chatJSON<ModelMove>({
    system:
      `You are the autonomous commercial agent for ${agent.card.name} (${agent.card.domain}).\n\n` +
      `What the company does:\n${agent.card.purpose}\n\n` +
      `Your mandate — these are hard limits, not preferences:\n${describeMandate(mandate)}\n\n` +
      `You are negotiating with another company's agent. Move toward a deal, but ` +
      `concede gradually and justify every move commercially. Never restate your ` +
      `internal limits to the other side.\n\n` +
      `Reply with JSON only:\n` +
      `{"offer":{"sku":string,"currency":string,"unitPrice":number,"volume":number,` +
      `"termMonths":number,"incoterm":string,"paymentTermsDays":number,"clauses":string[]},` +
      `"rationale":string}\n` +
      `"rationale" is one or two sentences addressed to the other agent.`,
    user:
      `Subject: ${thread.subject}\n\n` +
      `Transcript so far:\n${transcriptFor(thread)}\n\n` +
      `Their current offer: ${summariseOffer(theirs)}\n` +
      (theirs.clauses.length ? `Their clauses: ${theirs.clauses.join(", ")}\n` : "") +
      `\nGive your counter-offer.`,
    temperature: 0.5,
  });

  if (!result || !isWellFormedOffer(result.offer)) return null;
  return {
    offer: result.offer,
    rationale:
      typeof result.rationale === "string" && result.rationale.trim()
        ? result.rationale.trim()
        : `Countering at ${mandate.currency} ${result.offer.unitPrice}.`,
  };
}

/** Model-written prose for openings and acceptances. Null falls back to a template. */
async function draftRationale(
  agent: LocalAgent,
  thread: Thread,
  offer: Offer,
  theirs: Offer | undefined,
  kind: "opening" | "accept",
): Promise<string | null> {
  const result = await chatJSON<{ rationale?: string }>({
    system:
      `You are the commercial agent for ${agent.card.name}. ${agent.card.purpose}\n` +
      `Write one or two sentences to the other company's agent. Be direct and ` +
      `commercial. Never reveal your internal price limits.\n` +
      `Reply with JSON only: {"rationale": string}`,
    user:
      kind === "opening"
        ? `Open a negotiation on "${thread.subject}" with this offer: ${summariseOffer(offer)}.`
        : `You are accepting these terms: ${summariseOffer(offer)}. Confirm briefly.`,
    temperature: 0.6,
    maxTokens: 200,
  });
  const text = result?.rationale;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function openingRationale(agent: LocalAgent, offer: Offer): string {
  const seller = agent.mandate.role === "seller";
  return seller
    ? `We have dedicated capacity on this lane. Opening at ${offer.currency} ` +
        `${offer.unitPrice.toLocaleString()} per unit for ${offer.volume} units over ` +
        `${offer.termMonths} months, ${offer.incoterm}.`
    : `We are looking to commit volume on this lane. We can work with ` +
        `${offer.volume} units over ${offer.termMonths} months at ${offer.currency} ` +
        `${offer.unitPrice.toLocaleString()} per unit, ${offer.incoterm}.`;
}

function transcriptFor(thread: Thread): string {
  if (thread.turns.length === 0) return "(no messages yet)";
  return thread.turns
    .slice(-8)
    .map((t) => {
      const name = getCard(t.envelope.from)?.name ?? t.envelope.from;
      const offer = t.envelope.body.offer ? ` [${summariseOffer(t.envelope.body.offer)}]` : "";
      return `${name} (${t.envelope.type})${offer}: ${t.envelope.body.rationale ?? t.envelope.body.reason ?? ""}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Human approval
// ---------------------------------------------------------------------------

/**
 * Resolve a parked thread. Approving converts the escalated offer into a signed
 * `accept` from the escalating agent — the human's decision is what makes it
 * binding, so it is recorded on the wire like any other move.
 */
export function resolveApproval(thread: Thread, approve: boolean, note?: string): Thread | null {
  const pending = thread.pendingApproval;
  if (!pending || thread.status !== "awaiting-approval") return null;

  const agent = getAgent(pending.agentId);
  if (!agent) return null;

  const them = counterpartOf(thread, pending.agentId);
  const envelope = buildEnvelope({
    from: pending.agentId,
    to: them,
    threadId: thread.id,
    type: approve ? "accept" : "reject",
    body: approve
      ? {
          offer: pending.offer,
          rationale:
            note?.trim() ||
            `Approved by ${agent.card.name}. Confirmed at ${summariseOffer(pending.offer)}, ` +
              `total ${pending.offer.currency} ${totalValueOf(pending.offer).toLocaleString()}.`,
        }
      : {
          reason: note?.trim() || "Declined by a human reviewer at " + agent.card.name + ".",
          rationale: "We are not proceeding on these terms.",
        },
    privateKey: agent.privateKey,
  });

  const turn: TurnRecord = { envelope, verdict: pending.verdict };
  thread.turns.push(turn);
  thread.pendingApproval = undefined;
  thread.status = approve ? "accepted" : "rejected";
  if (approve) thread.settledOffer = pending.offer;
  return putThread(thread);
}
