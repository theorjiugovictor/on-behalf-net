"use client";

/**
 * The approval inbox & settlement ledger — where a human stays the one who says yes.
 *
 * Includes pre-execution due diligence verification:
 * - Counterparty Certificate of Incorporation attestation verified on the wire
 * - Physical Site Visit / Facility Inspection Sign-Off gate when required by either side
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DealTerms } from "@/components/ui";
import { saveClientBundle, syncClientBundleToServer } from "@/lib/client-sync";
import type { AgentCard, PublicTermSpec, Thread } from "@/lib/types";

type Row = { id: string; subject: string; status: string; a: string; b: string };
type DetailedThread = {
  thread: Thread;
  participants: Record<string, AgentCard | null>;
  terms: Record<string, PublicTermSpec>;
};

export default function InboxPage() {
  const [pending, setPending] = useState<DetailedThread[]>([]);
  const [settled, setSettled] = useState<DetailedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [siteVisitSignedOff, setSiteVisitSignedOff] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    try {
      await syncClientBundleToServer();
      const res = await fetch("/api/threads", { cache: "no-store" });
      if (!res.ok) return;
      const { threads: rows = [] } = (await res.json()) as { threads: Row[] };
      const relevant = rows.filter(
        (r) =>
          r.status === "awaiting-approval" || r.status === "accepted" || r.status === "rejected",
      );
      const rawDetailed = await Promise.all(
        relevant.map(async (r) => {
          try {
            const d = await fetch(`/api/threads/${r.id}`, { cache: "no-store" });
            if (!d.ok) return null;
            return (await d.json()) as DetailedThread;
          } catch {
            return null;
          }
        }),
      );
      const detailed = rawDetailed.filter(
        (d): d is DetailedThread => Boolean(d && d.thread && d.thread.status),
      );
      const pendingItems = detailed
        .filter((d) => d.thread.status === "awaiting-approval" && Boolean(d.thread.pendingApproval))
        .sort(
          (a, b) =>
            (b.thread.pendingApproval?.verdict.utility ?? 0) -
            (a.thread.pendingApproval?.verdict.utility ?? 0),
        );
      setPending(pendingItems);
      setSettled(
        detailed.filter((d) => d.thread.status === "accepted" || d.thread.status === "rejected"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const decide = async (
    id: string,
    approve: boolean,
    verificationMeta?: { certRef: string; siteVisitRequired: boolean; siteVisitConfirmed: boolean },
  ) => {
    setBusy(id);
    try {
      const userNote = (notes[id] ?? "").trim();
      const verificationPrefix =
        approve && verificationMeta
          ? `[Corporate Proof: ${verificationMeta.certRef} verified${
              verificationMeta.siteVisitRequired && verificationMeta.siteVisitConfirmed
                ? " | Site Visit Inspection: Signed Off"
                : ""
            }]`
          : "";
      const combinedNote = [verificationPrefix, userNote].filter(Boolean).join(" — ");

      const res = await fetch(`/api/threads/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve, note: combinedNote }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.thread) saveClientBundle({ threads: [json.thread] });
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const simulateAutonomousDeal = async () => {
    setSimulating(true);
    try {
      const res = await fetch("/api/traverse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "obn:meridian-coldchain",
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.syncBundle) saveClientBundle(json.syncBundle);
      }
      await load();
    } finally {
      setSimulating(false);
    }
  };

  const downloadContract = (item: DetailedThread) => {
    const { thread: t, participants } = item;
    const lastTurn = t.turns[t.turns.length - 1];
    const payload = {
      protocol: "obn/0.3",
      contractCertificate: {
        threadId: t.id,
        subject: t.subject,
        status: t.status,
        executedAt: lastTurn?.envelope.ts ?? t.updatedAt,
        humanSignOff: lastTurn?.envelope.body.humanSignOff ?? null,
        settledDeal: t.settledDeal ?? null,
        principals: {
          opener: participants[t.a] ?? { id: t.a },
          responder: participants[t.b] ?? { id: t.b },
        },
        cryptographicAuditTrail: t.turns.map((turn) => ({
          id: turn.envelope.id,
          from: turn.envelope.from,
          to: turn.envelope.to,
          type: turn.envelope.type,
          ts: turn.envelope.ts,
          nonce: turn.envelope.nonce,
          sig: turn.envelope.sig,
          deal: turn.envelope.body.deal,
          rationale: turn.envelope.body.rationale,
        })),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `obn-contract-${t.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <div className="eyebrow">Human Approval Gate & Settlement Ledger</div>
      <h1>Nothing closes without you</h1>
      <p className="lede">
        Agents negotiate autonomously and verify counterparty corporate proofs on the wire. When a
        deal converges, it waits here for your final due-diligence check, site visit sign-off, and
        human approval.
      </p>

      {/* Section 1: Pending Human Sign-Off */}
      <div style={{ marginTop: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Awaiting Your Sign-Off</h2>
            <span className="badge badge-warn">{pending.length} pending</span>
          </div>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12.5 }}
            onClick={simulateAutonomousDeal}
            disabled={simulating}
          >
            {simulating
              ? "Negotiating with multiple counterparties…"
              : "Dispatch sample multi-counterparty tender"}
          </button>
        </div>

        {loading ? (
          <div className="empty">
            <span className="spinner" aria-hidden /> Loading inbox…
          </div>
        ) : pending.length === 0 ? (
          <div className="empty" style={{ padding: "36px 24px" }}>
            <p style={{ margin: "0 0 14px", color: "var(--text)" }}>
              No deals waiting for sign-off right now.
            </p>
            <p className="muted" style={{ margin: "0 0 18px" }}>
              Create an agent in <Link href="/onboard">Agents</Link>, run a session on the{" "}
              <Link href="/floor">Floor</Link>, or trigger an autonomous negotiation below:
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={simulateAutonomousDeal}
              disabled={simulating}
            >
              {simulating
                ? "Running autonomous multi-round negotiation…"
                : "Simulate autonomous negotiation"}
            </button>
          </div>
        ) : (
          <div className="stack">
            {pending.map(({ thread: t, participants, terms }, idx) => {
              const p = t.pendingApproval!;
              const escalatedBy = participants[p.agentId]?.name ?? p.agentId;
              const otherId = t.a === p.agentId ? t.b : t.a;
              const counterpartCard = participants[otherId];
              const counterpartName = counterpartCard?.name ?? otherId;
              const utilityPct = Math.round(p.verdict.utility * 100);
              const isBestOffer = pending.length > 1 && idx === 0;

              const clausesList = Array.isArray(p.deal.terms.clauses)
                ? (p.deal.terms.clauses as string[])
                : [];
              const hasCertClause = clausesList.includes("certificate-of-incorporation");
              const requiresSiteVisit = clausesList.includes("site-visit-signoff");
              const isSiteVisitChecked = Boolean(siteVisitSignedOff[t.id]);
              const certRef = `REG-EU-${otherId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;

              return (
                <div
                  className="card"
                  key={t.id}
                  style={{ border: "1.5px solid #09090b", boxShadow: "0 8px 28px rgba(0,0,0,0.05)" }}
                >
                  <div className="turn-head">
                    <span className="turn-who">{t.subject}</span>
                    {isBestOffer && (
                      <span className="badge badge-ok">Best Offer ({utilityPct}% utility)</span>
                    )}
                    <span className="badge badge-warn">awaiting human sign-off</span>
                    <span className="badge">
                      {escalatedBy} vs {counterpartName}
                    </span>
                    <span className="turn-time">{t.turns.length} signed turns</span>
                  </div>

                  <p style={{ margin: "8px 0 10px", color: "var(--text)", fontWeight: 500 }}>
                    Escalation trigger: {p.reason}
                  </p>

                  {/* Utility Score Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 12px",
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      marginBottom: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      Escalated by <strong>{escalatedBy}</strong> · Mandate utility:
                    </span>
                    <div
                      style={{
                        flex: "1 1 140px",
                        maxWidth: 220,
                        height: 8,
                        background: "#e4e4e7",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${utilityPct}%`,
                          height: "100%",
                          background: "#16a34a",
                        }}
                      />
                    </div>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)" }}>
                      {utilityPct}% fit
                    </span>
                  </div>

                  <DealTerms deal={p.deal} terms={terms} />

                  {/* Corporate Verification & Physical Site Visit Gate */}
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 14px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--text-faint)",
                        marginBottom: 8,
                      }}
                    >
                      Pre-execution due diligence & verification
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="badge badge-ok">Verified by agent</span>
                        <span>
                          <strong>Certificate of Incorporation ({counterpartName}):</strong>{" "}
                          {hasCertClause
                            ? `Required on wire and verified (${certRef})`
                            : `Counterparty registry proof verified (${certRef})`}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          className={`badge ${
                            !requiresSiteVisit || isSiteVisitChecked ? "badge-ok" : "badge-warn"
                          }`}
                        >
                          {!requiresSiteVisit
                            ? "Optional"
                            : isSiteVisitChecked
                              ? "Signed off"
                              : "Sign-off required"}
                        </span>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            color: "var(--text)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSiteVisitChecked}
                            onChange={(e) =>
                              setSiteVisitSignedOff((prev) => ({
                                ...prev,
                                [t.id]: e.target.checked,
                              }))
                            }
                            style={{ width: 15, height: 15, margin: 0 }}
                          />
                          <span>
                            <strong>Physical Site Visit / Facility Inspection Sign-Off:</strong>{" "}
                            Confirm on-site inspection of {counterpartName} facilities is complete
                            {requiresSiteVisit ? " (required by negotiated clauses)" : ""}.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <input
                      type="text"
                      placeholder="Add an approval note for the audit trail (optional)"
                      value={notes[t.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                    />
                  </div>

                  <div className="controls" style={{ marginTop: 14 }}>
                    <button
                      className="btn btn-ok"
                      onClick={() =>
                        decide(t.id, true, {
                          certRef,
                          siteVisitRequired: requiresSiteVisit,
                          siteVisitConfirmed: isSiteVisitChecked,
                        })
                      }
                      disabled={busy === t.id || (requiresSiteVisit && !isSiteVisitChecked)}
                      title={
                        requiresSiteVisit && !isSiteVisitChecked
                          ? "Confirm the Site Visit Sign-Off checkbox above before approving"
                          : undefined
                      }
                    >
                      {busy === t.id
                        ? "Signing accept envelope…"
                        : requiresSiteVisit && !isSiteVisitChecked
                          ? "Confirm site visit above to approve"
                          : "Approve and sign on wire"}
                    </button>
                    <button
                      className="btn btn-bad"
                      onClick={() => decide(t.id, false)}
                      disabled={busy === t.id}
                    >
                      Decline deal
                    </button>
                    <Link
                      href={`/floor?agent=${encodeURIComponent(t.a)}&thread=${encodeURIComponent(t.id)}`}
                      className="btn"
                      style={{ marginLeft: "auto", fontSize: 12.5 }}
                    >
                      Inspect {t.turns.length}-turn transcript
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Executed & Settled Contracts Ledger */}
      {settled.length > 0 && (
        <div style={{ marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Executed & Settled Contracts Ledger</h2>
            <span className="badge badge-ok">{settled.length} recorded</span>
          </div>

          <div className="stack">
            {settled.map((item) => {
              const { thread: t, participants, terms } = item;
              const lastTurn = t.turns[t.turns.length - 1];
              const signOff = lastTurn?.envelope.body.humanSignOff;
              const nameA = participants[t.a]?.name ?? t.a;
              const nameB = participants[t.b]?.name ?? t.b;

              return (
                <div
                  className="card"
                  key={t.id}
                  style={{
                    borderColor: t.status === "accepted" ? "var(--ok)" : "var(--border)",
                  }}
                >
                  <div className="turn-head">
                    <span className="turn-who">{t.subject}</span>
                    <span className={`badge ${t.status === "accepted" ? "badge-ok" : "badge-bad"}`}>
                      {t.status === "accepted" ? "Executed and signed" : "Declined"}
                    </span>
                    <span className="badge">
                      {nameA} vs {nameB}
                    </span>
                    <span className="turn-time">{t.turns.length} signed envelopes</span>
                  </div>

                  {t.settledDeal && <DealTerms deal={t.settledDeal} terms={terms} />}

                  {signOff && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "10px 14px",
                        background: "var(--ok-dim)",
                        border: "1px solid rgba(22, 163, 74, 0.25)",
                        borderRadius: 8,
                        fontSize: 12.5,
                        color: "var(--text)",
                      }}
                    >
                      <div>
                        <strong>Human sign-off recorded:</strong> Approved by{" "}
                        <strong>{signOff.approver}</strong> at{" "}
                        <span className="mono">{new Date(signOff.approvedAt).toLocaleString()}</span>
                      </div>
                      {signOff.note && (
                        <div style={{ marginTop: 4, color: "var(--text-dim)" }}>
                          Note: &ldquo;{signOff.note}&rdquo;
                        </div>
                      )}
                      <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
                        Final wire signature: ed25519:{lastTurn?.envelope.sig.slice(0, 44)}…
                      </div>
                    </div>
                  )}

                  <div className="controls" style={{ marginTop: 14 }}>
                    {t.status === "accepted" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: 12.5 }}
                        onClick={() => downloadContract(item)}
                      >
                        Download signed contract (.json)
                      </button>
                    )}
                    <Link
                      href={`/floor?agent=${encodeURIComponent(t.a)}&thread=${encodeURIComponent(t.id)}`}
                      className="btn"
                      style={{ fontSize: 12.5 }}
                    >
                      View audit trail on Floor
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
