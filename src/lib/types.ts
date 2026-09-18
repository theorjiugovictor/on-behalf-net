/**
 * On Behalf — core types.
 *
 * The protocol version is part of every message on the wire. Foreign agents
 * negotiate against this contract, so treat it as published API: additive
 * changes only within a minor version.
 */

export const PROTOCOL = "obn/0.1" as const;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The public description of an agent. This is the whole BYOA contract: anyone
 * who can serve one of these at a stable URL can be negotiated with.
 */
export type AgentCard = {
  protocol: typeof PROTOCOL;
  id: string;
  name: string;
  domain: string;
  /** What the company does, in its own words. Steers the agent's reasoning. */
  purpose: string;
  /** base64url-encoded ed25519 public key (raw 32 bytes). */
  publicKey: string;
  /** Absolute URL that accepts signed protocol envelopes via POST. */
  endpoint: string;
  capabilities: Capability[];
};

export type Capability = "sell" | "buy" | "negotiate" | "traverse";

/** An agent we host. Never serialise `privateKey` past the process boundary. */
export type LocalAgent = {
  card: AgentCard;
  privateKey: string;
  mandate: Mandate;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Mandate — the governance layer
// ---------------------------------------------------------------------------

/**
 * A mandate is machine-checkable, not prose. Every bound here is enforced by
 * `evaluateOffer` in mandate.ts, which is a pure function with no model in the
 * loop. The model proposes; this disposes.
 */
export type Mandate = {
  agentId: string;
  version: number;
  role: "seller" | "buyer";
  /** What is being traded. Both sides must agree before terms are compared. */
  sku: string;
  currency: string;

  /** Sellers may not go below this. Buyers may not go above `ceilingUnitPrice`. */
  floorUnitPrice?: number;
  ceilingUnitPrice?: number;

  minVolume: number;
  maxVolume: number;
  maxTermMonths: number;
  /** Hard cap on total contract exposure: unitPrice * volume. */
  maxTotalValue: number;

  allowedIncoterms: string[];
  maxPaymentTermsDays: number;

  /** Clause tags the agent may never commit to, e.g. "exclusivity". */
  forbiddenClauses: string[];

  /** Deals under this total value close without a human. */
  autoApproveBelowValue: number;
};

export type ViolationCode =
  | "below-price-floor"
  | "above-price-ceiling"
  | "volume-out-of-range"
  | "term-too-long"
  | "total-value-exceeded"
  | "incoterm-not-allowed"
  | "payment-terms-too-long"
  | "forbidden-clause"
  | "sku-mismatch"
  | "currency-mismatch";

export type Violation = {
  code: ViolationCode;
  field: string;
  message: string;
  /** The value that would have satisfied the mandate, when one exists. */
  permitted?: number | string;
};

export type PolicyDecision = "within-mandate" | "needs-approval" | "violates-mandate";

export type PolicyVerdict = {
  decision: PolicyDecision;
  violations: Violation[];
  totalValue: number;
  /** Why a within-bounds offer still needs a human. */
  approvalReason?: string;
};

// ---------------------------------------------------------------------------
// Deal terms
// ---------------------------------------------------------------------------

export type Offer = {
  sku: string;
  currency: string;
  unitPrice: number;
  volume: number;
  termMonths: number;
  incoterm: string;
  paymentTermsDays: number;
  /** Free-form clause tags, checked against `forbiddenClauses`. */
  clauses: string[];
};

// ---------------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------------

export type MessageType =
  | "hello"
  | "propose"
  | "counter"
  | "accept"
  | "reject"
  | "escalate";

export type EnvelopeBody = {
  offer?: Offer;
  /** The agent's own words. Shown to humans; never parsed for terms. */
  rationale?: string;
  reason?: string;
  card?: AgentCard;
};

/** The signed unit of exchange. `sig` covers the canonical JSON of the rest. */
export type Envelope = {
  protocol: typeof PROTOCOL;
  id: string;
  threadId: string;
  from: string;
  to: string;
  type: MessageType;
  ts: string;
  body: EnvelopeBody;
  sig: string;
};

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export type ThreadStatus =
  | "open"
  | "awaiting-approval"
  | "accepted"
  | "rejected"
  | "abandoned";

/** One turn as the floor renders it: the message plus what policy made of it. */
export type TurnRecord = {
  envelope: Envelope;
  /** Verdict the *sending* agent's mandate returned for its own offer. */
  verdict?: PolicyVerdict;
  /** Set when the model's first draft had to be corrected by policy. */
  clamped?: { from: Offer; violations: Violation[] };
  /** True when the message came from an agent we do not host. */
  foreign?: boolean;
};

export type Thread = {
  id: string;
  /** Agent ids. `a` opens the negotiation. */
  a: string;
  b: string;
  subject: string;
  status: ThreadStatus;
  turns: TurnRecord[];
  createdAt: string;
  updatedAt: string;
  /** Set when status is "accepted". */
  settledOffer?: Offer;
  /** Pending human decision, when status is "awaiting-approval". */
  pendingApproval?: {
    agentId: string;
    offer: Offer;
    reason: string;
    verdict: PolicyVerdict;
  };
};

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

export type Opportunity = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  /** Why this agent's mandate makes this worth pursuing. */
  reason: string;
  /** 0-1. Model-assigned; treat as a sort key, not a probability. */
  score: number;
  counterpartyDomain?: string;
};
