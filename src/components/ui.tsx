"use client";

import { useState } from "react";
import { formatTermValue } from "@/lib/terms";
import { describeLevel, principalHandle } from "@/lib/principal";
import type {
  AgentCard,
  ApprovalRule,
  CoupledConstraint,
  Deal,
  Mandate,
  PolicyVerdict,
  PublicTermSpec,
  TermBound,
  TermSpec,
  TurnRecord,
} from "@/lib/types";

export type TermDict = Record<string, PublicTermSpec>;

/**
 * Render whatever terms a deal happens to carry.
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
  isMine = false,
}: {
  turn: TurnRecord;
  side: "a" | "b";
  name: string;
  terms?: TermDict;
  isMine?: boolean;
}) {
  const { envelope, verdict, clamped, foreign } = turn;
  const terminal = ["accept", "reject", "escalate"].includes(envelope.type);
  const text = envelope.body.rationale ?? envelope.body.reason ?? "";

  return (
    <article className="turn" data-side={side} data-terminal={terminal}>
      <div className="turn-head">
        <span className="turn-who">{name}</span>
        {isMine ? (
          <span className="badge" style={{ background: "#09090b", color: "#ffffff", fontWeight: 700, fontSize: 11 }}>
            Your Agent (On Your Behalf)
          </span>
        ) : (
          <span className="badge" style={{ background: "var(--surface-2)", color: "var(--text-dim)", fontSize: 11 }}>
            Counterparty
          </span>
        )}
        <span className={`badge ${TYPE_BADGE[envelope.type] ?? ""}`}>{envelope.type}</span>
        {foreign && <span className="badge badge-accent">external agent</span>}
        <VerdictBadge verdict={verdict} messageType={envelope.type} />
        {typeof verdict?.utility === "number" && (
          <span className="badge" title="Utility against mandate">
            fit {Math.round(verdict.utility * 100)}%
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
          <strong>Stopped for human sign-off.</strong>{" "}
          {envelope.body.reason ?? "This commitment exceeds the agent's autonomous authority."}
        </div>
      )}
    </article>
  );
}

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

function formatBoundDescription(b: TermBound, direction: TermSpec["direction"]): { limit: string; want: string } {
  switch (b.kind) {
    case "number": {
      const parts: string[] = [];
      if (b.min !== undefined) parts.push(`min ${b.min} ${b.unit ?? ""}`.trim());
      if (b.max !== undefined) parts.push(`max ${b.max} ${b.unit ?? ""}`.trim());
      const want =
        direction === "higher-better"
          ? "higher is better"
          : direction === "lower-better"
          ? "lower is better"
          : "target match";
      return { limit: parts.join(" · ") || "open", want };
    }
    case "date": {
      const parts: string[] = [];
      if (b.notBefore) parts.push(`≥ ${b.notBefore}`);
      if (b.notAfter) parts.push(`≤ ${b.notAfter}`);
      return {
        limit: parts.join(" · ") || "any date",
        want: direction === "lower-better" ? "earlier preferred" : "later preferred",
      };
    }
    case "enum": {
      return {
        limit: `allowed: ${b.allowed.join(", ")}`,
        want: b.preference?.length ? `prefers ${b.preference[0]}` : "no preference",
      };
    }
    case "set": {
      const parts: string[] = [];
      if (b.required?.length) parts.push(`requires [${b.required.join(", ")}]`);
      if (b.forbidden?.length) parts.push(`forbids [${b.forbidden.join(", ")}]`);
      return { limit: parts.join("; ") || "open", want: "set constraints" };
    }
    case "boolean": {
      return {
        limit: b.mustBe !== undefined ? `must be ${b.mustBe}` : "boolean",
        want: b.mustBe !== undefined ? "strict rule" : "negotiable",
      };
    }
    default:
      return { limit: "custom", want: "standard" };
  }
}

function formatApprovalRule(r: ApprovalRule): string {
  switch (r.kind) {
    case "product-at-or-above":
      return `Total value ≥ ${r.value.toLocaleString()} ${r.unit ?? ""}`;
    case "counterparty-below":
      return `Counterparty below "${r.level}" verification level`;
    case "term-at-or-above":
      return `${r.term} ≥ ${r.value}`;
    case "term-at-or-below":
      return `${r.term} ≤ ${r.value}`;
    case "term-equals":
      return `${r.term} = ${r.value}`;
    case "always":
      return "Every acceptance requires human approval";
  }
}

export function AgentPanel({
  card,
  role,
  mandate,
  isMine = false,
}: {
  card: AgentCard | null;
  role?: string;
  mandate?: Mandate | null;
  isMine?: boolean;
}) {
  const [userTab, setUserTab] = useState<"mandate" | "identity" | null>(null);
  const tab = userTab ?? (mandate ? "mandate" : "identity");

  if (!card) return <div className="card muted">Unknown agent</div>;

  return (
    <div className={`card ${isMine ? "card-my-agent" : ""}`}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span className="agent-name">{card.name}</span>
        {isMine && (
          <span className="badge badge-accent" style={{ background: "#09090b", color: "#ffffff", fontWeight: 700 }}>
            Your Agent (On Your Behalf)
          </span>
        )}
        <span className="badge">{role ?? card.negotiates?.role ?? card.principal.kind}</span>
        <AttestationBadge card={card} />
      </div>

      <div className="agent-domain" style={{ marginBottom: 12 }}>
        {principalHandle(card.principal)}
      </div>

      {/* Tabs: Mandate (What it is requesting) vs Identity Card */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {mandate && (
          <button
            type="button"
            className={`btn ${tab === "mandate" ? "btn-primary" : ""}`}
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => setUserTab("mandate")}
          >
            Mandate & Requested Terms ({mandate.terms.length})
          </button>
        )}
        <button
          type="button"
          className={`btn ${tab === "identity" ? "btn-primary" : ""}`}
          style={{ fontSize: 12, padding: "4px 10px" }}
          onClick={() => setUserTab("identity")}
        >
          Identity & Key
        </button>
      </div>

      {tab === "identity" ? (
        <div>
          <p className="agent-purpose">{card.purpose}</p>
          <div className="key" style={{ marginTop: 12 }}>
            ed25519:{card.publicKey}
          </div>
        </div>
      ) : mandate ? (
        <div className="agent-mandate-details">
          <div
            style={{
              padding: "8px 12px",
              background: isMine ? "rgba(9, 9, 11, 0.04)" : "rgba(0, 0, 0, 0.02)",
              border: `1px solid ${isMine ? "rgba(9, 9, 11, 0.15)" : "var(--border)"}`,
              borderRadius: 6,
              fontSize: 12,
              color: "var(--text)",
              marginBottom: 14,
              lineHeight: 1.45,
            }}
          >
            {isMine ? (
              <>
                <strong>Your Commercial Mandate:</strong> Your agent is strictly bound to request and defend these terms. Every proposed number, counter-offer, or agreement is verified against these rules before signing.
              </>
            ) : (
              <>
                <strong>Counterparty Policy Bounds:</strong> Terms this agent is mandated to negotiate. Hard bounds cannot be breached without walking away.
              </>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <span className="eyebrow" style={{ fontSize: 10, display: "block", marginBottom: 6 }}>
              What this agent is mandated to request & enforce:
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {mandate.terms.map((t) => {
                const { limit, want } = formatBoundDescription(t.bound, t.direction);
                const isHighWeight = t.weight >= 0.7;
                return (
                  <div
                    key={t.key}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 13, color: "var(--text)" }}>{t.label}</strong>
                      <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 6 }}>
                        ({t.key})
                      </span>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                        Bound: <strong>{limit}</strong> · <span>{want}</span>
                      </div>
                    </div>
                    <div>
                      {isHighWeight && (
                        <span className="badge" style={{ fontSize: 10, background: "#fef08a", color: "#854d0e" }}>
                          Priority: High
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coupled Constraints */}
          {mandate.coupledConstraints && mandate.coupledConstraints.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span className="eyebrow" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>
                Coupled Term Rules (Anti-Leakage):
              </span>
              {mandate.coupledConstraints.map((cc) => (
                <div
                  key={cc.id}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "rgba(0, 0, 0, 0.03)",
                    border: "1px solid var(--border)",
                    color: "var(--text-dim)",
                    marginBottom: 4,
                  }}
                >
                  ⚡ <strong>{cc.description}</strong>
                </div>
              ))}
            </div>
          )}

          {/* Human Approval Triggers */}
          {mandate.approval && mandate.approval.length > 0 && (
            <div>
              <span className="eyebrow" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>
                Human Sign-Off Gate (Requires Your Consent in Inbox):
              </span>
              {mandate.approval.map((rule, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "rgba(217, 119, 6, 0.06)",
                    border: "1px solid rgba(217, 119, 6, 0.2)",
                    color: "var(--text)",
                    marginBottom: 4,
                  }}
                >
                  🔒 {formatApprovalRule(rule)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
