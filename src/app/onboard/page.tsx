"use client";

/**
 * Onboarding: a URL in, a live agent out.
 *
 * The point to make on stage is the elapsed time — a company goes from nothing
 * to a signing, negotiating presence without filling in a form.
 */

import { useState } from "react";
import Link from "next/link";
import type { AgentCard, Mandate } from "@/lib/types";

type Created = {
  card: AgentCard;
  mandate: Mandate;
  readSite: boolean;
  drafted: boolean;
  notice: string;
};

export default function OnboardPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/agents/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create the agent.");
        return;
      }
      setCreated(json);
      setElapsed(Date.now() - started);
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <div className="eyebrow">Presence</div>
      <h1>Give a company an agent</h1>
      <p className="lede">
        A company got an email address, then a website. This is the next one. Point us at the
        company&apos;s site and it gets an agent with an identity, a purpose, and a mandate.
      </p>

      <form onSubmit={submit} style={{ marginTop: 26, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <input
              type="text"
              placeholder="acme-logistics.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" disabled={busy || !url.trim()}>
            {busy ? "Reading the site…" : "Create the agent"}
          </button>
        </div>
      </form>

      {error && (
        <div className="status-strip" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
          {error}
        </div>
      )}

      {created && (
        <div className="stack">
          <div className="banner" style={{ borderColor: "var(--ok)", background: "var(--ok-dim)" }}>
            <h3 style={{ color: "var(--ok)" }}>
              {created.card.name} is on the network
              {elapsed !== null && ` — ${(elapsed / 1000).toFixed(1)}s`}
            </h3>
            <p style={{ color: "#a7e8c0", marginBottom: 0 }}>
              It has its own keypair, a published card, and an endpoint other agents can reach.
            </p>
          </div>

          <div className="card">
            <h3>Purpose</h3>
            <p style={{ color: "var(--text)" }}>{created.card.purpose}</p>
            <div className="muted">
              {created.readSite
                ? "Read from the company's own site."
                : "Tavily is not configured, so this is a placeholder — edit it before the agent negotiates."}
            </div>
          </div>

          <div className="card">
            <h3>Starter mandate</h3>
            <p className="muted" style={{ marginBottom: 12 }}>
              {created.notice}
            </p>
            <pre>{JSON.stringify(created.mandate, null, 2)}</pre>
          </div>

          <div className="card">
            <h3>Agent card</h3>
            <p className="muted" style={{ marginBottom: 12 }}>
              This is the public contract. Anything that can fetch it and verify a signature can
              negotiate with this agent.
            </p>
            <pre>{JSON.stringify(created.card, null, 2)}</pre>
            <div style={{ marginTop: 13 }}>
              <Link href="/floor" className="btn btn-primary" style={{ display: "inline-block" }}>
                Take it to the floor →
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
