"use client";

/**
 * Traversal — the agent reading the open web on its own.
 *
 * This is the layer that is useful with nobody else in the room, and the one
 * that produces the counterparties the floor then negotiates with.
 */

import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents ?? []);
        if (d.agents?.[0]) setSelected(d.agents[0].id);
      });
  }, []);

  const run = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/traverse?agent=${encodeURIComponent(selected)}`, {
        cache: "no-store",
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }, [selected]);

  return (
    <main>
      <div className="eyebrow">Traversal</div>
      <h1>The agent reads the web for you</h1>
      <p className="lede">
        Before any other agent is in the room, yours is already working: reading the open web for
        counterparties that fit what you sell and what you are allowed to commit to.
      </p>

      <div className="controls" style={{ marginTop: 24, marginBottom: 20 }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="btn"
          style={{ minWidth: 240 }}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.role ?? "agent"})
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={run} disabled={busy || !selected}>
          {busy ? "Traversing…" : "Traverse"}
        </button>
      </div>

      {result && (
        <>
          <div className="status-strip">
            <span className={`dot ${result.source === "live" ? "dot-ok" : "dot-warn"}`} />
            {result.source === "live"
              ? "Live results via Tavily, screened against the mandate."
              : "Tavily is not configured — showing representative fixtures in the same shape."}
            <span style={{ marginLeft: "auto" }} className="muted">
              {result.opportunities.length} opportunities
            </span>
          </div>

          <details style={{ marginBottom: 18 }}>
            <summary className="muted" style={{ cursor: "pointer", marginBottom: 8 }}>
              Queries derived from this agent&apos;s mandate
            </summary>
            <pre style={{ marginTop: 8 }}>{result.queries.join("\n")}</pre>
          </details>

          <div className="stack">
            {result.opportunities.map((o) => (
              <div className="card" key={o.id}>
                <div className="turn-head">
                  <span className="turn-who">{o.title}</span>
                  <span className="badge badge-accent">{Math.round(o.score * 100)}% fit</span>
                  {o.counterpartyDomain && <span className="badge">{o.counterpartyDomain}</span>}
                </div>
                <p style={{ margin: "0 0 10px", color: "var(--text)" }}>{o.reason}</p>
                <p className="muted" style={{ margin: "0 0 8px" }}>
                  {o.snippet}
                </p>
                <a href={o.url} target="_blank" rel="noreferrer" className="mono">
                  {o.url}
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
