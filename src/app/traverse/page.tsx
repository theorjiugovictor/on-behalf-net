"use client";

/**
 * Traversal — the agent reading the open web on its own, screening multiple
 * candidate counterparties against its mandate, and negotiating with all of
 * them in parallel so the human principal only approves the best offer.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AgentCard, Opportunity } from "@/lib/types";

type Result = {
  agent: { id: string; name: string };
  opportunities: Opportunity[];
  queries: string[];
  source: "live" | "fixture";
};

type DispatchedRun = {
  counterpartyId: string;
  counterpartyName: string;
  counterpartyDomain?: string;
  scenarioId: string;
  threadId: string;
  status: string;
  turnsCount: number;
  utility: number;
};

export default function TraversePage() {
  const [agents, setAgents] = useState<Array<AgentCard & { role?: string }>>([]);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchedRuns, setDispatchedRuns] = useState<DispatchedRun[] | null>(null);

  const runFor = useCallback(async (agentId: string) => {
    if (!agentId) return;
    setBusy(true);
    setResult(null);
    setDispatchedRuns(null);
    try {
      const res = await fetch(`/api/traverse?agent=${encodeURIComponent(agentId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        setResult(await res.json());
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const dispatchAll = async (customOpportunities?: Opportunity[]) => {
    if (!selected || !result) return;
    setDispatching(true);
    try {
      const res = await fetch("/api/traverse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: selected,
          opportunities: customOpportunities ?? result.opportunities,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const sorted = [...(json.runs ?? [])].sort(
          (a: DispatchedRun, b: DispatchedRun) => b.utility - a.utility,
        );
        setDispatchedRuns(sorted);
      }
    } finally {
      setDispatching(false);
    }
  };

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = d.agents ?? [];
        setAgents(list);
        if (list[0]) {
          setSelected(list[0].id);
          runFor(list[0].id);
        }
      });
  }, [runFor]);

  return (
    <main>
      <div className="eyebrow">Autonomous Open-Web Traversal (Tavily)</div>
      <h1>Discover and negotiate with multiple counterparties</h1>
      <p className="lede">
        Your agent reads the open web to find candidate companies that match your mandate, then
        negotiates with all of them in parallel and parks the competing deals in your Inbox so you
        only approve the best offer.
      </p>

      <div className="controls" style={{ marginTop: 24, marginBottom: 20 }}>
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            runFor(e.target.value);
          }}
          className="btn"
          style={{ minWidth: 260 }}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.role ?? "agent"})
            </option>
          ))}
        </select>

        <button className="btn" onClick={() => runFor(selected)} disabled={busy || !selected}>
          {busy ? "Traversing open web…" : "Re-run traversal"}
        </button>

        {result && result.opportunities.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={() => dispatchAll()}
            disabled={dispatching || busy}
          >
            {dispatching
              ? `Negotiating with ${result.opportunities.length} counterparties…`
              : `Dispatch ${result.agent.name} to Negotiate All ${result.opportunities.length} Matches`}
          </button>
        )}
      </div>

      {busy && !result && (
        <div className="empty">
          <span className="spinner" aria-hidden /> Agent is scanning web sources and screening against mandate bounds…
        </div>
      )}

      {/* Multi-Counterparty Negotiation Results Banner */}
      {dispatchedRuns && dispatchedRuns.length > 0 && (
        <div
          className="banner"
          style={{
            borderColor: "var(--ok)",
            background: "var(--ok-dim)",
            marginBottom: 22,
          }}
        >
          <h3 style={{ color: "var(--ok)", marginBottom: 6 }}>
            {result?.agent.name} negotiated with {dispatchedRuns.length} counterparties in parallel
          </h3>
          <p style={{ color: "var(--text)", marginBottom: 14 }}>
            All {dispatchedRuns.length} negotiations converged within your mandate bounds and are
            parked in your Inbox, ranked by utility fit so you can approve the best offer.
          </p>

          <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
            {dispatchedRuns.map((run, idx) => {
              const pct = Math.round(run.utility * 100);
              return (
                <div
                  key={run.threadId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    padding: "10px 14px",
                    background: "var(--surface)",
                    border: idx === 0 ? "1.5px solid #09090b" : "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <strong>{run.counterpartyName}</strong>
                    {run.counterpartyDomain && (
                      <span className="badge mono">{run.counterpartyDomain}</span>
                    )}
                    {idx === 0 && <span className="badge badge-ok">Best Offer ({pct}% utility)</span>}
                    {idx > 0 && <span className="badge">{pct}% utility</span>}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {run.turnsCount} signed turns
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Link
                      href={`/floor?agent=${encodeURIComponent(selected)}&thread=${encodeURIComponent(run.threadId)}`}
                      className="btn"
                      style={{ fontSize: 12, padding: "4px 10px" }}
                    >
                      Inspect on Floor
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/inbox" className="btn btn-primary">
              Compare & Approve Best Deal in Inbox
            </Link>
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="status-strip">
            <span className={`dot ${result.source === "live" ? "dot-ok" : "dot-warn"}`} />
            {result.source === "live"
              ? "Live results via Tavily Search, screened against the agent's mathematical mandate."
              : "Screened against the agent's mathematical mandate (deterministic fixture fallback)."}
            <span style={{ marginLeft: "auto" }} className="muted">
              {result.opportunities.length} screened counterparties
            </span>
          </div>

          <details style={{ marginBottom: 18 }}>
            <summary className="muted" style={{ cursor: "pointer", marginBottom: 8 }}>
              Queries autonomously derived from {result.agent.name}&apos;s mandate
            </summary>
            <pre style={{ marginTop: 8 }}>{result.queries.join("\n")}</pre>
          </details>

          <div className="stack">
            {result.opportunities.map((o) => (
              <div className="card" key={o.id}>
                <div className="turn-head">
                  <span className="turn-who">{o.title}</span>
                  <span className="badge badge-ok">{Math.round(o.score * 100)}% mandate fit</span>
                  {o.counterpartyDomain && <span className="badge">{o.counterpartyDomain}</span>}
                </div>
                <p style={{ margin: "0 0 10px", color: "var(--text)" }}>{o.reason}</p>
                <p className="muted" style={{ margin: "0 0 12px" }}>
                  {o.snippet}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <a href={o.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12 }}>
                    {o.url}
                  </a>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 12.5 }}
                    onClick={() => dispatchAll([o])}
                    disabled={dispatching}
                  >
                    Negotiate with {o.counterpartyDomain ?? "this counterparty"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
