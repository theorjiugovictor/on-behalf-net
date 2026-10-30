"use client";

import { useState } from "react";
import Link from "next/link";

type SimStep = {
  round: number;
  actor: string;
  role: string;
  side: "a" | "b";
  type: "propose" | "counter" | "escalate";
  rate: number;
  volume: number;
  paymentDays: number;
  utilityA: number;
  utilityB: number;
  rationale: string;
  clampNote?: string;
  sigPreview: string;
};

const DEMO_STEPS: SimStep[] = [
  {
    round: 1,
    actor: "Meridian Cold Chain",
    role: "Carrier Agent",
    side: "a",
    type: "propose",
    rate: 1050,
    volume: 230,
    paymentDays: 14,
    utilityA: 94,
    utilityB: 32,
    rationale:
      "Opening on the Stockholm–Copenhagen Øresund reefer corridor at $1,050/unit for 230 units on Net-14 settlement, including continuous temperature-logging.",
    sigPreview: "ed25519:8f3b91a0...4c2e19d7",
  },
  {
    round: 2,
    actor: "Kairo Foods",
    role: "Shipper Agent",
    side: "b",
    type: "counter",
    rate: 840,
    volume: 140,
    paymentDays: 45,
    utilityA: 48,
    utilityB: 89,
    rationale:
      "We can commit 140 chilled dairy units weekly if rate comes down to $840/unit with Net-45 payment terms.",
    sigPreview: "ed25519:2c7e04d1...9a18f3b2",
  },
  {
    round: 3,
    actor: "Meridian Cold Chain",
    role: "Carrier Agent",
    side: "a",
    type: "counter",
    rate: 895,
    volume: 175,
    paymentDays: 35,
    utilityA: 76,
    utilityB: 74,
    rationale:
      "Matching your movement: we can concede to $895/unit at 175 units on Net-35 payment terms.",
    clampNote:
      "Coupled Constraint Enforced: Net-35 (>30 days) automatically clamped rate floor from $820 → $880 USD to protect working capital.",
    sigPreview: "ed25519:5d9a12c8...7e4b01f6",
  },
  {
    round: 4,
    actor: "Kairo Foods",
    role: "Shipper Agent",
    side: "b",
    type: "escalate",
    rate: 895,
    volume: 175,
    paymentDays: 35,
    utilityA: 76,
    utilityB: 74,
    rationale:
      "Terms ($895/unit × 175 units = $156,625 total value) sit inside both mandates and achieve ZOPA equilibrium. Escalating to Human Inbox for final cryptographic sign-off.",
    sigPreview: "ed25519:9b4f83e2...1c6d50a4",
  },
];

export function LiveHeroSimulator() {
  const [stepIdx, setStepIdx] = useState<number>(3);
  const visible = DEMO_STEPS.slice(0, stepIdx + 1);
  const current = DEMO_STEPS[stepIdx];

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1.5px solid var(--border-strong)",
        borderRadius: "var(--radius-xl)",
        padding: "28px 32px",
        boxShadow: "0 16px 48px rgba(0, 0, 0, 0.06)",
        textAlign: "left",
        maxWidth: 980,
        width: "100%",
        margin: "0 auto",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingBottom: 18,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="pulse-dot" />
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
            Live Autonomous Bargaining Trace
          </span>
          <span className="badge" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
            nvidia/nemotron-3-super-120b-a12b
          </span>
          <span className="badge badge-ok" style={{ fontSize: 11 }}>
            ZOPA Converged
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {DEMO_STEPS.map((s, idx) => (
            <button
              key={s.round}
              type="button"
              onClick={() => setStepIdx(idx)}
              className={`btn ${stepIdx === idx ? "btn-primary" : ""}`}
              style={{ fontSize: 11.5, padding: "4px 10px" }}
            >
              Turn {s.round} ({s.type})
            </button>
          ))}
        </div>
      </div>

      {/* Dual Utility Telemetry Meters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 20,
          padding: "14px 18px",
          background: "var(--surface-2)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span>
              <strong>Meridian Cold Chain</strong> (Carrier Mandate)
            </span>
            <span className="mono" style={{ fontWeight: 700 }}>
              {current.utilityA}% utility
            </span>
          </div>
          <div style={{ height: 7, background: "#e4e4e7", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                width: `${current.utilityA}%`,
                height: "100%",
                background: "#09090b",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span>
              <strong>Kairo Foods</strong> (Shipper Mandate)
            </span>
            <span className="mono" style={{ fontWeight: 700 }}>
              {current.utilityB}% utility
            </span>
          </div>
          <div style={{ height: 7, background: "#e4e4e7", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                width: `${current.utilityB}%`,
                height: "100%",
                background: "#16a34a",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", fontSize: 12 }}>
          <div style={{ color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
            Active Table Terms
          </div>
          <div className="mono" style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
            ${current.rate}/unit · {current.volume} units · Net-{current.paymentDays}d
          </div>
        </div>
      </div>

      {/* Turn Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((s) => (
          <div
            key={s.round}
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: s.type === "escalate" ? "1.5px solid #d97706" : "1px solid var(--border)",
              background: s.type === "escalate" ? "rgba(217, 119, 6, 0.04)" : "#ffffff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{s.actor}</span>
              <span className="badge" style={{ fontSize: 10.5 }}>
                {s.role}
              </span>
              <span
                className={`badge ${
                  s.type === "escalate" ? "badge-warn" : s.type === "propose" ? "badge-accent" : ""
                }`}
                style={{ fontSize: 10.5 }}
              >
                {s.type}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto" }}>
                {s.sigPreview}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>{s.rationale}</p>
            {s.clampNote && (
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "var(--surface-2)",
                  borderLeft: "3px solid #09090b",
                  fontSize: 11.5,
                  color: "var(--text)",
                }}
              >
                ⚡ <strong>Policy Engine Clamp:</strong> {s.clampNote}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Action Strip */}
      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          Every turn is Ed25519-signed. Agents negotiate autonomously; <strong>only final sign-off is human</strong>.
        </span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/onboard?tab=create" className="btn" style={{ fontSize: 12.5 }}>
            Spawn Your Own Agent →
          </Link>
          <Link href="/floor" className="btn btn-primary" style={{ fontSize: 12.5 }}>
            Launch Live Floor →
          </Link>
        </div>
      </div>
    </div>
  );
}

