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
import { ScanQRButton } from "@/components/ScanQRButton";
import type { AgentCard, Mandate, PublicTermSpec, Thread } from "@/lib/types";

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
  mandates?: Record<string, Mandate | null>;
  terms: Record<string, PublicTermSpec>;
  nextTurn: string | null;
  nextTurnName: string | null;
};

const STEP_MS = 1900;

export default function FloorPage() {
  const [agents, setAgents] = useState<(AgentCard & { mandate?: Mandate })[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [mySide, setMySide] = useState<"a" | "b">("a");
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpenedRef = useRef(false);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/threads/${id}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (d) => {
        const loadedAgents = d.agents ?? [];
        const loadedScenarios: Scenario[] = d.scenarios ?? [];
        setAgents(loadedAgents);
        setScenarios(loadedScenarios);

        const params =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const targetAgent = params?.get("agent");
        const targetThread = params?.get("thread");
        const shouldAutoOpen = params?.get("auto") === "1";

        const matchedScenario = targetAgent
          ? loadedScenarios.find((s) => s.opens === targetAgent || s.responds === targetAgent)
          : undefined;

        const chosen = matchedScenario ?? loadedScenarios[0];
        if (chosen) {
          setPicked(chosen.id);
          if (targetAgent && chosen.responds === targetAgent) {
            setMySide("b");
          } else {
            setMySide("a");
          }

          if (targetThread && !autoOpenedRef.current) {
            autoOpenedRef.current = true;
            await load(targetThread);
          } else if (shouldAutoOpen && matchedScenario && !autoOpenedRef.current) {
            autoOpenedRef.current = true;
            setBusy(true);
            try {
              const res = await fetch("/api/threads", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  a: chosen.opens,
                  b: chosen.responds,
                  subject: chosen.title,
                }),
              });
              const json = await res.json();
              if (res.ok && json.thread?.id) {
                await load(json.thread.id);
                setAuto(true);
              }
            } finally {
              setBusy(false);
            }
          }
        }
      })
      .catch(() => setError("Could not load agents."));
  }, [load]);

  const scenario = scenarios.find((s) => s.id === picked) ?? null;
  const cardFor = (id?: string) => agents.find((a) => a.id === id) ?? null;

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

  const fastForward = useCallback(async () => {
    if (!data?.thread) return;
    setAuto(false);
    setBusy(true);
    try {
      for (let i = 0; i < 14; i++) {
        const res = await fetch(`/api/threads/${data.thread.id}/step`, { method: "POST" });
        const json = await res.json();
        if (!res.ok || !json.advanced || json.status !== "open") break;
      }
      await load(data.thread.id);
    } finally {
      setBusy(false);
    }
  }, [data?.thread, load]);

  const inlineApprove = useCallback(
    async (approve: boolean) => {
      if (!data?.thread) return;
      setBusy(true);
      try {
        await fetch(`/api/threads/${data.thread.id}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            approve,
            note: approve
              ? "Approved directly from Trading Floor executive gate."
              : "Declined from Trading Floor executive gate.",
          }),
        });
        await load(data.thread.id);
      } finally {
        setBusy(false);
      }
    },
    [data?.thread, load],
  );

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

  const cardA = thread ? (participants[thread.a] ?? cardFor(thread.a)) : cardFor(scenario?.opens);
  const cardB = thread ? (participants[thread.b] ?? cardFor(thread.b)) : cardFor(scenario?.responds);

  const mandateA = thread
    ? (data?.mandates?.[thread.a] ?? cardFor(thread.a)?.mandate ?? null)
    : (cardFor(scenario?.opens)?.mandate ?? null);

  const mandateB = thread
    ? (data?.mandates?.[thread.b] ?? cardFor(thread.b)?.mandate ?? null)
    : (cardFor(scenario?.responds)?.mandate ?? null);

  const myAgentName = mySide === "a" ? (cardA?.name ?? "Agent A") : (cardB?.name ?? "Agent B");
  const myRole = mySide === "a" ? (cardA?.negotiates?.role ?? "Opens") : (cardB?.negotiates?.role ?? "Responds");

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

      {/* Perspective & Mandate Enforcer Bar */}
      {(cardA || cardB) && (
        <div className="perspective-bar">
          <div>
            <span className="eyebrow" style={{ fontSize: 10, display: "block", marginBottom: 2 }}>
              Your Perspective & Mandate Enforcer
            </span>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>Representing:</span>
              <span style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
                {myAgentName}
              </span>
              <span className="badge" style={{ background: "#09090b", color: "#ffffff", fontWeight: 700, fontSize: 11 }}>
                On Your Behalf ({myRole})
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Switch Side:</span>
            <div className="perspective-pill-group">
              <button
                type="button"
                className={`perspective-pill ${mySide === "a" ? "active" : ""}`}
                onClick={() => setMySide("a")}
              >
                {cardA?.name ?? "Agent A"} ({cardA?.negotiates?.role ?? "Opens"})
              </button>
              <button
                type="button"
                className={`perspective-pill ${mySide === "b" ? "active" : ""}`}
                onClick={() => setMySide("b")}
              >
                {cardB?.name ?? "Agent B"} ({cardB?.negotiates?.role ?? "Responds"})
              </button>
            </div>
            <ScanQRButton label="Participate (QR)" className="btn" style={{ fontSize: 12, padding: "5px 10px" }} />
            <Link href="/onboard" className="btn" style={{ fontSize: 12, padding: "5px 10px" }}>
              My Agents Fleet →
            </Link>
          </div>
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
                onClick={() => {
                  setPicked(s.id);
                  setMySide("a");
                }}
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
            <AgentPanel
              card={cardA}
              role="opens"
              mandate={mandateA}
              isMine={mySide === "a"}
            />
            <div className="vs">VS</div>
            <AgentPanel
              card={cardB}
              role="responds"
              mandate={mandateB}
              isMine={mySide === "b"}
            />
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
            <AgentPanel
              card={cardA}
              role="opens"
              mandate={mandateA}
              isMine={mySide === "a"}
            />
            <div className="vs">VS</div>
            <AgentPanel
              card={cardB}
              role="responds"
              mandate={mandateB}
              isMine={mySide === "b"}
            />
          </div>

          <div className="status-strip">
            {busy && <span className="spinner" aria-hidden />}
            <strong style={{ color: "var(--text)" }}>{thread.subject}</strong>
            <span className={`badge ${statusBadge(thread.status)}`}>{thread.status}</span>
            <span>{thread.turns.length} signed turns</span>
            <span className="badge" style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>
              ed25519 verified · anti-replay active
            </span>
            {data?.nextTurnName && <span>· next: {data.nextTurnName}</span>}
          </div>

          <div className="controls" style={{ marginBottom: 20 }}>
            <button
              className="btn btn-primary"
              onClick={() => setAuto((v) => !v)}
              disabled={!data?.nextTurn}
            >
              {auto ? "Pause" : "Run (Step-by-Step)"}
            </button>
            <button className="btn" onClick={step} disabled={busy || !data?.nextTurn}>
              Step once
            </button>
            <button className="btn" onClick={fastForward} disabled={busy || !data?.nextTurn}>
              ⚡ Fast-Forward to Convergence
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
            <div className="banner" style={{ border: "1.5px solid #d97706" }}>
              <h3>Autonomous convergence reached — Human Sign-Off Required</h3>
              <p>
                {thread.pendingApproval.reason} The thread is parked until a human principal at{" "}
                <strong>{participants[thread.pendingApproval.agentId]?.name ?? "the company"}</strong>{" "}
                approves.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ok"
                  onClick={() => inlineApprove(true)}
                  disabled={busy}
                >
                  ✓ Approve & Sign Deal on Wire
                </button>
                <button
                  type="button"
                  className="btn btn-bad"
                  onClick={() => inlineApprove(false)}
                  disabled={busy}
                >
                  Decline
                </button>
                <Link href="/inbox" className="btn">
                  Open Executive Inbox →
                </Link>
              </div>
            </div>
          )}

          {thread.status === "accepted" && thread.settledDeal && (
            <div className="banner" style={{ borderColor: "var(--ok)", background: "var(--ok-dim)" }}>
              <h3 style={{ color: "var(--ok)" }}>✓ Deal Executed & Cryptographically Signed</h3>
              <p style={{ color: "var(--text)", marginBottom: 8 }}>
                Every turn above is Ed25519-signed and replay-protected. Final human sign-off has been
                recorded on the wire.
              </p>
              <Link href="/inbox" className="btn btn-primary" style={{ display: "inline-block", fontSize: 12.5 }}>
                View Executed Contract & Export JSON in Inbox →
              </Link>
            </div>
          )}

          <div>
            {thread.turns.map((turn, i) => {
              const isFromA = turn.envelope.from === thread.a;
              const isMine = (mySide === "a" && isFromA) || (mySide === "b" && !isFromA);
              return (
                <Turn
                  key={turn.envelope.id + i}
                  turn={turn}
                  side={isFromA ? "a" : "b"}
                  name={participants[turn.envelope.from]?.name ?? turn.envelope.from}
                  terms={terms}
                  isMine={isMine}
                />
              );
            })}
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
