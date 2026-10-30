"use client";

/**
 * Traversal — the agent reading the open web on its own.
 *
 * This is the layer that is useful with nobody else in the room, and the one
 * that produces the counterparties the floor then negotiates with.
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

export default function TraversePage() {
  const [agents, setAgents] = useState<Array<AgentCard & { role?: string }>>([]);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const runFor = useCallback(async (agentId: string) => {
    if (!agentId) return;
    setBusy(true);
    setResult(null);
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
      <h1>The agent reads the web for you</h1>
      <p className="lede">
        Before any other agent is in the room, yours is already working: reading the open web for
        counterparties that fit what you sell and what your mathematical mandate allows you to commit to.
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
        <button className="btn btn-primary" onClick={() => runFor(selected)} disabled={busy || !selected}>
          {busy ? "Traversing Open Web…" : "↻ Re-Run Traversal"}
        </button>
      </div>

      {busy && !result && (
        <div className="empty">
          <span className="spinner" aria-hidden /> Agent is scanning web sources & screening against mandate bounds…
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
              {result.opportunities.length} screened opportunities
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
                    {o.url} ↗
                  </a>
                  <Link
                    href={`/floor?agent=${encodeURIComponent(selected)}&auto=1`}
                    className="btn btn-primary"
                    style={{ fontSize: 12.5 }}
                  >
                    Dispatch {result.agent.name} to Negotiate →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
