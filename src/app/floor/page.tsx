"use client";

/**
 * The floor: two agents negotiating in public.
 *
 * Turns are stepped one at a time on a timer rather than run to completion, so
 * an audience can actually read the exchange, and so one slow model call stalls
 * a single turn instead of the whole thread.
 *
 * The scenario picker is the argument: freight, recruiting and sponsorship run
 * on the same engine, the same protocol and the same approval gate. Nothing is
 * swapped between them except the mandates, which are data.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AgentPanel, Turn, type TermDict } from "@/components/ui";
import type { AgentCard, PublicTermSpec, Thread } from "@/lib/types";

type Scenario = {
  id: string;
  title: string;
  blurb: string;
  subject: string;
  opens: string;
  responds: string;
};

type ThreadResponse = {
  thread: Thread;
  participants: Record<string, AgentCard | null>;
  terms: Record<string, PublicTermSpec>;
  nextTurn: string | null;
  nextTurnName: string | null;
};

const STEP_MS = 1900;

export default function FloorPage() {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents ?? []);
        setScenarios(d.scenarios ?? []);
        if (d.scenarios?.[0]) setPicked(d.scenarios[0].id);
      })
      .catch(() => setError("Could not load agents."));
  }, []);

  const scenario = scenarios.find((s) => s.id === picked) ?? null;
  const cardFor = (id?: string) => agents.find((a) => a.id === id) ?? null;

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/threads/${id}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  const openFloor = useCallback(async () => {
    if (!scenario) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          a: scenario.opens,
          b: scenario.responds,
          subject: scenario.title,
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
  }, [scenario, load]);

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
  const terms: TermDict = data?.terms ?? {};

  return (
    <main>
      <div className="eyebrow">The floor</div>
      <h1>Two agents, one deal</h1>
      <p className="lede">
        Each side is bound by a mandate its company set. Every term is checked against that mandate
        before it is signed, and nothing becomes binding until a human says so.
      </p>

      {error && (
        <div className="status-strip" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
          {error}
        </div>
      )}

      {!thread ? (
        <>
          <div className="scenario-row">
            {scenarios.map((s) => (
              <button
                key={s.id}
                className="scenario"
                data-picked={s.id === picked}
                onClick={() => setPicked(s.id)}
              >
                <span className="scenario-title">{s.title}</span>
                <span className="scenario-blurb">{s.blurb}</span>
              </button>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 14 }}>
            Same engine, same protocol, same approval gate in all three. Only the mandates differ,
            and a mandate is data.
          </p>

          <div className="facing" style={{ marginTop: 18 }}>
            <AgentPanel card={cardFor(scenario?.opens)} role="opens" />
            <div className="vs">VS</div>
            <AgentPanel card={cardFor(scenario?.responds)} role="responds" />
          </div>

          <div className="controls">
            <button className="btn btn-primary" onClick={openFloor} disabled={busy || !scenario}>
              {busy ? "Opening…" : "Open the floor"}
            </button>
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

          {thread.status === "accepted" && thread.settledDeal && (
            <div className="banner" style={{ borderColor: "var(--ok)", background: "var(--ok-dim)" }}>
              <h3 style={{ color: "var(--ok)" }}>Deal closed</h3>
              <p style={{ color: "#a7e8c0", marginBottom: 0 }}>
                Every step above is signed and replayable.
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
                terms={terms}
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
