"use client";

import { useState } from "react";
import { formatTermValue } from "@/lib/terms";
import { describeLevel, principalHandle } from "@/lib/principal";
import type {
  AgentCard,
  ApprovalRule,
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
      if (b.min !== undefined) parts.push(`min ${b.min.toLocaleString()} ${b.unit ?? ""}`.trim());
      if (b.max !== undefined) parts.push(`max ${b.max.toLocaleString()} ${b.unit ?? ""}`.trim());
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
      if (b.notBefore) parts.push(`from ${b.notBefore}`);
      if (b.notAfter) parts.push(`until ${b.notAfter}`);
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
      return { limit: parts.join("; ") || "open", want: "clause set" };
    }
    case "boolean": {
      return {
        limit: b.mustBe !== undefined ? `must be ${b.mustBe}` : "yes / no",
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
      return `Human sign-off when total value reaches ${r.value.toLocaleString()} ${r.unit ?? ""}`;
    case "counterparty-below":
      return `Human sign-off when counterparty is below "${r.level}" verification`;
    case "term-at-or-above":
      return `Human sign-off when ${r.term} reaches ${r.value.toLocaleString()}`;
    case "term-at-or-below":
      return `Human sign-off when ${r.term} falls to ${r.value.toLocaleString()}`;
    case "term-equals":
      return `Human sign-off when ${r.term} is ${r.value}`;
    case "always":
      return "Every final agreement requires human sign-off";
  }
}

export function AgentPanel({
  card,
  role,
  mandate,
}: {
  card: AgentCard | null;
  role?: string;
  mandate?: Mandate | null;
  isMine?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!card) return <div className="card muted">Unknown agent</div>;

  const termLabels =
    mandate?.terms.map((t) => t.label) ??
    card.negotiates?.terms.map((t) => t.label) ??
    [];

  return (
    <div className="card">
      {/* Clean Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <span className="agent-name">{card.name}</span>
        <span className="badge">{role ?? card.negotiates?.role ?? card.principal.kind}</span>
        <AttestationBadge card={card} />
      </div>

      <div className="agent-domain" style={{ marginBottom: 10 }}>
        {principalHandle(card.principal)}
      </div>

      <p className="agent-purpose" style={{ marginBottom: 12 }}>
        {card.purpose}
      </p>

      {/* Compact Summary of Negotiated Terms */}
      {termLabels.length > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
          <strong style={{ color: "var(--text)" }}>Negotiates:</strong> {termLabels.join(" · ")}
        </div>
      )}

      {/* Clean Expand/Collapse Toggle for Private Mandate Bounds & Key */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
          ed25519:{card.publicKey.slice(0, 20)}…
        </span>
        {mandate && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 11.5, padding: "4px 10px" }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide mandate limits" : `Inspect mandate limits (${mandate.terms.length})`}
          </button>
        )}
      </div>

      {expanded && mandate && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {mandate.terms.map((t) => {
              const { limit, want } = formatBoundDescription(t.bound, t.direction);
              return (
                <div
                  key={t.key}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <strong>{t.label}</strong>
                  <span style={{ color: "var(--text-dim)" }}>
                    {limit} ({want})
                  </span>
                </div>
              );
            })}
          </div>

          {mandate.coupledConstraints && mandate.coupledConstraints.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
              <strong style={{ color: "var(--text)" }}>Coupled rule:</strong>{" "}
              {mandate.coupledConstraints.map((cc) => cc.description).join("; ")}
            </div>
          )}

          {mandate.approval && mandate.approval.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              <strong style={{ color: "var(--text)" }}>Approval gate:</strong>{" "}
              {mandate.approval.map(formatApprovalRule).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
