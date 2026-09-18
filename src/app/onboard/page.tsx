"use client";

/**
 * Agent Hub: Personal Fleet, Mandate Inspection, and Creation Door.
 *
 * View all hosted agents and their complete mathematical mandates,
 * create a new agent (Company with domain or Person with inbox),
 * or scan the participation QR code from mobile.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AgentPanel } from "@/components/ui";
import { QRCodeDisplay } from "@/components/QRCodeModal";
import type { AgentCard, Mandate } from "@/lib/types";

type HostedAgent = AgentCard & {
  mandate?: Mandate;
  role?: string;
  subject?: string;
  hosted?: boolean;
};

type Created = {
  card: AgentCard;
  mandate: Mandate;
  notice: string;
  readSite?: boolean;
  drafted?: boolean;
  verification?: { method: string; sent: boolean; devCode?: string; hint: string };
};

type Kind = "company" | "person";
type Tab = "list" | "create" | "qr";

const PRESETS = [
  {
    label: "Freelance AI Engineer",
    kind: "person" as const,
    name: "Alex Rivera",
    email: "alex@riveralabs.dev",
    about:
      "I'm a senior AI engineer taking advisory contracts. My day rate starts at $1,800 USD, contract length 1 to 6 months, and I require 14-day net payment terms.",
  },
  {
    label: "Reefer Lane Carrier",
    kind: "company" as const,
    url: "apex-logistics.internal",
    name: "Apex Cold Logistics",
    email: "dispatch@apexlogistics.com",
    about:
      "Temperature-controlled refrigerated freight carrier operating cross-border logistics lanes. Enforcing minimum rate $820/unit and strict fuel surcharge protection.",
  },
  {
    label: "SaaS Enterprise Buyer",
    kind: "person" as const,
    name: "Jordan Taylor (Procurement)",
    email: "procurement@enterprise-tech.corp",
    about:
      "Corporate procurement lead negotiating B2B software infrastructure. Capping annual contract value at $65,000 with 99.95% uptime SLA and quarterly billing.",
  },
];

export default function OnboardPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [agents, setAgents] = useState<HostedAgent[]>([]);
  const [myAgentIds, setMyAgentIds] = useState<string[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Form state
  const [kind, setKind] = useState<Kind>("company");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [about, setAbout] = useState("");

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setAgents(json.agents ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
    try {
      const saved = JSON.parse(localStorage.getItem("obn_my_agents") || "[]");
      setMyAgentIds(saved);
    } catch {}

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("participate") === "true" || params.get("tab") === "create") {
        setTab("create");
      }
    }
  }, [loadAgents]);

  const saveMyAgentId = (id: string) => {
    try {
      const saved: string[] = JSON.parse(localStorage.getItem("obn_my_agents") || "[]");
      if (!saved.includes(id)) {
        saved.push(id);
        localStorage.setItem("obn_my_agents", JSON.stringify(saved));
        setMyAgentIds(saved);
      }
    } catch {}
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch(kind === "company" ? "/api/agents/from-url" : "/api/agents/person", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "company" ? { url } : { name, email, about }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create the agent.");
        return;
      }
      setCreated(json);
      saveMyAgentId(json.card.id);
      loadAgents();
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setKind(preset.kind);
    if (preset.kind === "company") {
      setUrl(preset.url);
    } else {
      setName(preset.name);
      setEmail(preset.email);
      setAbout(preset.about);
    }
    setTab("create");
  };

  return (
    <main>
      <div className="eyebrow">Agent Hub</div>
      <h1>My Agents & Onboarding</h1>
      <p className="lede">
        Inspect your autonomous agents and their active mathematical mandates, create new agents
        for yourself or your organization, or scan to participate from your phone.
      </p>

      {/* Main Hub Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1.5px solid var(--border)",
          paddingBottom: 12,
          marginBottom: 26,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={`btn ${tab === "list" ? "btn-primary" : ""}`}
          onClick={() => setTab("list")}
        >
          My Agents & Mandates ({agents.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === "create" ? "btn-primary" : ""}`}
          onClick={() => setTab("create")}
        >
          + Create New Agent
        </button>
        <button
          type="button"
          className={`btn ${tab === "qr" ? "btn-primary" : ""}`}
          onClick={() => setTab("qr")}
        >
          📱 Scan QR to Participate
        </button>
      </div>

      {/* TAB 1: My Agents & Mandates */}
      {tab === "list" && (
        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Active Node Fleet</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0" }}>
                Each agent has its own Ed25519 identity key and executes strict mathematical policy bounds.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12.5 }}
              onClick={() => setTab("create")}
            >
              + Add Another Agent
            </button>
          </div>

          {loadingAgents && (
            <div className="empty" style={{ padding: "30px 20px" }}>
              Loading hosted agents and mandates…
            </div>
          )}

          {!loadingAgents && agents.length === 0 && (
            <div className="empty" style={{ padding: "40px 20px" }}>
              <p>No agents hosted on this node yet.</p>
              <button className="btn btn-primary" onClick={() => setTab("create")}>
                Create your first agent →
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {agents.map((agent) => {
              const isMine = myAgentIds.includes(agent.id) || agent.hosted;
              return (
                <article
                  key={agent.id}
                  style={{
                    background: "var(--surface)",
                    borderRadius: "var(--radius-lg)",
                    border: isMine ? "1.5px solid #09090b" : "1px solid var(--border)",
                    boxShadow: isMine ? "0 4px 18px rgba(0,0,0,0.06)" : "0 1px 4px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  <AgentPanel
                    card={agent}
                    role={agent.role ?? agent.mandate?.role}
                    mandate={agent.mandate}
                    isMine={isMine}
                  />

                  {/* Actions footer */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 24px",
                      background: "var(--surface-2)",
                      borderTop: "1px solid var(--border)",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Link href="/floor" className="btn btn-primary" style={{ fontSize: 12.5 }}>
                        Take to Trading Floor →
                      </Link>
                      <a
                        href={`/api/agents/${encodeURIComponent(agent.id)}/card`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                        style={{ fontSize: 12.5 }}
                      >
                        Public Card JSON ↗
                      </a>
                      <Link href="/inbox" className="btn" style={{ fontSize: 12.5 }}>
                        Inbox Sign-Offs
                      </Link>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "var(--mono)" }}>
                      endpoint: /api/agents/{agent.id}/inbox
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 2: Create Agent */}
      {tab === "create" && (
        <section>
          {/* Quick-Start Presets */}
          <div
            style={{
              padding: "16px 20px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 8 }}>
              ⚡ 1-Click Quick-Start Templates
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn"
                  style={{ fontSize: 12.5, padding: "6px 12px" }}
                  onClick={() => applyPreset(p)}
                >
                  {p.label} ({p.kind})
                </button>
              ))}
            </div>
          </div>

          <div className="scenario-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>
            <button
              className="scenario"
              data-picked={kind === "company"}
              onClick={() => setKind("company")}
            >
              <span className="scenario-title">A company</span>
              <span className="scenario-blurb">
                Identified by its domain, and proved by serving its agent key at /.well-known/on-behalf.txt.
                Strongest attestation on the network.
              </span>
            </button>
            <button
              className="scenario"
              data-picked={kind === "person"}
              onClick={() => setKind("person")}
            >
              <span className="scenario-title">A person</span>
              <span className="scenario-blurb">
                Identified by an inbox, and proved by a verification code. That inbox is where human sign-off
                deals arrive.
              </span>
            </button>
          </div>

          <form onSubmit={submit} style={{ marginBottom: 24 }}>
            {kind === "company" ? (
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
                  {busy ? "Reading the site & drafting mandate…" : "Create Company Agent"}
                </button>
              </div>
            ) : (
              <div className="stack">
                <div className="grid-2">
                  <input
                    type="text"
                    placeholder="Your name or organization"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <textarea
                  rows={4}
                  placeholder="What do you do, and what terms are you looking to agree? e.g. “I'm a freelance industrial designer. I take contracts at a day rate of $1,200 min and need 14-day net payment terms.”"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  required
                />
                <div className="controls">
                  <button
                    className="btn btn-primary"
                    disabled={busy || !name.trim() || !email.trim() || !about.trim()}
                  >
                    {busy ? "Synthesizing mandate & generating Ed25519 key…" : "Create My Agent"}
                  </button>
                  <span className="muted">
                    Your contact address is stored privately and never appears on your agent&apos;s public card.
                  </span>
                </div>
              </div>
            )}
          </form>

          {error && (
            <div className="status-strip" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
              {error}
            </div>
          )}

          {created && (
            <div style={{ marginTop: 24 }}>
              <Result
                created={created}
                onViewFleet={() => {
                  setTab("list");
                  setCreated(null);
                }}
              />
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Scan QR Code */}
      {tab === "qr" && (
        <section style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
              Live Audience & Mobile Participation
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "8px 0 0" }}>
              Anyone with a smartphone can scan this QR code to create an autonomous agent with their own commercial mandate and step onto the trading floor.
            </p>
          </div>

          <QRCodeDisplay size={260} />
        </section>
      )}
    </main>
  );
}

function Result({
  created,
  onViewFleet,
}: {
  created: Created;
  onViewFleet: () => void;
}) {
  const [code, setCode] = useState(created.verification?.devCode ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [level, setLevel] = useState(created.card.attestation.level);
  const [busy, setBusy] = useState(false);
  const isCompany = created.card.principal.kind === "company";

  const verify = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(created.card.id)}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isCompany ? {} : { code }),
      });
      const json = await res.json();
      if (json.verified) {
        setLevel(json.attestation.level);
        setStatus(json.attestation.note ?? "Verified.");
      } else {
        setStatus(json.error ?? "Could not verify.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="banner" style={{ borderColor: "var(--ok)", background: "var(--ok-dim)" }}>
        <h3 style={{ color: "var(--ok)" }}>{created.card.name} is on the network!</h3>
        <p style={{ color: "#a7e8c0", marginBottom: 0 }}>
          It has its own Ed25519 keypair, a mathematically backed mandate, and an active endpoint.
        </p>
      </div>

      <div className="card">
        <div className="turn-head">
          <h3 style={{ margin: 0 }}>Identity Attestation</h3>
          <span
            className={`badge ${
              level === "domain" ? "badge-ok" : level === "email" ? "badge-accent" : "badge-warn"
            }`}
          >
            {level === "domain" ? "domain verified" : level === "email" ? "email verified" : "unverified"}
          </span>
        </div>

        {level === "none" ? (
          isCompany ? (
            <>
              <p style={{ marginTop: 8 }}>
                Serve this line at{" "}
                <code className="mono">
                  https://{created.card.principal.kind === "company" ? created.card.principal.domain : ""}
                  /.well-known/on-behalf.txt
                </code>{" "}
                and press verify:
              </p>
              <pre>on-behalf-agent={created.card.publicKey}</pre>
              <div className="controls" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={verify} disabled={busy}>
                  {busy ? "Checking…" : "Verify domain"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ marginTop: 8 }}>{created.verification?.hint}</p>
              <div className="controls">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{ maxWidth: 180 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={verify}
                  disabled={busy || code.length < 6}
                >
                  {busy ? "Checking…" : "Verify"}
                </button>
              </div>
            </>
          )
        ) : (
          <p style={{ marginBottom: 0, marginTop: 8 }}>{status ?? "Verified."}</p>
        )}
      </div>

      <div className="card">
        <h3>Mandate & Limits Ready</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          {created.notice}
        </p>
        <pre>{JSON.stringify(created.mandate, null, 2)}</pre>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/floor" className="btn btn-primary">
            Take Agent to Trading Floor →
          </Link>
          <button type="button" className="btn" onClick={onViewFleet}>
            View in My Agents Fleet
          </button>
        </div>
      </div>
    </div>
  );
}
