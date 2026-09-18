"use client";

import { useState } from "react";
import Link from "next/link";

interface SimTurn {
  round: number;
  sender: "a" | "b";
  name: string;
  role: string;
  type: "propose" | "counter" | "accept";
  terms: Record<string, string>;
  fitScore: number;
  rationale: string;
}

interface ScenarioData {
  id: string;
  title: string;
  agentA: { name: string; org: string; role: string; key: string };
  agentB: { name: string; org: string; role: string; key: string };
  turns: SimTurn[];
  ricardianTemplate: string;
}

const SIM_SCENARIOS: Record<string, ScenarioData> = {
  freight: {
    id: "freight",
    title: "Refrigerated Freight",
    agentA: {
      name: "Meridian Arctic",
      org: "meridian-arctic.is",
      role: "Shipper",
      key: "04a1f89c…8e2b",
    },
    agentB: {
      name: "Kairo Cold Chain",
      org: "kairo-chain.nl",
      role: "Carrier",
      key: "04b92d11…4f7c",
    },
    ricardianTemplate: "BIMCO ReeferCon 2026",
    turns: [
      {
        round: 1,
        sender: "a",
        name: "Meridian Arctic",
        role: "Shipper",
        type: "propose",
        terms: {
          "Rate per container": "$1,450",
          "Temperature range": "-20°C to -18°C",
          "Payment terms": "Net 45 days",
          "Demurrage grace": "72 hours",
        },
        fitScore: 92,
        rationale: "Opening bid based on standard North Sea refrigerated transit volume.",
      },
      {
        round: 2,
        sender: "b",
        name: "Kairo Cold Chain",
        role: "Carrier",
        type: "counter",
        terms: {
          "Rate per container": "$1,720",
          "Temperature range": "-20°C to -18°C",
          "Payment terms": "Net 15 days",
          "Demurrage grace": "48 hours",
        },
        fitScore: 88,
        rationale: "Rotterdam congestion and fuel surcharges require spot rate adjustment.",
      },
      {
        round: 3,
        sender: "a",
        name: "Meridian Arctic",
        role: "Shipper",
        type: "counter",
        terms: {
          "Rate per container": "$1,580",
          "Temperature range": "-20°C to -18°C",
          "Payment terms": "Net 30 days",
          "Demurrage grace": "60 hours",
        },
        fitScore: 84,
        rationale: "Reciprocal concession matching carrier window; coupling $1,580 with 30-day settlement.",
      },
      {
        round: 4,
        sender: "b",
        name: "Kairo Cold Chain",
        role: "Carrier",
        type: "accept",
        terms: {
          "Rate per container": "$1,580",
          "Temperature range": "-20°C to -18°C",
          "Payment terms": "Net 30 days",
          "Demurrage grace": "60 hours",
        },
        fitScore: 86,
        rationale: "Terms satisfy operational margins. Binding envelope ready for human sign-off.",
      },
    ],
  },
  search: {
    id: "search",
    title: "Executive Search",
    agentA: {
      name: "Teneo Talent",
      org: "teneo-search.com",
      role: "Retained Agency",
      key: "04e280a9…61c2",
    },
    agentB: {
      name: "Solv Energy",
      org: "solv-cleanenergy.de",
      role: "Hiring Enterprise",
      key: "047d12bc…991a",
    },
    ricardianTemplate: "AESC Retained Search Master",
    turns: [
      {
        round: 1,
        sender: "a",
        name: "Teneo Talent",
        role: "Retained Agency",
        type: "propose",
        terms: {
          "Placement fee": "30% first-year OTE",
          "Retainer schedule": "1/3 upfront, 1/3 shortlist, 1/3 close",
          "Guarantee window": "120 days replacement",
          "Exclusivity": "Exclusive 90 days",
        },
        fitScore: 94,
        rationale: "Tier-1 executive engineering search with comprehensive Scandinavian talent mapping.",
      },
      {
        round: 2,
        sender: "b",
        name: "Solv Energy",
        role: "Hiring Enterprise",
        type: "counter",
        terms: {
          "Placement fee": "24% first-year OTE",
          "Retainer schedule": "25% upfront, 25% shortlist, 50% close",
          "Guarantee window": "180 days replacement",
          "Exclusivity": "Exclusive 60 days",
        },
        fitScore: 85,
        rationale: "Corporate mandate caps recruitment fee tier and requires back-weighted milestone payout.",
      },
      {
        round: 3,
        sender: "a",
        name: "Teneo Talent",
        role: "Retained Agency",
        type: "counter",
        terms: {
          "Placement fee": "26.5% first-year OTE",
          "Retainer schedule": "30% upfront, 30% shortlist, 40% close",
          "Guarantee window": "150 days replacement",
          "Exclusivity": "Exclusive 75 days",
        },
        fitScore: 88,
        rationale: "Coupled constraint: extending replacement guarantee in exchange for 26.5% baseline.",
      },
      {
        round: 4,
        sender: "b",
        name: "Solv Energy",
        role: "Hiring Enterprise",
        type: "accept",
        terms: {
          "Placement fee": "26.5% first-year OTE",
          "Retainer schedule": "30% upfront, 30% shortlist, 40% close",
          "Guarantee window": "150 days replacement",
          "Exclusivity": "Exclusive 75 days",
        },
        fitScore: 89,
        rationale: "Concessions matched. Mandate thresholds cleared. Prepared for signature.",
      },
    ],
  },
  sponsorship: {
    id: "sponsorship",
    title: "Kit Sponsorship",
    agentA: {
      name: "Nordic FinTech Group",
      org: "nordicfin.se",
      role: "Sponsor Brand",
      key: "0498b3ca…33da",
    },
    agentB: {
      name: "FC Copenhagen",
      org: "fck.dk",
      role: "Commercial",
      key: "0411a76f…b88e",
    },
    ricardianTemplate: "UEFA Standard Model",
    turns: [
      {
        round: 1,
        sender: "a",
        name: "Nordic FinTech Group",
        role: "Sponsor Brand",
        type: "propose",
        terms: {
          "Annual fee": "€2.4M",
          "Kit placement": "Front of Shirt + Sleeve",
          "VIP hospitality": "20 Box Tickets",
          "Category exclusivity": "Exclusive across Nordic banking",
        },
        fitScore: 90,
        rationale: "Flagship Nordic campaign targeting Champions League qualification cycle.",
      },
      {
        round: 2,
        sender: "b",
        name: "FC Copenhagen",
        role: "Commercial",
        type: "counter",
        terms: {
          "Annual fee": "€3.2M",
          "Kit placement": "Front of Shirt Only",
          "VIP hospitality": "12 Box Tickets",
          "Category exclusivity": "Retail banking only",
        },
        fitScore: 82,
        rationale: "Sleeve package already reserved under domestic telecom contract.",
      },
      {
        round: 3,
        sender: "a",
        name: "Nordic FinTech Group",
        role: "Sponsor Brand",
        type: "counter",
        terms: {
          "Annual fee": "€2.85M",
          "Kit placement": "Front of Shirt + Perimeter",
          "VIP hospitality": "16 Box Tickets",
          "Category exclusivity": "Full fintech & wealth management",
        },
        fitScore: 87,
        rationale: "Compensating sleeve branding with primary LED perimeter rotation.",
      },
      {
        round: 4,
        sender: "b",
        name: "FC Copenhagen",
        role: "Commercial",
        type: "accept",
        terms: {
          "Annual fee": "€2.85M",
          "Kit placement": "Front of Shirt + Perimeter",
          "VIP hospitality": "16 Box Tickets",
          "Category exclusivity": "Full fintech & wealth management",
        },
        fitScore: 88,
        rationale: "Commercial targets cleared. Ready for board approval queue.",
      },
    ],
  },
};

export function LandingHeroSimulator() {
  const [selectedScenario, setSelectedScenario] = useState<string>("freight");
  const [turnIndex, setTurnIndex] = useState<number>(2);

  const scenario = SIM_SCENARIOS[selectedScenario];
  const currentTurn = scenario.turns[turnIndex];
  const maxTurn = scenario.turns.length - 1;

  const handleNextTurn = () => {
    setTurnIndex((prev) => (prev < maxTurn ? prev + 1 : 0));
  };

  return (
    <div className="sim-container">
      {/* Simulation Header: Clean & Minimal */}
      <div className="sim-header">
        <div className="sim-title-group">
          <div className="sim-live-indicator">
            <span className="sim-pulse-dot" />
            <span>Wire Simulator</span>
          </div>
          <span className="sim-protocol-badge">obn/0.3</span>
        </div>

        {/* Scenario Selector */}
        <div className="sim-tabs" role="tablist">
          {Object.values(SIM_SCENARIOS).map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedScenario(s.id);
                setTurnIndex(2);
              }}
              className={`sim-tab ${selectedScenario === s.id ? "active" : ""}`}
              type="button"
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Agents Facing Strip */}
      <div className="sim-facing">
        <div className={`sim-agent-card ${currentTurn.sender === "a" ? "active-speaker" : ""}`}>
          <div className="sim-agent-top">
            <span className="sim-agent-name">{scenario.agentA.name}</span>
            <span className="sim-role-pill">{scenario.agentA.role}</span>
          </div>
          <div className="sim-agent-meta">
            <span className="sim-agent-domain">{scenario.agentA.org}</span>
            <span className="sim-agent-key">ed25519:{scenario.agentA.key}</span>
          </div>
        </div>

        <div className="sim-vs-bridge">
          <div className="sim-vs-circle">⇄</div>
          <span className="sim-vs-label">Round {currentTurn.round}/{scenario.turns.length}</span>
        </div>

        <div className={`sim-agent-card ${currentTurn.sender === "b" ? "active-speaker" : ""}`}>
          <div className="sim-agent-top">
            <span className="sim-agent-name">{scenario.agentB.name}</span>
            <span className="sim-role-pill">{scenario.agentB.role}</span>
          </div>
          <div className="sim-agent-meta">
            <span className="sim-agent-domain">{scenario.agentB.org}</span>
            <span className="sim-agent-key">ed25519:{scenario.agentB.key}</span>
          </div>
        </div>
      </div>

      {/* Wire Box */}
      <div className="sim-wire-box">
        <div className="sim-wire-header">
          <div className="sim-wire-status">
            <span className="sim-type-badge">{currentTurn.type}</span>
            <span className="sim-speaker-tag">
              Sent by <strong>{currentTurn.name}</strong>
            </span>
          </div>

          <div className="sim-security-meta">
            <span className="sim-fit-pill">Utility Fit: <strong>{currentTurn.fitScore}%</strong></span>
            <span className="sim-security-tag">Signature Verified ✓</span>
          </div>
        </div>

        <p className="sim-rationale">&ldquo;{currentTurn.rationale}&rdquo;</p>

        {/* Commercial Terms Matrix */}
        <div className="sim-terms-matrix">
          {Object.entries(currentTurn.terms).map(([key, val]) => (
            <div key={key} className="sim-term-cell">
              <span className="sim-term-label">{key}</span>
              <span className="sim-term-value">{val}</span>
            </div>
          ))}
        </div>

        <div className="sim-legal-anchor">
          <span>Ricardian Template: <strong>{scenario.ricardianTemplate}</strong></span>
        </div>
      </div>

      {/* Simulator Controls & CTA */}
      <div className="sim-controls-bar">
        <div>
          <button onClick={handleNextTurn} className="sim-action-btn" type="button">
            {turnIndex === maxTurn ? "↻ Replay" : "Next Concession →"}
          </button>
          {turnIndex > 0 && (
            <button onClick={() => setTurnIndex(0)} className="sim-reset-btn" type="button">
              Reset
            </button>
          )}
        </div>

        <Link href="/floor" className="sim-cta-link">
          Open Live Floor →
        </Link>
      </div>
    </div>
  );
}
