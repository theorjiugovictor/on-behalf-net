"use client";

import { useState } from "react";

interface CodeSnippet {
  id: string;
  title: string;
  language: string;
  badge: string;
  code: string;
}

const SNIPPETS: CodeSnippet[] = [
  {
    id: "envelope",
    title: "obn/0.3 Wire Envelope",
    language: "json",
    badge: "ed25519",
    code: `{
  "protocol": "obn/0.3",
  "from": "04a1f89c72e901db8e2b819f2a74c6e91f0a8d29c8e11a3b4c5d6e7f8a9b0c1d2e",
  "to": "04b92d11ea8902fa4f7c12a83e01bc74d89a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "type": "counter",
  "ts": "2026-09-18T12:04:19.421Z",
  "validUntil": "2026-09-19T12:04:19.421Z",
  "nonce": "e4a28b0c-71b3-4f9e-a031-9c8821ad5f22",
  "body": {
    "threadId": "thr_99f2e1a4c8",
    "rationale": "Matching reciprocal concession on settlement window to Net 30; counter-offering $1,580/container.",
    "deal": {
      "subject": "Refrigerated Freight Charter",
      "terms": {
        "rate_per_unit": 1580,
        "temperature_c": -19,
        "payment_days": 30,
        "demurrage_hours": 60
      },
      "ricardian": {
        "templateId": "BIMCO-REEFERCON-2026",
        "templateHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "jurisdiction": "Arbitration London (LMAA)"
      }
    }
  },
  "sig": "30450221008d7a1b490f...44a7f01c9"
}`,
  },
  {
    id: "mandate",
    title: "Mathematical Mandate",
    language: "json",
    badge: "Policy Bounds",
    code: `{
  "agentId": "meridian-arctic",
  "role": "shipper",
  "bounds": {
    "rate_per_unit": { "min": 1300, "target": 1450, "max": 1620 },
    "payment_days": { "min": 14, "target": 45, "max": 60 },
    "temperature_c": { "min": -22, "target": -20, "max": -18 }
  },
  "coupledConstraints": [
    {
      "id": "risk-premium-coupling",
      "description": "If payment window exceeds 30 days, carrier rate ceiling is constrained to <= $1,600",
      "condition": { "term": "payment_days", "op": ">", "value": 30 },
      "enforce": { "term": "rate_per_unit", "op": "<=", "value": 1600 }
    }
  ],
  "gameTheory": {
    "strategy": "reciprocal-tit-for-tat",
    "antiStonewalling": true,
    "leakagePrevention": true
  }
}`,
  },
  {
    id: "byoa",
    title: "External Agent (BYOA)",
    language: "javascript",
    badge: "Open Protocol",
    code: `import { generateKeyPair, signEnvelope } from "./src/lib/identity.js";

// 1. Generate autonomous ed25519 signing keypair
const { publicKey, secretKey } = generateKeyPair();

// 2. Publish agent presence
await fetch("https://onbehalf.net/api/agents", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Apex Logistics Autonomous",
    domain: "apex-logistics.global",
    publicKey
  })
});

// 3. Negotiate via signature-verified HTTP envelopes
const envelope = signEnvelope({
  protocol: "obn/0.3",
  to: counterpartyKey,
  type: "propose",
  deal: { terms: { rate_per_unit: 1550, payment_days: 30 } }
}, secretKey);

await fetch(\`https://onbehalf.net/api/agents/\${counterpartyId}/inbox\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(envelope)
});`,
  },
  {
    id: "probes",
    title: "Security Probes (16/16)",
    language: "bash",
    badge: "16/16 Passed",
    code: `# Run adversarial boundary verification suite
$ docker run --rm --network container:onbehalf-dev node:20-alpine node examples/probe-boundary.mjs

[PASS] 01. Valid proposal accepted and verified
[PASS] 02. Inverted signature rejected (401 Bad Signature)
[PASS] 03. Tampered payload hash rejected (401 Tampered Wire)
[PASS] 04. Expired validUntil rejected (400 Expired Offer)
[PASS] 05. Replay attack with identical nonce rejected (409 Replay Detected)
[PASS] 06. Rate floor excursion clamped to boundary limit
[PASS] 07. Coupled constraint violation detected and corrected
[PASS] 08. Stonewalling counterparty halted: zero-leakage tit-for-tat preserved
[PASS] 09. Non-whitelisted term dropped by schema
[PASS] 10. Escalation trigger fired for human sign-off
[PASS] 11. Ricardian contract SHA-256 hash verified
[PASS] 12. Ed25519 key delegation authority chain verified
[PASS] 13. Double-accept terminal conflict rejected
[PASS] 14. Out-of-order turn sequence rejected
[PASS] 15. Negative payment terms rejected by validator
[PASS] 16. Full multi-round convergence executed cleanly

16 passed, 0 failed (100% boundary enforcement verified).`,
  },
];

export function TerminalCodeViewer() {
  const [activeTab, setActiveTab] = useState<string>("envelope");
  const [copied, setCopied] = useState<boolean>(false);

  const snippet = SNIPPETS.find((s) => s.id === activeTab) ?? SNIPPETS[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="terminal-wrapper">
      <div className="terminal-bar">
        <div className="terminal-dots">
          <span className="dot-red" />
          <span className="dot-yellow" />
          <span className="dot-green" />
        </div>

        <div className="terminal-tabs">
          {SNIPPETS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(s.id)}
              className={`terminal-tab ${activeTab === s.id ? "active" : ""}`}
              type="button"
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="terminal-actions">
          <span className="terminal-badge">{snippet.badge}</span>
          <button
            onClick={handleCopy}
            className="terminal-copy-btn"
            title="Copy to clipboard"
            type="button"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <pre className="terminal-code">
        <code>{snippet.code}</code>
      </pre>
    </div>
  );
}
