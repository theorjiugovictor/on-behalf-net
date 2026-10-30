"use client";

/**
 * Agents & Onboarding:
 * 1. Inspect the active fleet of agents and their collapsible mandates.
 * 2. Create a new company or individual agent (with optional Certificate of
 *    Incorporation and Site Visit Sign-Off requirements).
 * 3. Scan a QR code to join from mobile.
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
  counterparty?: AgentCard;
  scenarioId?: string;
  threadId?: string;
  threadStatus?: string;
  turnsCount?: number;
  settledDeal?: { subject: string; terms: Record<string, unknown> };
  runs?: Array<{
    counterpartyName: string;
    threadId: string;
    turnsCount: number;
    utility: number;
  }>;
  notice: string;
  readSite?: boolean;
  drafted?: boolean;
  verification?: { method: string; sent: boolean; devCode?: string; hint: string };
};

type Kind = "company" | "person";
type Tab = "list" | "create" | "qr";

const PRESETS = [
  {
    label: "Nordic AI Advisor (Stockholm)",
    kind: "person" as const,
    name: "Astrid Lindqvist",
    email: "astrid@nordic-ai.se",
    about:
      "I am a principal AI systems architect in Stockholm taking advisory contracts across Europe. My day rate starts at $1,800 USD, contract length 2 to 6 months, and I require 14-day net payment terms.",
  },
  {
    label: "Øresund Reefer Carrier (Denmark/Sweden)",
    kind: "company" as const,
    url: "scandia-cold-logistics.dk",
    name: "Scandia Cold Logistics",
    email: "dispatch@scandialogistics.dk",
    about:
      "Temperature-controlled refrigerated freight carrier operating Stockholm–Copenhagen–Hamburg lanes. Enforcing minimum rate $840/unit and strict fuel surcharge protection.",
  },
  {
    label: "European Enterprise SaaS Buyer",
    kind: "person" as const,
    name: "Henrik Møller (Procurement)",
    email: "procurement@krona-enterprise.eu",
    about:
      "Head of European software procurement in Copenhagen negotiating B2B cloud and AI infrastructure. Capping annual contract value at $65,000 with 99.95% uptime SLA and 30-day billing.",
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
  const [requireIncorporation, setRequireIncorporation] = useState(true);
  const [requireSiteVisit, setRequireSiteVisit] = useState(true);

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
        body: JSON.stringify(
          kind === "company"
            ? { url, requireIncorporation, requireSiteVisit }
            : { name, email, about, requireIncorporation, requireSiteVisit },
        ),
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
      <div className="eyebrow">Agents</div>
      <h1>Fleet & Onboarding</h1>
      <p className="lede">
        View active agents on this node or create a new agent for your company or yourself.
      </p>

      {/* Clean Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1.5px solid var(--border)",
          paddingBottom: 12,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={`btn ${tab === "list" ? "btn-primary" : ""}`}
          onClick={() => setTab("list")}
        >
          Active Agents ({agents.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === "create" ? "btn-primary" : ""}`}
          onClick={() => setTab("create")}
        >
          Create Agent
        </button>
        <button
          type="button"
          className={`btn ${tab === "qr" ? "btn-primary" : ""}`}
          onClick={() => setTab("qr")}
        >
          Mobile QR
        </button>
      </div>

      {/* TAB 1: Active Agents */}
      {tab === "list" && (
        <section>
          {loadingAgents && (
            <div className="empty" style={{ padding: "30px 20px" }}>
              Loading agents…
            </div>
          )}

          {!loadingAgents && agents.length === 0 && (
            <div className="empty" style={{ padding: "40px 20px" }}>
              <p>No agents hosted on this node yet.</p>
              <button className="btn btn-primary" onClick={() => setTab("create")}>
                Create your first agent
              </button>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
              gap: 18,
            }}
          >
            {agents.map((agent) => {
              const isMine = myAgentIds.includes(agent.id);
              return (
                <article
                  key={agent.id}
                  style={{
                    background: "var(--surface)",
                    borderRadius: "var(--radius-lg)",
                    border: isMine ? "1.5px solid #09090b" : "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    overflow: "hidden",
                  }}
                >
                  <AgentPanel
                    card={agent}
                    role={agent.role ?? agent.mandate?.role}
                    mandate={agent.mandate}
                    isMine={isMine}
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 18px",
                      background: "var(--surface-2)",
                      borderTop: "1px solid var(--border)",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Link
                        href={`/floor?agent=${encodeURIComponent(agent.id)}&auto=1`}
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                      >
                        Negotiate on Floor
                      </Link>
                      <a
                        href={`/api/agents/${encodeURIComponent(agent.id)}/card`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                      >
                        Card JSON
                      </a>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--mono)" }}>
                      {agent.id}
                    </span>
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
          <div
            style={{
              padding: "14px 18px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-faint)",
                marginBottom: 8,
              }}
            >
              Quick-start templates
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 11px" }}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
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
              <span className="scenario-title">Company agent</span>
              <span className="scenario-blurb">
                Identified by domain and verified at /.well-known/on-behalf.txt.
              </span>
            </button>
            <button
              className="scenario"
              data-picked={kind === "person"}
              onClick={() => setKind("person")}
            >
              <span className="scenario-title">Individual agent</span>
              <span className="scenario-blurb">
                Identified by email inbox and verified by one-time code.
              </span>
            </button>
          </div>

          <form onSubmit={submit} style={{ marginBottom: 24 }}>
            <div className="stack">
              {kind === "company" ? (
                <input
                  type="text"
                  placeholder="Company domain (e.g. scandia-cold-logistics.dk)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              ) : (
                <>
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
                    rows={3}
                    placeholder="What do you trade, and what limits should your agent enforce?"
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    required
                  />
                </>
              )}

              {/* Counterparty Verification & Site Visit Gate */}
              <div
                style={{
                  padding: "14px 16px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
              >
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
                  Counterparty verification & pre-execution requirements
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={requireIncorporation}
                      onChange={(e) => setRequireIncorporation(e.target.checked)}
                      style={{ width: 16, height: 16, margin: 0 }}
                    />
                    <span>
                      <strong>Require Certificate of Incorporation</strong> — agent mandates
                      corporate registration proof (`certificate-of-incorporation`) from the
                      counterparty on the wire.
                    </span>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={requireSiteVisit}
                      onChange={(e) => setRequireSiteVisit(e.target.checked)}
                      style={{ width: 16, height: 16, margin: 0 }}
                    />
                    <span>
                      <strong>Require Site Visit / Facility Inspection Sign-Off</strong> — adds
                      `site-visit-signoff` to the contract and requires human inspection sign-off in
                      Inbox before final execution.
                    </span>
                  </label>
                </div>
              </div>

              <div className="controls">
                <button
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    (kind === "company" ? !url.trim() : !name.trim() || !email.trim() || !about.trim())
                  }
                >
                  {busy ? "Creating agent and negotiating first deal…" : "Create Agent"}
                </button>
              </div>
            </div>
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

      {/* TAB 3: Mobile QR */}
      {tab === "qr" && (
        <section style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
              Mobile Participation
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "8px 0 0" }}>
              Scan this QR code from a phone to create an agent and join the trading floor.
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
        <h3 style={{ color: "var(--ok)" }}>
          {created.card.name} is live and negotiated with {created.runs?.length ?? 1} counterparties
        </h3>
        <p style={{ color: "var(--text)", marginBottom: 12 }}>
          Your agent traversed the market, negotiated in parallel with{" "}
          <strong>{created.runs?.length ?? 1} competing counterparties</strong> inside your mandate,
          and parked the converged deals in your Inbox ranked by utility fit so you can approve the
          best offer.
        </p>

        {created.runs && created.runs.length > 0 && (
          <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
            {[...created.runs]
              .sort((a, b) => b.utility - a.utility)
              .map((r, idx) => (
                <div
                  key={r.threadId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    padding: "8px 12px",
                    background: "var(--surface)",
                    border: idx === 0 ? "1.5px solid #09090b" : "1px solid var(--border)",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{r.counterpartyName}</strong>
                    {idx === 0 ? (
                      <span className="badge badge-ok">
                        Best Offer ({Math.round(r.utility * 100)}% utility)
                      </span>
                    ) : (
                      <span className="badge">{Math.round(r.utility * 100)}% utility</span>
                    )}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {r.turnsCount} signed turns
                    </span>
                  </div>
                  <Link
                    href={`/floor?agent=${encodeURIComponent(created.card.id)}&thread=${encodeURIComponent(r.threadId)}`}
                    className="btn"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                  >
                    Inspect on Floor
                  </Link>
                </div>
              ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/inbox" className="btn btn-primary">
            Compare & approve best offer in Inbox
          </Link>
          <button type="button" className="btn" onClick={onViewFleet}>
            Back to Active Agents
          </button>
        </div>
      </div>

      <div className="card">
        <div className="turn-head">
          <h3 style={{ margin: 0 }}>Identity attestation</h3>
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
    </div>
  );
}
