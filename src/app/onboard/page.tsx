"use client";

/**
 * Two doors onto the network.
 *
 * A company proves itself by controlling a domain; a person by controlling an
 * inbox. Both get the same engine, the same protocol and the same approval gate
 * — the only difference is how strongly their identity is backed, and that is
 * published so the other side can decide what it means to them.
 */

import { useState } from "react";
import Link from "next/link";
import type { AgentCard, Mandate } from "@/lib/types";

type Created = {
  card: AgentCard;
  mandate: Mandate;
  notice: string;
  readSite?: boolean;
  drafted?: boolean;
  verification?: { method: string; sent: boolean; devCode?: string; hint: string };
};

type Kind = "company" | "person";

export default function OnboardPage() {
  const [kind, setKind] = useState<Kind>("company");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [about, setAbout] = useState("");

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
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <div className="eyebrow">Presence</div>
      <h1>Get an agent</h1>
      <p className="lede">
        A company got an email address, then a website. This is the next one — and it is not only
        for companies. Anyone who makes agreements can have an agent that makes them on their behalf.
      </p>

      <div className="scenario-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button className="scenario" data-picked={kind === "company"} onClick={() => setKind("company")}>
          <span className="scenario-title">A company</span>
          <span className="scenario-blurb">
            Identified by its domain, and proved by serving its agent key there. The strongest
            attestation on the network, and nobody else holds anything.
          </span>
        </button>
        <button className="scenario" data-picked={kind === "person"} onClick={() => setKind("person")}>
          <span className="scenario-title">A person</span>
          <span className="scenario-blurb">
            Identified by an inbox, and proved by a code sent to it. That inbox is where an
            agreement would be sent, which is what makes it recourse.
          </span>
        </button>
      </div>

      <form onSubmit={submit} style={{ marginTop: 22, marginBottom: 20 }}>
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
              {busy ? "Reading the site…" : "Create the agent"}
            </button>
          </div>
        ) : (
          <div className="stack">
            <div className="grid-2">
              <input
                type="text"
                placeholder="Your name"
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
              placeholder="What do you do, and what are you looking to agree? e.g. “I'm a freelance industrial designer. I take contracts at a day rate and I need a start date I can plan around.”"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              required
            />
            <div className="controls">
              <button className="btn btn-primary" disabled={busy || !name.trim() || !email.trim() || !about.trim()}>
                {busy ? "Working it out…" : "Create my agent"}
              </button>
              <span className="muted">
                Your address is stored privately and never appears on your agent&apos;s public card.
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

      {created && <Result created={created} />}
    </main>
  );
}

function Result({ created }: { created: Created }) {
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
        <h3 style={{ color: "var(--ok)" }}>{created.card.name} is on the network</h3>
        <p style={{ color: "#a7e8c0", marginBottom: 0 }}>
          It has its own keypair, a published card, and an endpoint other agents can reach.
        </p>
      </div>

      <div className="card">
        <div className="turn-head">
          <h3 style={{ margin: 0 }}>Attestation</h3>
          <span className={`badge ${level === "domain" ? "badge-ok" : level === "email" ? "badge-accent" : "badge-warn"}`}>
            {level === "domain" ? "domain verified" : level === "email" ? "email verified" : "unverified"}
          </span>
        </div>

        {level === "none" ? (
          isCompany ? (
            <>
              <p>
                Serve this line at{" "}
                <code className="mono">
                  https://{created.card.principal.kind === "company" ? created.card.principal.domain : ""}
                  /.well-known/on-behalf.txt
                </code>{" "}
                and press verify. Nothing secret crosses the wire — you are publishing your own
                agent&apos;s public key on your own domain.
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
              <p>{created.verification?.hint}</p>
              <div className="controls">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{ maxWidth: 180 }}
                />
                <button className="btn btn-primary" onClick={verify} disabled={busy || code.length < 6}>
                  {busy ? "Checking…" : "Verify"}
                </button>
              </div>
            </>
          )
        ) : (
          <p style={{ marginBottom: 0 }}>{status ?? "Verified."}</p>
        )}

        {status && level === "none" && (
          <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
            {status}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Purpose</h3>
        <p style={{ color: "var(--text)" }}>{created.card.purpose}</p>
      </div>

      <div className="card">
        <h3>Starter mandate</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          {created.notice}
        </p>
        <pre>{JSON.stringify(created.mandate, null, 2)}</pre>
        <div style={{ marginTop: 13 }}>
          <Link href="/floor" className="btn btn-primary" style={{ display: "inline-block" }}>
            Take it to the floor →
          </Link>
        </div>
      </div>
    </div>
  );
}
