/**
 * The negotiation driver.
 *
 * Three rules hold no matter which model is behind it, or whether any model is:
 *
 *  1. The model never emits a commitment directly. It proposes a structured
 *     deal; `evaluateDeal` decides whether that deal may leave the process, and
 *     `clampToMandate` pulls near-misses back inside the bounds.
 *  2. Proposing is not committing. A counter-offer only has to be inside the
 *     mandate. *Accepting* is the binding act, and that is where the human
 *     approval gate sits.
 *  3. If the model is unavailable, a deterministic concession strategy takes
 *     over and the negotiation still completes. No key is required to demo.
 *
 * The strategy is term-agnostic: it concedes along whatever ordered terms the
 * mandate declares, weighted by how much each one matters, and decides when to
 * close by comparing utilities rather than prices.
 */

import { chatJSON } from "./llm";
import {
  clampToMandate,
  describeMandate,
  evaluateDeal,
  specFor,
  summariseDeal,
  unmandatedTerms,
  utilityOf,
} from "./mandate";
import { concedeTerm, formatTermValue, isOrdered, openingOrdinal, fromOrdinal, typeOfBound } from "./terms";
import {
  buildEnvelope,
  counterpartOf,
  isWellFormedDeal,
  lastDealFrom,
  recentDealsFrom,
  turnsBy,
  whoseTurn,
} from "./protocol";
import { getAgent, getCard, isLocal, putThread } from "./store";
import { newId } from "./identity";
import { principalHandle } from "./principal";
import type {
  Deal,
  Envelope,
  LocalAgent,
  Mandate,
  PolicyContext,
  TermSpec,
  TermValue,
  Thread,
  ThreadStatus,
  TurnRecord,
} from "./types";

/** After this many turns each, an unconverged thread is abandoned. */
const MAX_ROUNDS = 8;
/** Utility gain, 0–1, below which another round is not worth the delay. */
const CONVERGENCE = 0.045;

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
    thread.settledDeal = body.deal;
  } else if (type === "reject") {
    thread.status = "rejected";
  } else if (type === "escalate") {
    thread.status = "awaiting-approval";
    if (body.deal && turn.verdict) {
      thread.pendingApproval = {
        agentId: from,
        deal: body.deal,
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
  const deal = envelope.body.deal;

  if (envelope.type === "reject") {
    return (thread.status = "rejected");
  }
  if (envelope.type !== "accept") return thread.status;
  if (!deal) return (thread.status = "accepted");

  const verdict = evaluateDeal(deal, recipient.mandate, {
    counterparty: getCard(envelope.from),
  });

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
      deal,
      reason: verdict.approvalReason ?? "Human sign-off required before this becomes binding.",
      verdict,
    };
    return (thread.status = "awaiting-approval");
  }

  thread.settledDeal = deal;
  return (thread.status = "accepted");
}

// ---------------------------------------------------------------------------
// One agent's move
// ---------------------------------------------------------------------------

async function takeTurn(thread: Thread, agent: LocalAgent): Promise<TurnRecord> {
  const me = agent.card.id;
  const them = counterpartOf(thread, me);
  const mandate = agent.mandate;
  const theirDeal = lastDealFrom(thread, them);
  const myLastDeal = lastDealFrom(thread, me);
  const round = turnsBy(thread, me);
  // Who we are dealing with is part of whether we may close, not just what.
  const context: PolicyContext = { counterparty: getCard(them) };

  const sign = (
    type: Parameters<typeof buildEnvelope>[0]["type"],
    body: Parameters<typeof buildEnvelope>[0]["body"],
  ) =>
    buildEnvelope({ from: me, to: them, threadId: thread.id, type, body, privateKey: agent.privateKey });

  // --- Opening move ---
  if (!theirDeal) {
    const deal = openingDeal(mandate);
    const rationale =
      (await draftRationale(agent, thread, deal, "opening")) ?? openingRationale(agent, deal);
    return {
      envelope: sign("propose", { deal, rationale, card: agent.card }),
      verdict: evaluateDeal(deal, mandate, context),
    };
  }

  // --- Is their deal acceptable to us? ---
  const theirVerdict = evaluateDeal(theirDeal, mandate, context);
  const acceptable = theirVerdict.decision !== "violates-mandate";
  const exhausted = round >= MAX_ROUNDS;

  // Take the deal when haggling on would not improve it: either their terms
  // already beat the counter we were about to make, or the remaining gain is
  // too small to be worth another round. Computed from the deterministic
  // strategy so the decision to close never depends on the model.
  const nextMove = heuristicCounter(mandate, myLastDeal, theirDeal, round, thread, them);
  const theirUtility = theirVerdict.utility;
  const nextUtility = utilityOf(nextMove.deal, mandate);
  const converged = theirUtility >= nextUtility || nextUtility - theirUtility <= CONVERGENCE;

  if (acceptable && (converged || exhausted)) {
    // Accepting is the binding act, so this is the approval gate.
    if (theirVerdict.decision === "needs-approval") {
      return {
        envelope: sign("escalate", {
          deal: theirDeal,
          reason: theirVerdict.approvalReason,
          rationale:
            `Terms are inside my mandate and we have converged on ` +
            `${summariseDeal(theirDeal, mandate)}. This exceeds my authority to close, so ` +
            `I have referred it to a human at ${agent.card.name}.`,
        }),
        verdict: theirVerdict,
      };
    }
    return {
      envelope: sign("accept", {
        deal: theirDeal,
        rationale:
          (await draftRationale(agent, thread, theirDeal, "accept")) ??
          `Agreed on ${summariseDeal(theirDeal, mandate)}. That sits inside my mandate and I can close it.`,
      }),
      verdict: theirVerdict,
    };
  }

  if (exhausted) {
    return {
      envelope: sign("reject", {
        reason: "No overlap found inside my mandate within the available rounds.",
        rationale:
          `I cannot reach ${summariseDeal(theirDeal, mandate)} without breaching my mandate, ` +
          `and we have run out of room to converge.`,
      }),
      verdict: theirVerdict,
    };
  }

  // --- Counter ---
  // If counterparty stonewalled (zero movement across last two turns), hold ground firmly
  // under reciprocal Tit-for-Tat rather than letting LLM hallucinate concessions.
  let isStonewalled = false;
  if (myLastDeal && them) {
    const theirRecent = recentDealsFrom(thread, them, 2);
    if (theirRecent.length >= 2) {
      const priorUtility = utilityOf(theirRecent[0], mandate);
      const currentUtility = utilityOf(theirRecent[1], mandate);
      if (currentUtility - priorUtility <= 0.0001) {
        isStonewalled = true;
      }
    }
  }

  const proposed = isStonewalled
    ? nextMove
    : ((await modelCounter(agent, thread, theirDeal)) ?? nextMove);

  const verdict = evaluateDeal(proposed.deal, mandate, context);
  let deal = proposed.deal;
  let clamped: TurnRecord["clamped"];

  if (verdict.decision === "violates-mandate") {
    const fixed = clampToMandate(proposed.deal, mandate);
    if (!fixed) {
      return {
        envelope: sign("reject", {
          reason: verdict.violations.map((v) => v.message).join(" "),
          rationale: "The only terms on the table fall outside what I am authorised to agree.",
        }),
        verdict,
      };
    }
    clamped = { from: proposed.deal, violations: verdict.violations };
    deal = fixed;
  }

  // Tell them plainly when we have dropped an ask we have no authority over,
  // rather than letting it disappear from the thread.
  const ignored = unmandatedTerms(theirDeal, mandate);
  const rationale = ignored.length
    ? `${proposed.rationale} I have no mandate covering ${ignored.map((t) => `"${t}"`).join(", ")}, ` +
      `so I have left ${ignored.length > 1 ? "them" : "it"} out rather than agree to ${ignored.length > 1 ? "them" : "it"}.`
    : proposed.rationale;

  return {
    envelope: sign("counter", { deal, rationale }),
    verdict: evaluateDeal(deal, mandate, context),
    clamped,
  };
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

/** Every term at this party's opening position. */
export function openingDeal(mandate: Mandate): Deal {
  const terms: Record<string, TermValue> = {};
  for (const spec of mandate.terms) {
    terms[spec.key] = openingValue(spec);
  }
  return { subject: mandate.subject, terms };
}

function openingValue(spec: TermSpec): TermValue {
  if (isOrdered(spec.bound)) {
    const n = openingOrdinal(spec);
    if (n !== null) return fromOrdinal(n, spec.bound);
  }
  const b = spec.bound;
  if (b.kind === "enum") return b.preference?.[0] ?? b.allowed[0];
  if (b.kind === "set") return [...(b.required ?? [])];
  if (b.kind === "boolean") return b.mustBe ?? spec.direction === "higher-better";
  return "";
}

/** Deterministic concession with reciprocal concession matching. */
function heuristicCounter(
  mandate: Mandate,
  myLast: Deal | undefined,
  theirs: Deal,
  round: number,
  thread?: Thread,
  counterpartId?: string,
): { deal: Deal; rationale: string } {
  let rate = Math.min(0.65, 0.35 + round * 0.05);
  let stonewalled = false;

  // Reciprocal Concession Matching: If we have counterparty history, check whether they moved
  if (thread && counterpartId) {
    const theirRecent = recentDealsFrom(thread, counterpartId, 2);
    if (theirRecent.length >= 2) {
      const priorUtility = utilityOf(theirRecent[0], mandate);
      const currentUtility = utilityOf(theirRecent[1], mandate);
      const theirMovement = currentUtility - priorUtility;

      if (theirMovement <= 0.0001) {
        // Counterparty made zero concession or regressed away from our interests.
        // Freeze concession to defeat the stonewall exploit.
        rate = 0;
        stonewalled = true;
      } else {
        // Concede proportionally to their movement
        rate = Math.max(0.20, Math.min(0.65, theirMovement * 1.5 + round * 0.03));
      }
    }
  }

  const base = myLast ?? openingDeal(mandate);
  const terms: Record<string, TermValue> = {};

  for (const spec of mandate.terms) {
    const next = concedeTerm(base.terms[spec.key], theirs.terms[spec.key], spec, rate);
    terms[spec.key] = next ?? openingValue(spec);
  }

  const deal: Deal = {
    subject: mandate.subject,
    terms,
    ...(theirs.ricardian ?? (base.ricardian ? { ricardian: base.ricardian } : {})),
  };
  return { deal, rationale: concessionLine(mandate, base, deal, round, stonewalled) };
}

/** The terms that actually moved, biggest first, for writing the rationale. */
function movedTerms(mandate: Mandate, from: Deal, to: Deal) {
  const moves: Array<{ spec: TermSpec; before: TermValue; after: TermValue; size: number }> = [];
  for (const spec of mandate.terms) {
    const before = from.terms[spec.key];
    const after = to.terms[spec.key];
    if (before === undefined || after === undefined) continue;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const size =
      typeof before === "number" && typeof after === "number" && before !== 0
        ? Math.abs(after - before) / Math.abs(before)
        : 0.5;
    moves.push({ spec, before, after, size: size * (0.5 + spec.weight) });
  }
  return moves.sort((a, b) => b.size - a.size);
}

const show = (value: TermValue, spec: TermSpec) =>
  formatTermValue(value, typeOfBound(spec.bound), spec.bound.kind === "number" ? spec.bound.unit : undefined);

/**
 * Wording for a deterministic concession, built from whichever terms moved.
 * Varied by round because this text is on screen, and repetition is what makes
 * a demo look scripted.
 */
function concessionLine(
  mandate: Mandate,
  from: Deal,
  to: Deal,
  round: number,
  stonewalled = false,
): string {
  const moves = movedTerms(mandate, from, to);

  if (moves.length === 0) {
    if (stonewalled) {
      return `We are holding where we are. Without reciprocal movement from your side, we cannot offer further concessions.`;
    }
    const tradeable = mandate.terms.filter((s) => s.weight < 0.5)[0];
    return tradeable
      ? `We are holding where we are on the headline terms, but there is room on ${tradeable.label.toLowerCase()} if that helps close it.`
      : `We are at the edge of what we can do on these terms.`;
  }

  const lead = moves[0];
  const second = moves[1];
  const leadText = `${lead.spec.label.toLowerCase()} to ${show(lead.after, lead.spec)}`;
  const secondText = second ? `, and ${second.spec.label.toLowerCase()} to ${show(second.after, second.spec)}` : "";

  const openers = [
    `We can move ${leadText}${secondText}.`,
    `${capitalise(leadText)}${secondText}. That is a real move on our side, not a rounding of the last number.`,
    `Taking ${leadText}${secondText}. We are getting close to where this stops working for us.`,
    `${capitalise(leadText)}${secondText} — that is the last meaningful step we have.`,
  ];

  const closers = [
    "",
    " The commitment behind it should be worth something against the rest.",
    " We would rather settle this than keep trading numbers.",
    " Beyond this we would be talking about scope, not terms.",
  ];

  const i = Math.min(round, openers.length - 1);
  return openers[i] + closers[i];
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Model-assisted moves
// ---------------------------------------------------------------------------

type ModelMove = { terms?: unknown; rationale?: string };

/**
 * Ask the model for a counter-offer. Returns null whenever the model is absent
 * or its output is unusable, which sends the caller to the heuristic.
 */
async function modelCounter(
  agent: LocalAgent,
  thread: Thread,
  theirs: Deal,
): Promise<{ deal: Deal; rationale: string } | null> {
  const mandate = agent.mandate;
  const schema = mandate.terms
    .map((s) => `  "${s.key}": ${jsonHintFor(s)}   // ${s.label}`)
    .join("\n");

  const result = await chatJSON<ModelMove>({
    system:
      `You are the autonomous commercial agent for ${agent.card.name} (${principalHandle(agent.card.principal)}).\n\n` +
      `What the company does:\n${agent.card.purpose}\n\n` +
      `${describeMandate(mandate)}\n\n` +
      `You are negotiating with another company's agent. Move toward a deal, but ` +
      `concede gradually and justify every move commercially.\n\n` +
      `Reply with JSON only, in exactly this shape:\n` +
      `{\n  "terms": {\n${schema}\n  },\n  "rationale": string\n}\n` +
      `"rationale" is one or two sentences addressed to the other agent.`,
    user:
      `Subject: ${thread.subject}\n\n` +
      `Transcript so far:\n${transcriptFor(thread)}\n\n` +
      `Their current position: ${summariseDeal(theirs, mandate)}\n\n` +
      `Give your counter-offer.`,
    temperature: 0.5,
    maxTokens: 900,
  });

  if (!result || !isWellFormedDeal({ subject: mandate.subject, terms: result.terms })) return null;

  return {
    deal: { subject: mandate.subject, terms: result.terms as Record<string, TermValue> },
    rationale:
      typeof result.rationale === "string" && result.rationale.trim()
        ? result.rationale.trim()
        : "Here is where we can get to.",
  };
}

function jsonHintFor(spec: TermSpec): string {
  const b = spec.bound;
  switch (b.kind) {
    case "number":
      return "number";
    case "date":
      return '"YYYY-MM-DD"';
    case "enum":
      return b.allowed.map((a) => `"${a}"`).join(" | ");
    case "set":
      return "string[]";
    case "boolean":
      return "true | false";
    case "text":
      return "string";
  }
}

/** Model-written prose for openings and acceptances. Null falls back to a template. */
async function draftRationale(
  agent: LocalAgent,
  thread: Thread,
  deal: Deal,
  kind: "opening" | "accept",
): Promise<string | null> {
  const result = await chatJSON<{ rationale?: string }>({
    system:
      `You are the commercial agent for ${agent.card.name}. ${agent.card.purpose}\n` +
      `Write one or two sentences to the other company's agent. Be direct and ` +
      `commercial. Never reveal your internal limits.\n` +
      `Reply with JSON only: {"rationale": string}`,
    user:
      kind === "opening"
        ? `Open a negotiation on "${thread.subject}" with these terms: ${summariseDeal(deal, agent.mandate)}.`
        : `You are accepting these terms: ${summariseDeal(deal, agent.mandate)}. Confirm briefly.`,
    temperature: 0.6,
    maxTokens: 200,
  });
  const text = result?.rationale;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function openingRationale(agent: LocalAgent, deal: Deal): string {
  const mandate = agent.mandate;
  const ranked = [...mandate.terms].sort((a, b) => b.weight - a.weight);
  const headline = ranked[0];
  const second = ranked[1];

  if (!headline) return "We are set up for exactly this kind of arrangement. Here is where we open.";

  const lead = `${headline.label.toLowerCase()} at ${show(deal.terms[headline.key], headline)}`;
  const support = second
    ? ` against ${second.label.toLowerCase()} of ${show(deal.terms[second.key], second)}`
    : "";
  return `We are set up for exactly this kind of arrangement. Opening at ${lead}${support}.`;
}

function transcriptFor(thread: Thread): string {
  if (thread.turns.length === 0) return "(no messages yet)";
  return thread.turns
    .slice(-8)
    .map((t) => {
      const name = getCard(t.envelope.from)?.name ?? t.envelope.from;
      const deal = t.envelope.body.deal ? ` [${summariseDeal(t.envelope.body.deal)}]` : "";
      return `${name} (${t.envelope.type})${deal}: ${t.envelope.body.rationale ?? t.envelope.body.reason ?? ""}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Human approval
// ---------------------------------------------------------------------------

/**
 * Resolve a parked thread. Approving converts the escalated deal into a signed
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
          deal: pending.deal,
          rationale:
            note?.trim() ||
            `Approved by human reviewer for ${agent.card.name}. Confirmed on ${summariseDeal(pending.deal, agent.mandate)}.`,
          humanSignOff: {
            approver: agent.card.name,
            approvedAt: new Date().toISOString(),
            note: note?.trim(),
          },
        }
      : {
          reason: note?.trim() || `Declined by a human reviewer at ${agent.card.name}.`,
          rationale: "We are not proceeding on these terms.",
        },
    privateKey: agent.privateKey,
  });

  thread.turns.push({ envelope, verdict: pending.verdict });
  thread.pendingApproval = undefined;
  thread.status = approve ? "accepted" : "rejected";
  if (approve) thread.settledDeal = pending.deal;
  return putThread(thread);
}

/** Re-exported so callers do not need to reach into mandate.ts for one helper. */
export { specFor };
