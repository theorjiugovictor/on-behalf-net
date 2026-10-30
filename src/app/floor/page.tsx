"use client";

/**
 * The Floor: Live workspace showing your agents' real interactions with
 * counterparties across the network.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AgentPanel, Turn, type TermDict } from "@/components/ui";
import type { AgentCard, Mandate, PublicTermSpec, Thread } from "@/lib/types";

type Scenario = {
  id: string;
  title: string;
  blurb: string;
  subject: string;
  opens: string;
  responds: string;
};

type ThreadSummary = {
  id: string;
  subject: string;
  status: Thread["status"];
  aId: string;
  bId: string;
  a: string;
  b: string;
  turns: number;
  updatedAt: string;
};

type ThreadResponse = {
  thread: Thread;
  participants: Record<string, AgentCard | null>;
  mandates?: Record<string, Mandate | null>;
  terms: Record<string, PublicTermSpec>;
  nextTurn: string | null;
  nextTurnName: string | null;
};

const STEP_MS = 1800;

export default function FloorPage() {
  const [agents, setAgents] = useState<(AgentCard & { mandate?: Mandate; role?: string })[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [threadsList, setThreadsList] = useState<ThreadSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const fetchThreadsList = useCallback(async (): Promise<ThreadSummary[]> => {
    const res = await fetch("/api/threads", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    const list: ThreadSummary[] = json.threads ?? [];
    setThreadsList(list);
    return list;
  }, []);

  const loadThread = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/threads/${id}`, { cache: "no-store" });
      if (res.ok) {
        const json: ThreadResponse = await res.json();
        setData(json);
      }
      await fetchThreadsList();
    },
    [fetchThreadsList],
  );

  // Open a fresh live thread for an agent against its matched counterparty
  const startNewRound = useCallback(
    async (agentId: string, counterpartyId?: string, subjectTitle?: string) => {
      setError(null);
      setBusy(true);
      try {
        const matchedScenario = scenarios.find(
          (s) => s.opens === agentId || s.responds === agentId,
        );
        const a = agentId;
        const b =
          counterpartyId ??
          (matchedScenario
            ? matchedScenario.opens === agentId
              ? matchedScenario.responds
              : matchedScenario.opens
            : agents.find((ag) => ag.id !== agentId)?.id);
        if (!b) return;

        const res = await fetch("/api/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            a,
            b,
            subject: subjectTitle ?? matchedScenario?.title,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Could not open thread.");
          return;
        }
        await loadThread(json.thread.id);
        setAuto(true);
      } finally {
        setBusy(false);
      }
    },
    [scenarios, agents, loadThread],
  );

  // Dispatch agent via Tavily traversal to negotiate with all discovered counterparties
  const dispatchMultiCounterparty = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setError(null);
      setDispatching(true);
      try {
        const res = await fetch("/api/traverse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
        const json = await res.json();
        if (res.ok && json.runs?.length) {
          await fetchThreadsList();
          await loadThread(json.runs[0].threadId);
        }
      } finally {
        setDispatching(false);
      }
    },
    [fetchThreadsList, loadThread],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    Promise.all([
      fetch("/api/agents", { cache: "no-store" }).then((r) => r.json()),
      fetchThreadsList(),
    ])
      .then(async ([agentData, allThreads]) => {
        const loadedAgents = agentData.agents ?? [];
        const loadedScenarios: Scenario[] = agentData.scenarios ?? [];
        setAgents(loadedAgents);
        setScenarios(loadedScenarios);

        const params =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const targetAgent = params?.get("agent");
        const targetThread = params?.get("thread");

        const initialAgentId =
          targetAgent && loadedAgents.some((a: AgentCard) => a.id === targetAgent)
            ? targetAgent
            : loadedAgents[0]?.id ?? "";

        setSelectedAgentId(initialAgentId);

        if (targetThread) {
          await loadThread(targetThread);
          return;
        }

        // Find existing threads for this agent
        const agentThreads = allThreads.filter(
          (t) => t.aId === initialAgentId || t.bId === initialAgentId,
        );

        if (agentThreads.length > 0) {
          await loadThread(agentThreads[0].id);
        } else if (allThreads.length > 0) {
          await loadThread(allThreads[0].id);
        }
      })
      .catch(() => setError("Could not load floor state."));
  }, [fetchThreadsList, loadThread]);

  // When switching selected agent, load its most recent thread (or open one if none exists yet)
  const handleSelectAgent = async (agentId: string) => {
    setAuto(false);
    setSelectedAgentId(agentId);
    const agentThreads = threadsList.filter((t) => t.aId === agentId || t.bId === agentId);
    if (agentThreads.length > 0) {
      await loadThread(agentThreads[0].id);
    } else {
      await dispatchMultiCounterparty(agentId);
    }
  };

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
      await loadThread(data.thread.id);
      if (!json.advanced) setAuto(false);
    } catch {
      setError("Step failed — is the server still running?");
      setAuto(false);
    } finally {
      setBusy(false);
    }
  }, [data?.thread, loadThread]);

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
      await loadThread(data.thread.id);
    } finally {
      setBusy(false);
    }
  }, [data?.thread, loadThread]);

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
              ? "Approved directly from the Trading Floor."
              : "Declined from the Trading Floor.",
          }),
        });
        await loadThread(data.thread.id);
      } finally {
        setBusy(false);
      }
    },
    [data?.thread, loadThread],
  );

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
  const cardFor = (id?: string) => agents.find((a) => a.id === id) ?? null;

  // Threads belonging to the currently selected agent
  const agentThreads = threadsList.filter(
    (t) => t.aId === selectedAgentId || t.bId === selectedAgentId,
  );

  // Primary agent ID for display orientation (left side = your selected agent)
  const leftId =
    thread && (thread.a === selectedAgentId || thread.b === selectedAgentId)
      ? selectedAgentId
      : (thread?.a ?? selectedAgentId);
  const rightId = thread ? (thread.a === leftId ? thread.b : thread.a) : undefined;

  const cardLeft = leftId ? (participants[leftId] ?? cardFor(leftId)) : null;
  const cardRight = rightId ? (participants[rightId] ?? cardFor(rightId)) : null;

  const mandateLeft = leftId
    ? (data?.mandates?.[leftId] ?? cardFor(leftId)?.mandate ?? null)
    : null;
  const mandateRight = rightId
    ? (data?.mandates?.[rightId] ?? cardFor(rightId)?.mandate ?? null)
    : null;

  // Primary agents (hide auto-generated one-off counterparties from the main "Your Agent" selector to keep it clean)
  const primaryAgents = agents.filter((a, idx) => idx < 6 || !a.id.match(/-[a-z0-9]{4}$/));

  return (
    <main>
      <div className="eyebrow">Live Negotiation Floor</div>
      <h1>Active Counterparty Negotiations</h1>
      <p className="lede">
        Your agents negotiate directly with external counterparties on the wire. Select any of your
        agents below to inspect its active counterparty threads, verify mandate clamps, or dispatch
        parallel negotiations across new market matches.
      </p>

      {error && (
        <div className="status-strip" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
          {error}
        </div>
      )}

      {/* Workspace Control Bar: 1. Your Agent  2. Counterparty Conversations */}
      <div
        className="card"
        style={{
          padding: "18px 22px",
          marginBottom: 24,
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            paddingBottom: 14,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-faint)",
              }}
            >
              Your Agent:
            </span>
            <select
              value={selectedAgentId}
              onChange={(e) => handleSelectAgent(e.target.value)}
              className="btn"
              style={{ width: "auto", minWidth: 260, fontWeight: 700 }}
            >
              {(primaryAgents.length > 0 ? primaryAgents : agents).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role ?? a.negotiates?.role ?? "agent"})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12.5, padding: "7px 14px" }}
              onClick={() => dispatchMultiCounterparty(selectedAgentId)}
              disabled={dispatching || busy || !selectedAgentId}
            >
              {dispatching
                ? "Negotiating with market matches…"
                : "Find & Negotiate New Counterparties"}
            </button>
            {rightId && (
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12.5, padding: "7px 14px" }}
                onClick={() => startNewRound(leftId, rightId)}
                disabled={busy || dispatching}
              >
                Watch Live Step-by-Step Round
              </button>
            )}
          </div>
        </div>

        {/* Active Counterparty Threads for this Agent */}
        <div style={{ paddingTop: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-faint)",
              marginBottom: 10,
            }}
          >
            Counterparty Threads ({agentThreads.length})
          </div>

          {agentThreads.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              No active threads for this agent yet. Click{" "}
              <strong>Find &amp; Negotiate New Counterparties</strong> above to dispatch it.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {agentThreads.map((t) => {
                const isSelected = thread?.id === t.id;
                const counterpartyName = t.aId === selectedAgentId ? t.b : t.a;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setAuto(false);
                      loadThread(t.id);
                    }}
                    className="btn"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      fontSize: 13,
                      borderColor: isSelected ? "#09090b" : "var(--border)",
                      background: isSelected ? "#09090b" : "#fafafa",
                      color: isSelected ? "#ffffff" : "var(--text)",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>vs {counterpartyName}</span>
                    <span
                      style={{
                        fontSize: 11,
                        opacity: 0.8,
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {t.turns} turns · {t.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side-by-Side Agent Cards: Your Agent vs Counterparty */}
      <div className="facing">
        <AgentPanel
          card={cardLeft}
          role={cardLeft?.negotiates?.role ?? "your agent"}
          mandate={mandateLeft}
          isMine={true}
        />
        <div className="vs">VS</div>
        <AgentPanel
          card={cardRight}
          role={cardRight?.negotiates?.role ?? "counterparty"}
          mandate={mandateRight}
          isMine={false}
        />
      </div>

      {/* Active Thread Feed */}
      {thread && (
        <>
          <div className="status-strip">
            {busy && <span className="spinner" aria-hidden />}
            <strong style={{ color: "var(--text)" }}>
              {cardLeft?.name ?? thread.a} vs {cardRight?.name ?? thread.b}
            </strong>
            <span className={`badge ${statusBadge(thread.status)}`}>{thread.status}</span>
            <span>{thread.turns.length} signed turns</span>
            <span className="badge" style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>
              ed25519 verified · anti-replay active
            </span>
            {data?.nextTurnName && <span>next turn: {data.nextTurnName}</span>}

            {thread.status === "open" && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => setAuto((v) => !v)}
                  disabled={!data?.nextTurn}
                >
                  {auto ? "Pause" : "Auto-step"}
                </button>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={step}
                  disabled={busy || !data?.nextTurn}
                >
                  Step once
                </button>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={fastForward}
                  disabled={busy || !data?.nextTurn}
                >
                  Fast-forward to convergence
                </button>
              </div>
            )}
          </div>

          {thread.status === "awaiting-approval" && thread.pendingApproval && (
            <div className="banner" style={{ border: "1.5px solid #d97706" }}>
              <h3>Converged — awaiting human approval</h3>
              <p>
                {thread.pendingApproval.reason} The thread is parked until a human principal reviews
                counterparty verification proofs (Certificate of Incorporation &amp; Site Visit) and
                signs off.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <Link href="/inbox" className="btn btn-primary">
                  Review verification &amp; approve in Inbox
                </Link>
                <button
                  type="button"
                  className="btn btn-ok"
                  onClick={() => inlineApprove(true)}
                  disabled={busy}
                >
                  Quick approve here
                </button>
                <button
                  type="button"
                  className="btn btn-bad"
                  onClick={() => inlineApprove(false)}
                  disabled={busy}
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {thread.status === "accepted" && thread.settledDeal && (
            <div className="banner" style={{ borderColor: "var(--ok)", background: "var(--ok-dim)" }}>
              <h3 style={{ color: "var(--ok)" }}>Deal executed and signed on wire</h3>
              <p style={{ color: "var(--text)", marginBottom: 8 }}>
                Every turn below is Ed25519-signed and final human approval has been recorded.
              </p>
              <Link href="/inbox" className="btn btn-primary" style={{ display: "inline-block", fontSize: 12.5 }}>
                View executed contract in Inbox
              </Link>
            </div>
          )}

          <div>
            {thread.turns.map((turn, i) => {
              const isFromLeft = turn.envelope.from === leftId;
              return (
                <Turn
                  key={turn.envelope.id + i}
                  turn={turn}
                  side={isFromLeft ? "a" : "b"}
                  name={participants[turn.envelope.from]?.name ?? turn.envelope.from}
                  terms={terms}
                  isMine={isFromLeft}
                />
              );
            })}
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
