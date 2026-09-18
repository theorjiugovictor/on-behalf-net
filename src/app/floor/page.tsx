"use client";

/**
 * The floor: two agents negotiating in public.
 *
 * Turns are stepped one at a time on a timer rather than run to completion, so
 * an audience can actually read the exchange, and so one slow model call stalls
 * a single turn instead of the whole thread.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AgentPanel, Turn } from "@/components/ui";
import type { AgentCard, Thread } from "@/lib/types";

type ThreadResponse = {
  thread: Thread;
  participants: Record<string, AgentCard | null>;
  nextTurn: string | null;
  nextTurnName: string | null;
};

type AgentListItem = AgentCard & { role?: string; hosted?: boolean };

const STEP_MS = 1900;

export default function FloorPage() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => setError("Could not load agents."));
  }, []);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/threads/${id}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  const openFloor = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const seller = agents.find((a) => a.role === "seller") ?? agents[0];
      const buyer = agents.find((a) => a.role === "buyer") ?? agents[1];
      if (!seller || !buyer) {
        setError("Need at least two agents. Add one from the onboarding page.");
        return;
      }
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          a: seller.id,
          b: buyer.id,
          subject: "Lagos–Accra reefer lane capacity",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not open the floor.");
        return;
      }
      await load(json.thread.id);
      setAuto(true);
    } finally {
      setBusy(false);
    }
  }, [agents, load]);

  const step = useCallback(async () => {
    if (!data?.thread) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/threads/${data.thread.id}/step`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Step failed.");
        setAuto(false);
        return;
      }
      await load(data.thread.id);
      if (!json.advanced) setAuto(false);
    } catch {
      setError("Step failed — is the server still running?");
      setAuto(false);
    } finally {
      setBusy(false);
    }
  }, [data?.thread, load]);

  // Auto-advance loop. Re-armed after each completed step so a slow turn never
  // stacks up overlapping requests.
  useEffect(() => {
    if (!auto || busy || !data) return;
    if (!data.nextTurn) {
      setAuto(false);
      return;
    }
    timer.current = setTimeout(step, STEP_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [auto, busy, data, step]);

  const thread = data?.thread;
  const participants = data?.participants ?? {};

  return (
    <main>
      <div className="eyebrow">The floor</div>
      <h1>Two agents, one deal</h1>
      <p className="lede">
        Each side is bound by a mandate its company set. Every offer is checked against that mandate
        before it is signed, and nothing becomes binding until a human says so.
      </p>

      {error && (
        <div className="status-strip" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
          {error}
        </div>
      )}

      {!thread ? (
        <>
          <div className="facing" style={{ marginTop: 24 }}>
            <AgentPanel card={agents.find((a) => a.role === "seller") ?? null} role="seller" />
            <div className="vs">VS</div>
            <AgentPanel card={agents.find((a) => a.role === "buyer") ?? null} role="buyer" />
          </div>
          <div className="controls">
            <button className="btn btn-primary" onClick={openFloor} disabled={busy || agents.length < 2}>
              {busy ? "Opening…" : "Open the floor"}
            </button>
            <span className="muted">Starts a fresh negotiation between the two agents above.</span>
          </div>
        </>
      ) : (
        <>
          <div className="facing" style={{ marginTop: 24 }}>
            <AgentPanel card={participants[thread.a] ?? null} role="opens" />
            <div className="vs">VS</div>
            <AgentPanel card={participants[thread.b] ?? null} role="responds" />
          </div>

          <div className="status-strip">
            {busy && <span className="spinner" aria-hidden />}
            <strong style={{ color: "var(--text)" }}>{thread.subject}</strong>
            <span className={`badge ${statusBadge(thread.status)}`}>{thread.status}</span>
            <span>{thread.turns.length} turns</span>
            {data?.nextTurnName && <span>· next: {data.nextTurnName}</span>}
          </div>

          <div className="controls" style={{ marginBottom: 20 }}>
            <button
              className="btn btn-primary"
              onClick={() => setAuto((v) => !v)}
              disabled={!data?.nextTurn}
            >
              {auto ? "Pause" : "Run"}
            </button>
            <button className="btn" onClick={step} disabled={busy || !data?.nextTurn}>
              Step once
            </button>
            <button
              className="btn"
              onClick={() => {
                setAuto(false);
                setData(null);
              }}
            >
              New negotiation
            </button>
          </div>

          {thread.status === "awaiting-approval" && thread.pendingApproval && (
            <div className="banner">
              <h3>The agents have agreed. A human has not.</h3>
              <p>
                {thread.pendingApproval.reason} The thread is parked until someone at{" "}
                {participants[thread.pendingApproval.agentId]?.name ?? "the company"} decides.
              </p>
              <Link href="/inbox" className="btn btn-primary" style={{ display: "inline-block" }}>
                Open the inbox →
              </Link>
            </div>
          )}

          {thread.status === "accepted" && thread.settledOffer && (
            <div className="banner" style={{ borderColor: "var(--ok)", background: "var(--ok-dim)" }}>
              <h3 style={{ color: "var(--ok)" }}>Deal closed</h3>
              <p style={{ color: "#a7e8c0" }}>
                Settled at {thread.settledOffer.currency}{" "}
                {thread.settledOffer.unitPrice.toLocaleString()} per unit ×{" "}
                {thread.settledOffer.volume.toLocaleString()} units, over{" "}
                {thread.settledOffer.termMonths} months. Every step above is signed and replayable.
              </p>
            </div>
          )}

          <div>
            {thread.turns.map((turn, i) => (
              <Turn
                key={turn.envelope.id + i}
                turn={turn}
                side={turn.envelope.from === thread.a ? "a" : "b"}
                name={participants[turn.envelope.from]?.name ?? turn.envelope.from}
              />
            ))}
            {thread.turns.length === 0 && (
              <div className="empty">Press Run to open the negotiation.</div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function statusBadge(status: Thread["status"]): string {
  if (status === "accepted") return "badge-ok";
  if (status === "rejected") return "badge-bad";
  if (status === "awaiting-approval") return "badge-warn";
  return "badge-accent";
}
