"use client";

/**
 * The approval inbox — where a human stays the one who says yes.
 *
 * Only threads the agents parked themselves appear here. Approving signs an
 * `accept` on the agent's behalf, so the audit trail records that a person
 * closed the deal.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DealTerms } from "@/components/ui";
import type { AgentCard, PublicTermSpec, Thread } from "@/lib/types";

type Row = { id: string; subject: string; status: string; a: string; b: string };
type Pending = {
  thread: Thread;
  participants: Record<string, AgentCard | null>;
  terms: Record<string, PublicTermSpec>;
};

export default function InboxPage() {
  const [threads, setThreads] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/threads", { cache: "no-store" });
    const { threads: rows } = (await res.json()) as { threads: Row[] };
    const detailed = await Promise.all(
      rows
        .filter((r) => r.status === "awaiting-approval")
        .map(async (r) => {
          const d = await fetch(`/api/threads/${r.id}`, { cache: "no-store" });
          return (await d.json()) as Pending;
        }),
    );
    setThreads(detailed);
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

  return (
    <main>
      <div className="eyebrow">Inbox</div>
      <h1>Nothing closes without you</h1>
      <p className="lede">
        Agents negotiate freely inside their mandate. The moment a deal would bind the company past
        what the mandate allows on its own, it stops here.
      </p>

      <div style={{ marginTop: 26 }}>
        {loading ? (
          <div className="empty">
            <span className="spinner" aria-hidden /> Loading…
          </div>
        ) : threads.length === 0 ? (
          <div className="empty">
            Nothing waiting. Run a negotiation on the <Link href="/floor">floor</Link> and it will
            land here when the agents reach terms.
          </div>
        ) : (
          <div className="stack">
            {threads.map(({ thread: t, participants, terms }) => {
              const p = t.pendingApproval!;
              const escalatedBy = participants[p.agentId]?.name ?? p.agentId;
              return (
                <div className="card" key={t.id}>
                  <div className="turn-head">
                    <span className="turn-who">{t.subject}</span>
                    <span className="badge badge-warn">awaiting sign-off</span>
                    <span className="turn-time">{t.turns.length} turns</span>
                  </div>

                  <p style={{ margin: "0 0 4px", color: "var(--text)" }}>{p.reason}</p>
                  <p className="muted" style={{ margin: 0 }}>
                    Escalated by {escalatedBy}&apos;s agent · these terms score{" "}
                    {Math.round(p.verdict.utility * 100)} against its own mandate
                  </p>

                  <DealTerms deal={p.deal} terms={terms} />

                  <div style={{ marginTop: 15 }}>
                    <input
                      type="text"
                      placeholder="Add a note for the record (optional)"
                      value={notes[t.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                    />
                  </div>

                  <div className="controls" style={{ marginTop: 13 }}>
                    <button
                      className="btn btn-ok"
                      onClick={() => decide(t.id, true)}
                      disabled={busy === t.id}
                    >
                      Approve and close
                    </button>
                    <button
                      className="btn btn-bad"
                      onClick={() => decide(t.id, false)}
                      disabled={busy === t.id}
                    >
                      Decline
                    </button>
                    <Link href="/floor" className="muted" style={{ marginLeft: 6 }}>
                      See the full exchange →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
