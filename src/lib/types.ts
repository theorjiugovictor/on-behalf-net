/**
 * On Behalf — core types.
 *
 * The protocol version is part of every message on the wire. Foreign agents
 * negotiate against this contract, so treat it as published API: additive
 * changes only within a minor version.
 *
 * Nothing here knows what a price is. A deal is a bag of named terms; a mandate
 * is bounds over those terms. A new industry is a fixture, not a code change —
 * which is the only way "any agent with any intent" can be true.
 */

export const PROTOCOL = "obn/0.2" as const;

// ---------------------------------------------------------------------------
// Terms — the vocabulary of a deal
// ---------------------------------------------------------------------------

export type TermType = "number" | "date" | "enum" | "set" | "boolean" | "text";

/** What a term can be worth on the wire. Interpreted via the mandate's spec. */
export type TermValue = number | string | boolean | string[];

export type Deal = {
  /** What is being negotiated. Both sides must agree before terms are compared. */
  subject: string;
  terms: Record<string, TermValue>;
};

/**
 * Which way a party wants a term to move. Dates compare as epoch milliseconds
 * and booleans as 0/1, so one pair of directions covers every ordered type:
 * "earlier is better" is just `lower-better`, and "prefer false" is too.
 */
export type Direction = "lower-better" | "higher-better" | "match";

export type TermBound =
  | { kind: "number"; min?: number; max?: number; unit?: string; integer?: boolean }
  | { kind: "date"; notBefore?: string; notAfter?: string }
  | { kind: "enum"; allowed: string[]; preference?: string[] }
  /**
   * Closed by default: only members in `allowed` (plus `required`) may ever be
   * agreed. A denylist alone is not safe here — it would let an agent commit to
   * anything nobody happened to think of, which is the same hole the
   * `unmandated-term` rule closes for term keys. `forbidden` remains for stating
   * a refusal explicitly.
   */
  | { kind: "set"; allowed?: string[]; required?: string[]; forbidden?: string[]; maxItems?: number }
  | { kind: "boolean"; mustBe?: boolean }
  | { kind: "text"; maxLength?: number };

/**
 * One term as a single party is mandated to treat it. The counterparty has its
 * own spec for the same key, with its own bounds — neither side can see the
 * other's, which is what makes the negotiation real.
 */
export type TermSpec = {
  key: string;
  label: string;
  bound: TermBound;
  direction: Direction;
  /** 0–1. How hard to fight for this term relative to the others. */
  weight: number;
  /**
   * How far beyond the binding edge to open, as a fraction. 0.25 on a floor of
   * 800 opens at 1000. Ignored for unordered types.
   */
  anchor?: number;
  /** False pins the term at its bound: stated, never traded. */
  negotiable?: boolean;
};

/** The public half of a spec. Advertised on the agent card; bounds stay private. */
export type PublicTermSpec = {
  key: string;
  label: string;
  type: TermType;
  unit?: string;
  /** Enum options are public — a stranger cannot guess them. */
  options?: string[];
};

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Who an agent acts for. A company and a person are both principals — the
 * engine treats them identically, and only their attestation differs.
 */
export type Principal =
  | { kind: "company"; name: string; domain: string }
  | { kind: "person"; name: string; handle?: string };

/**
 * How strongly a principal is backed, in increasing order of recourse.
 *
 *  none   — self-asserted. Anyone can claim anything.
 *  email  — controls an inbox. That inbox is where an agreement would be sent,
 *           which is what makes it recourse rather than trivia.
 *  domain — controls a domain, proved by serving the agent's public key at a
 *           well-known path. Self-verifying: no third party, no secret.
 *
 * An address at a domain that itself holds a verified agent card counts as
 * `domain`, so a named employee inherits their employer's standing.
 */
export type AttestationLevel = "none" | "email" | "domain";

/**
 * The public half of an attestation. Deliberately carries no contact details:
 * a card is fetched by strangers, and an email address published there would be
 * harvested within the hour. The address itself lives in private storage.
 */
export type Attestation = {
  level: AttestationLevel;
  verifiedAt?: string;
  /** For `domain`, the domain proved. Already public, so safe to publish. */
  domain?: string;
  /** Free-text note, e.g. "verified via employer domain". */
  note?: string;
};

export const ATTESTATION_RANK: Record<AttestationLevel, number> = {
  none: 0,
  email: 1,
  domain: 2,
};

/**
 * The public description of an agent, and the whole BYOA contract: anyone who
 * can serve one of these at a stable URL can be negotiated with.
 *
 * `negotiates` is what makes an open network usable — it tells a stranger the
 * term vocabulary to speak, without revealing a single bound. `attestation`
 * is what makes an open network safe — it tells them how much this identity is
 * worth, without revealing how to contact it out of band.
 */
export type AgentCard = {
  protocol: typeof PROTOCOL;
  id: string;
  name: string;
  principal: Principal;
  attestation: Attestation;
  /** What the principal does, in their own words. Steers the agent's reasoning. */
  purpose: string;
  /** base64url-encoded ed25519 public key (raw 32 bytes). */
  publicKey: string;
  /** Absolute URL that accepts signed protocol envelopes via POST. */
  endpoint: string;
  capabilities: string[];
  negotiates?: {
    subject: string;
    /** Free-text description of the party's side, e.g. "recruiter", "sponsor". */
    role: string;
    terms: PublicTermSpec[];
  };
};

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
 * `evaluateDeal` in mandate.ts, which is a pure function with no model in the
 * loop. The model proposes; this disposes.
 */
export type Mandate = {
  agentId: string;
  version: number;
  /** Display label for this party's side. Carries no logic. */
  role: string;
  subject: string;
  terms: TermSpec[];
  /** Conditions that force human sign-off before an acceptance can bind. */
  approval: ApprovalRule[];
};

/**
 * When a deal stops being the agent's to close. `product-at-or-above` covers
 * total contract value without the engine needing to know what money is: it
 * multiplies named numeric terms and compares.
 */
export type ApprovalRule =
  | { kind: "always"; reason?: string }
  | { kind: "term-at-or-above"; term: string; value: number; reason?: string }
  | { kind: "term-at-or-below"; term: string; value: number; reason?: string }
  | { kind: "term-equals"; term: string; value: string | boolean; reason?: string }
  | { kind: "product-at-or-above"; terms: string[]; value: number; unit?: string; reason?: string }
  /**
   * Who you are dealing with, not what you are agreeing. This is what makes an
   * open network safe to join: the network admits everyone, and each agent
   * decides for itself how much attestation a counterparty needs before it will
   * close without a human.
   */
  | { kind: "counterparty-below"; level: AttestationLevel; reason?: string };

export type ViolationCode =
  | "subject-mismatch"
  | "unmandated-term"
  | "missing-term"
  | "below-minimum"
  | "above-maximum"
  | "date-too-early"
  | "date-too-late"
  | "option-not-allowed"
  | "forbidden-member"
  | "member-not-allowed"
  | "required-member-missing"
  | "too-many-members"
  | "boolean-must-be"
  | "not-negotiable"
  | "wrong-type";

export type Violation = {
  code: ViolationCode;
  term: string;
  message: string;
  /** The nearest value that would have satisfied the mandate, when one exists. */
  permitted?: TermValue;
};

/**
 * What the policy engine knows beyond the deal itself. Kept as an explicit
 * argument so `evaluateDeal` stays a pure function of its inputs.
 */
export type PolicyContext = {
  counterparty?: AgentCard;
};

export type PolicyDecision = "within-mandate" | "needs-approval" | "violates-mandate";

export type PolicyVerdict = {
  decision: PolicyDecision;
  violations: Violation[];
  /** 0–1, how good this deal is for the evaluating party. Sort key, not a probability. */
  utility: number;
  /** Why an in-bounds deal still needs a human. */
  approvalReason?: string;
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
  deal?: Deal;
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
  /** Verdict the *sending* agent's mandate returned for its own deal. */
  verdict?: PolicyVerdict;
  /** Set when the model's first draft had to be corrected by policy. */
  clamped?: { from: Deal; violations: Violation[] };
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
  settledDeal?: Deal;
  /** Pending human decision, when status is "awaiting-approval". */
  pendingApproval?: {
    agentId: string;
    deal: Deal;
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
