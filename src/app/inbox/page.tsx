"use client";

/**
 * The approval inbox & settlement ledger — where a human stays the one who says yes.
 *
 * Only threads the agents parked themselves appear in Pending. Approving signs an
 * `accept` on the agent's behalf with cryptographic `humanSignOff` metadata, and
 * moves the agreement into the Executed Contracts Ledger.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DealTerms } from "@/components/ui";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/threads", { cache: "no-store" });
    const { threads: rows } = (await res.json()) as { threads: Row[] };
    const relevant = rows.filter(
      (r) => r.status === "awaiting-approval" || r.status === "accepted" || r.status === "rejected",
    );
    const detailed = await Promise.all(
      relevant.map(async (r) => {
        const d = await fetch(`/api/threads/${r.id}`, { cache: "no-store" });
        return (await d.json()) as DetailedThread;
      }),
    );
    setPending(detailed.filter((d) => d.thread.status === "awaiting-approval"));
    setSettled(
      detailed.filter((d) => d.thread.status === "accepted" || d.thread.status === "rejected"),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      await fetch(`/api/threads/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve, note: notes[id] ?? "" }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  /**
   * 1-Click Autonomous Deal Escalation for judges testing the Inbox directly:
   * Opens a freight negotiation and advances it autonomously until it parks at
   * the human approval gate.
   */
  const simulateAutonomousDeal = async () => {
    setSimulating(true);
    try {
      const openRes = await fetch("/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          a: "obn:meridian-coldchain",
          b: "obn:kairo-foods",
          subject: "Refrigerated freight",
        }),
      });
      const openJson = await openRes.json();
      const threadId = openJson.thread?.id;
      if (threadId) {
        for (let i = 0; i < 14; i++) {
          const stepRes = await fetch(`/api/threads/${threadId}/step`, { method: "POST" });
          const stepJson = await stepRes.json();
          if (!stepJson.advanced || stepJson.status !== "open") break;
        }
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
        Agents discover counterparties and negotiate autonomously inside their mathematical mandates.
        The moment a deal converges, it parks here — your human sign-off is the only step that makes
        an agreement binding on the wire.
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
              ? "Agents negotiating autonomously…"
              : "⚡ Auto-Negotiate & Escalate a Sample Deal"}
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
              Create an agent in <Link href="/onboard">Agent Hub</Link> (it will negotiate and land a
              deal here automatically), run a session on the <Link href="/floor">Floor</Link>, or
              trigger an instant autonomous negotiation below:
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={simulateAutonomousDeal}
              disabled={simulating}
            >
              {simulating
                ? "Running autonomous multi-round negotiation…"
                : "⚡ Simulate Autonomous Negotiation → Escalate Here"}
            </button>
          </div>
        ) : (
          <div className="stack">
            {pending.map(({ thread: t, participants, terms }) => {
              const p = t.pendingApproval!;
              const escalatedBy = participants[p.agentId]?.name ?? p.agentId;
              const otherId = t.a === p.agentId ? t.b : t.a;
              const counterpartName = participants[otherId]?.name ?? otherId;
              const utilityPct = Math.round(p.verdict.utility * 100);

              return (
                <div
                  className="card"
                  key={t.id}
                  style={{ border: "1.5px solid #09090b", boxShadow: "0 8px 28px rgba(0,0,0,0.05)" }}
                >
                  <div className="turn-head">
                    <span className="turn-who">{t.subject}</span>
                    <span className="badge badge-warn">awaiting human sign-off</span>
                    <span className="badge">
                      {escalatedBy} ⇄ {counterpartName}
                    </span>
                    <span className="turn-time">{t.turns.length} signed turns</span>
                  </div>

                  <p style={{ margin: "8px 0 6px", color: "var(--text)", fontWeight: 500 }}>
                    🔒 {p.reason}
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
                      Escalated by <strong>{escalatedBy}</strong> · Mandate Utility Score:
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

                  <div style={{ marginTop: 15 }}>
                    <input
                      type="text"
                      placeholder="Add an executive approval note for the cryptographic audit trail (optional)"
                      value={notes[t.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                    />
                  </div>

                  <div className="controls" style={{ marginTop: 14 }}>
                    <button
                      className="btn btn-ok"
                      onClick={() => decide(t.id, true)}
                      disabled={busy === t.id}
                    >
                      {busy === t.id ? "Signing accept envelope…" : "✓ Approve & Sign on Wire"}
                    </button>
                    <button
                      className="btn btn-bad"
                      onClick={() => decide(t.id, false)}
                      disabled={busy === t.id}
                    >
                      Decline Deal
                    </button>
                    <Link
                      href={`/floor?agent=${encodeURIComponent(t.a)}&thread=${encodeURIComponent(t.id)}`}
                      className="btn"
                      style={{ marginLeft: "auto", fontSize: 12.5 }}
                    >
                      Inspect Full {t.turns.length}-Turn Exchange →
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
                      {t.status === "accepted" ? "✓ Executed & Signed" : "Declined"}
                    </span>
                    <span className="badge">
                      {nameA} ⇄ {nameB}
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
                        <strong>Cryptographic Human Sign-Off Recorded:</strong> Approved by{" "}
                        <strong>{signOff.approver}</strong> at{" "}
                        <span className="mono">{new Date(signOff.approvedAt).toLocaleString()}</span>
                      </div>
                      {signOff.note && (
                        <div style={{ marginTop: 4, color: "var(--text-dim)" }}>
                          Note: &ldquo;{signOff.note}&rdquo;
                        </div>
                      )}
                      <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
                        Final Wire Signature: ed25519:{lastTurn?.envelope.sig.slice(0, 44)}…
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
                        ⬇ Download Signed Ricardian Contract (.json)
                      </button>
                    )}
                    <Link
                      href={`/floor?agent=${encodeURIComponent(t.a)}&thread=${encodeURIComponent(t.id)}`}
                      className="btn"
                      style={{ fontSize: 12.5 }}
                    >
                      View Audit Trail on Floor →
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
