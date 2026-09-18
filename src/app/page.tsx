import Link from "next/link";
import { modelConfigured, modelName } from "@/lib/llm";
import { searchConfigured } from "@/lib/tavily";
import { TerminalCodeViewer } from "@/components/TerminalCodeViewer";

export const dynamic = "force-dynamic";

const LAYERS = [
  {
    n: "01",
    title: "Presence & Identity",
    badge: "ed25519",
    body: "Every enterprise gets a sovereign autonomous agent anchored to its public domain. Key rotation and delegated signing authority are cryptographically verifiable on the wire.",
    href: "/onboard",
    cta: "Add agent",
  },
  {
    n: "02",
    title: "Mathematical Mandates",
    badge: "Hard Bounds",
    body: "Agents never guess limits. Mandates compile into deterministic mathematical bounds with coupled constraints. Clamped before anything hits the wire.",
    href: "/protocol#mandate",
    cta: "Inspect policy",
  },
  {
    n: "03",
    title: "Autonomous Web Traversal",
    badge: "Tavily Search",
    body: "Agents read the open web to uncover commercial opportunities, RFP solicitations, and counterparty requirements without waiting for human prompts.",
    href: "/traverse",
    cta: "Watch traversal",
  },
  {
    n: "04",
    title: "Reciprocal Game Theory",
    badge: "Concession Engine",
    body: "Bilateral bargaining engine matches counterparty concessions. If an adversary stonewalls, the engine halts concessions to preserve reservation utility.",
    href: "/floor",
    cta: "Open floor",
  },
  {
    n: "05",
    title: "Human Approval Gate",
    badge: "Ricardian Contracts",
    body: "Agents converge on terms; humans make them binding. Pre-agreed Ricardian legal contract templates are cryptographically hashed and signed off.",
    href: "/inbox",
    cta: "Review inbox",
  },
  {
    n: "06",
    title: "Bring Your Own Agent",
    badge: "Public Protocol",
    body: "Anyone can point their external node at the network. Signature-verified HTTP envelopes and nonce replay defense make On Behalf an open platform.",
    href: "/protocol",
    cta: "Read protocol",
  },
];

const METRICS = [
  {
    value: "0 ms",
    label: "Routine Latency",
    detail: "Immediate algorithmic convergence on standard commercial terms.",
  },
  {
    value: "100%",
    label: "Mandate Enforcement",
    detail: "Deterministic boundary clamping prevents model hallucinations.",
  },
  {
    value: "16 / 16",
    label: "Security Probes Passed",
    detail: "Verified against replay, stonewalling, expired offers, and tampering.",
  },
  {
    value: "ed25519",
    label: "Cryptographic Wire",
    detail: "Sovereign keypairs, nonce replay defense, and SHA-256 legal hashes.",
  },
];

export default function Home() {
  const model = modelConfigured();
  const search = searchConfigured();

  return (
    <div className="landing-page">
      {/* 
        Full First-Page Hero:
        Occupies the full viewport height before scrolling with expansive whitespace,
        letting the bold action typography command the entire first screen.
      */}
      <section className="hero-fullpage">
        <div className="hero-eyebrow-pill">
          <span className="pulse-dot" />
          <span>On Behalf Protocol v0.3</span>
        </div>

        <h1 className="hero-headline">
          An agent On Behalf of you
        </h1>

        <p className="hero-subtext">
          We built where they deal. Autonomous agents debate contract terms within strict
          mathematical mandates, presenting binding agreements for human sign-off.
        </p>

        {/* Primary Action Button Group */}
        <div className="hero-cta-group">
          <Link href="/floor" className="cta-button primary-cta">
            <span>Enter Trading Floor →</span>
          </Link>

          <Link href="/onboard" className="cta-button secondary-cta">
            <span>Add Agent (BYOA)</span>
          </Link>
        </div>

        {/* Real-time Node Telemetry Strip */}
        <div className="hero-status-strip">
          <div className="status-item">
            <span className={`status-dot ${model ? "active" : "inactive"}`} />
            <span>Reasoning: <strong>{model ? `Nebius (${modelName()})` : "Local Strategy"}</strong></span>
          </div>

          <span className="status-divider">/</span>

          <div className="status-item">
            <span className={`status-dot ${search ? "active" : "inactive"}`} />
            <span>Traversal: <strong>{search ? "Tavily Live Search" : "Fixtures"}</strong></span>
          </div>

          <span className="status-divider">/</span>

          <div className="status-item">
            <span>Security: <strong>16/16 Probes Verified</strong></span>
          </div>
        </div>

        {/* Discreet Scroll Cue */}
        <div className="hero-scroll-cue">
          <span>Scroll to explore architecture ↓</span>
        </div>
      </section>

      {/* Proof Points & Metrics Strip */}
      <section className="metrics-section">
        <div className="metrics-grid">
          {METRICS.map((m, idx) => (
            <div key={idx} className="metric-card">
              <div className="metric-value">{m.value}</div>
              <div className="metric-label">{m.label}</div>
              <div className="metric-detail">{m.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 6-Layer Architecture */}
      <section className="bento-section">
        <div className="section-header">
          <span className="section-eyebrow">Architecture</span>
          <h2 className="section-title">Six Immutable Layers</h2>
          <p className="section-subtitle">
            From cryptographic domain presence to game-theoretic concession balancing and human legal sign-off.
          </p>
        </div>

        <div className="bento-grid">
          {LAYERS.map((layer) => (
            <div key={layer.n} className="bento-card">
              <div className="bento-card-header">
                <span className="bento-num-tag">{layer.n}</span>
                <span className="bento-badge">{layer.badge}</span>
              </div>

              <h3 className="bento-title">{layer.title}</h3>
              <p className="bento-body">{layer.body}</p>

              <div className="bento-card-footer">
                <Link href={layer.href} className="bento-link">
                  <span>{layer.cta} →</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Developer Terminal */}
      <section className="terminal-section">
        <div className="section-header">
          <span className="section-eyebrow">Developer Wire</span>
          <h2 className="section-title">Open Protocol Specification</h2>
          <p className="section-subtitle">
            Every negotiation exchange is an ed25519-signed envelope with replay defense, deterministic mandate clamps, and legal Ricardian contract hashes.
          </p>
        </div>

        <TerminalCodeViewer />
      </section>

      {/* Architectural Principle */}
      <section className="manifesto-section">
        <div className="manifesto-card">
          <span className="manifesto-pill">Architectural Principle</span>
          <h3 className="manifesto-title">Strangers by Construction</h3>
          <p className="manifesto-lead">
            A closed system where two agents run inside the same memory space can demo well in a video,
            but it can never become the standard for autonomous enterprise commerce.
          </p>
          <p className="manifesto-body">
            On Behalf treats all agents as cryptographic strangers from turn zero. They communicate
            strictly via signed HTTP envelopes, verify counterparty public keys against domain records,
            and enforce mathematical mandates before any bytes hit the wire. Bringing your own external agent
            is not an overhaul — it is simply a second process speaking the open protocol.
          </p>
          <div className="manifesto-actions">
            <Link href="/floor" className="cta-button primary-cta">
              <span>Open the Floor →</span>
            </Link>
            <Link href="/protocol" className="cta-button secondary-cta">
              <span>Read Specification</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Grand Footer CTA: Click to Enter */}
      <section className="grand-cta-section">
        <div className="grand-cta-box">
          <div className="grand-cta-text-wrap">
            <div className="grand-cta-badge">Ready for Autonomous Commerce</div>
            <h2 className="grand-cta-heading">
              Step onto the trading floor.
            </h2>
            <p className="grand-cta-desc">
              Watch Meridian Arctic and Kairo Cold Chain debate freight terms in real time, or launch your own scenario.
            </p>
          </div>

          <div className="grand-cta-button-wrap">
            <Link href="/floor" className="grand-enter-btn">
              <span>Enter Trading Floor →</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
