import { formatTermValue } from "@/lib/terms";
import { describeLevel, principalHandle } from "@/lib/principal";
import type {
  AgentCard,
  Deal,
  PolicyVerdict,
  PublicTermSpec,
  TurnRecord,
} from "@/lib/types";

export type TermDict = Record<string, PublicTermSpec>;

/**
 * Render whatever terms a deal happens to carry. The dictionary supplies labels
 * and units; nothing here is specialised to an industry, which is what lets the
 * same floor show a freight rate and a sponsorship exclusivity flag.
 */
export function DealTerms({ deal, terms }: { deal: Deal; terms?: TermDict }) {
  const entries = Object.entries(deal.terms);
  if (entries.length === 0) return null;

  return (
    <div className="terms">
      {entries.map(([key, value]) => {
        const spec = terms?.[key];
        return (
          <span className="term" key={key}>
            {spec?.label ?? key.replace(/[-_]/g, " ")}{" "}
            <b>{formatTermValue(value, spec?.type ?? inferType(value), spec?.unit)}</b>
          </span>
        );
      })}
    </div>
  );
}

function inferType(value: unknown): PublicTermSpec["type"] {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "set";
  return "text";
}

/**
 * A proposal is not a commitment, so "needs human sign-off" is only meaningful
 * on the binding moves. On a counter, a deal with no violations is simply
 * within mandate, whatever it would eventually be worth.
 */
export function VerdictBadge({
  verdict,
  messageType,
}: {
  verdict?: PolicyVerdict;
  messageType?: string;
}) {
  if (!verdict) return null;
  if (verdict.decision === "violates-mandate") {
    return <span className="badge badge-bad">{verdict.violations.length} violation(s)</span>;
  }
  const binding = messageType === "accept" || messageType === "escalate";
  if (verdict.decision === "needs-approval" && binding) {
    return <span className="badge badge-warn">needs human sign-off</span>;
  }
  return <span className="badge badge-ok">within mandate</span>;
}

const TYPE_BADGE: Record<string, string> = {
  propose: "badge-accent",
  counter: "",
  accept: "badge-ok",
  reject: "badge-bad",
  escalate: "badge-warn",
  hello: "",
};

export function Turn({
  turn,
  side,
  name,
  terms,
}: {
  turn: TurnRecord;
  side: "a" | "b";
  name: string;
  terms?: TermDict;
}) {
  const { envelope, verdict, clamped, foreign } = turn;
  const terminal = ["accept", "reject", "escalate"].includes(envelope.type);
  const text = envelope.body.rationale ?? envelope.body.reason ?? "";

  return (
    <article className="turn" data-side={side} data-terminal={terminal}>
      <div className="turn-head">
        <span className="turn-who">{name}</span>
        <span className={`badge ${TYPE_BADGE[envelope.type] ?? ""}`}>{envelope.type}</span>
        {foreign && <span className="badge badge-accent">external agent</span>}
        <VerdictBadge verdict={verdict} messageType={envelope.type} />
        {typeof verdict?.utility === "number" && (
          <span className="badge" title="How good these terms are for this agent, against its own mandate">
            fit {Math.round(verdict.utility * 100)}
          </span>
        )}
        <time className="turn-time">
          {new Date(envelope.ts).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </time>
      </div>

      {text && <p className="turn-body">{text}</p>}
      {envelope.body.deal && <DealTerms deal={envelope.body.deal} terms={terms} />}

      {clamped && (
        <div className="policy-note" data-kind="clamped">
          <strong>Mandate corrected this move.</strong> Policy rejected the first draft —{" "}
          {clamped.violations.map((v) => v.message).join(" ")} — and pulled the terms back inside
          the mandate before anything was signed.
        </div>
      )}

      {envelope.type === "escalate" && (
        <div className="policy-note" data-kind="escalate">
          <strong>Stopped for a human.</strong>{" "}
          {envelope.body.reason ?? "This commitment exceeds the agent's authority."}
        </div>
      )}
    </article>
  );
}

/**
 * How much this identity is worth, shown wherever a counterparty appears. An
 * unverified party is not hidden — it is labelled, so the other side can decide.
 */
export function AttestationBadge({ card }: { card?: AgentCard | null }) {
  const level = card?.attestation?.level ?? "none";
  const cls = level === "domain" ? "badge-ok" : level === "email" ? "badge-accent" : "badge-warn";
  return (
    <span
      className={`badge ${cls}`}
      title={card?.attestation?.note ?? describeLevel(level)}
    >
      {describeLevel(level)}
    </span>
  );
}

export function AgentPanel({ card, role }: { card: AgentCard | null; role?: string }) {
  if (!card) return <div className="card muted">Unknown agent</div>;
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="agent-name">{card.name}</span>
        <span className="badge">{card.principal.kind}</span>
        {(role ?? card.negotiates?.role) && (
          <span className="badge">{role ?? card.negotiates?.role}</span>
        )}
        <AttestationBadge card={card} />
      </div>
      <div className="agent-domain">{principalHandle(card.principal)}</div>
      <p className="agent-purpose">{card.purpose}</p>
      <div className="key">key {card.publicKey.slice(0, 22)}…</div>
    </div>
  );
}
