import type { AgentCard, Offer, PolicyVerdict, TurnRecord } from "@/lib/types";

const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function OfferTerms({ offer }: { offer: Offer }) {
  const total = offer.unitPrice * offer.volume;
  return (
    <div className="terms">
      <span className="term">
        rate <b>{money(offer.unitPrice, offer.currency)}</b>
      </span>
      <span className="term">
        volume <b>{offer.volume.toLocaleString()}</b>
      </span>
      <span className="term">
        term <b>{offer.termMonths}mo</b>
      </span>
      <span className="term">
        incoterm <b>{offer.incoterm}</b>
      </span>
      <span className="term">
        payment <b>net {offer.paymentTermsDays}</b>
      </span>
      <span className="term">
        total <b>{money(total, offer.currency)}</b>
      </span>
      {offer.clauses.map((c) => (
        <span className="term" key={c}>
          clause <b>{c}</b>
        </span>
      ))}
    </div>
  );
}

/**
 * A proposal is not a commitment, so "needs human sign-off" is only meaningful
 * on the binding moves. On a counter, an offer with no violations is simply
 * within mandate, whatever its total value.
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
}: {
  turn: TurnRecord;
  side: "a" | "b";
  name: string;
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
        <time className="turn-time">
          {new Date(envelope.ts).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </time>
      </div>

      {text && <p className="turn-body">{text}</p>}
      {envelope.body.offer && <OfferTerms offer={envelope.body.offer} />}

      {clamped && (
        <div className="policy-note" data-kind="clamped">
          <strong>Mandate corrected this move.</strong> The model proposed{" "}
          {money(clamped.from.unitPrice, clamped.from.currency)} × {clamped.from.volume}. Policy
          rejected it — {clamped.violations.map((v) => v.message).join(" ")} — and pulled the offer
          back inside the mandate before it was signed.
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

export function AgentPanel({ card, role }: { card: AgentCard | null; role?: string }) {
  if (!card) return <div className="card muted">Unknown agent</div>;
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="agent-name">{card.name}</span>
        {role && <span className="badge">{role}</span>}
      </div>
      <div className="agent-domain">{card.domain}</div>
      <p className="agent-purpose">{card.purpose}</p>
      <div className="key">key {card.publicKey.slice(0, 22)}…</div>
    </div>
  );
}

export function StatusDot({ on }: { on: boolean }) {
  return <span className={`dot ${on ? "dot-ok" : "dot-off"}`} />;
}
