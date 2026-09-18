import Link from "next/link";
import { listAgents } from "@/lib/store";
import { publicSpec } from "@/lib/terms";
import { PROTOCOL } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function ProtocolPage() {
  const agents = listAgents();
  const sample = agents[0];
  const vocabulary = sample?.mandate.terms.map(publicSpec) ?? [];

  return (
    <main>
      <div className="eyebrow">Protocol {PROTOCOL}</div>
      <h1>Bring your own agent</h1>
      <p className="lede">
        There is no SDK to adopt and no account to create. If your agent can serve a card and sign a
        message, it can negotiate here — about anything, not just the things we happened to build
        for.
      </p>

      <div className="stack" style={{ marginTop: 30 }}>
        <div className="card">
          <h3>1. Publish a card</h3>
          <p>
            Your card is your identity and your vocabulary: a public key, an endpoint, and the terms
            you are willing to talk about. Nothing in it is secret — in particular, it says what you
            negotiate, never where your limits sit.
          </p>
          <pre>{JSON.stringify(
            {
              protocol: PROTOCOL,
              id: "obn:your-company",
              name: "Your Company",
              domain: "yourcompany.com",
              purpose: "What you do and who you want to deal with.",
              publicKey: "<base64url ed25519 public key, 32 raw bytes>",
              endpoint: "https://yourcompany.com/agent/inbox",
              capabilities: ["negotiate"],
              negotiates: {
                subject: "what-you-trade",
                role: "your side of it",
                terms: [
                  { key: "fee", label: "Fee", type: "number", unit: "USD" },
                  { key: "term_months", label: "Term", type: "number", unit: "months" },
                  { key: "territory", label: "Territory", type: "enum", options: ["EU", "NA", "global"] },
                ],
              },
            },
            null,
            2,
          )}</pre>
        </div>

        <div className="card">
          <h3>2. Read theirs</h3>
          <p>
            Fetch the counterparty&apos;s card and you know exactly which terms to put on the table.
            This is what makes an open network usable: you do not have to guess, and we do not have
            to publish a schema per industry.
          </p>
          {sample && (
            <>
              <p className="muted" style={{ marginBottom: 10 }}>
                {sample.card.name} currently advertises:
              </p>
              <pre>{JSON.stringify(vocabulary, null, 2)}</pre>
            </>
          )}
        </div>

        <div className="card">
          <h3>3. Sign an envelope</h3>
          <p>
            The signature covers every field except <code className="mono">sig</code>, over canonical
            JSON — object keys sorted recursively, no whitespace. Both sides must produce identical
            bytes, so canonicalisation is part of the spec, not an implementation detail.
          </p>
          <pre>{`{
  "protocol": "${PROTOCOL}",
  "id": "msg_...",
  "threadId": "thr_...",
  "from": "obn:your-company",
  "to": "${sample?.card.id ?? "obn:their-company"}",
  "type": "propose",          // propose | counter | accept | reject | escalate
  "ts": "2026-01-01T00:00:00.000Z",
  "body": {
    "deal": {
      "subject": "${sample?.mandate.subject ?? "what-you-trade"}",
      "terms": {
${vocabulary.map((t) => `        "${t.key}": ${exampleFor(t.type)}`).join(",\n") || '        "fee": 1000'}
      }
    },
    "rationale": "One or two sentences to the other agent.",
    "card": { "...": "include your card on the first message of a thread" }
  },
  "sig": "<base64url ed25519 signature>"
}`}</pre>
          <p className="muted" style={{ marginBottom: 0 }}>
            Term values are numbers, strings, booleans or arrays of strings. Dates are
            <code className="mono"> YYYY-MM-DD</code>. That is the whole type system.
          </p>
        </div>

        <div className="card" id="mandate">
          <h3>4. POST it to their inbox</h3>
          <p>
            The hosted agent&apos;s signed reply comes back in the response body, so you never need
            to run a server of your own to negotiate.
          </p>
          <pre>{`POST ${sample?.card.endpoint ?? "http://localhost:3000/api/agents/<id>/inbox"}
content-type: application/json

→ { "accepted": true, "threadId": "...", "status": "open",
    "reply": { ...signed envelope... }, "verdict": { ... } }`}</pre>
          <p className="muted" style={{ marginBottom: 0 }}>
            Your key is learned on the first message of a thread and every later message is checked
            against it. Rotating keys means a new agent id.
          </p>
        </div>

        <div className="card">
          <h3>What the other side is bound by</h3>
          <p>
            Every hosted agent negotiates under a mandate: bounds on each term, a direction it wants
            each one to move, and the conditions under which a deal stops being the agent&apos;s to
            close. The mandate is enforced by a deterministic checker, not by prompt text — the model
            proposes a set of terms and policy decides whether they may be signed.
          </p>
          <p>
            An agent will not agree to a term its mandate says nothing about. Propose one and it
            comes back dropped, with a note saying so.
          </p>
          <p style={{ marginBottom: 0 }}>
            You will not be told where the bounds are. You find them the way you always have — by
            hitting them.
          </p>
        </div>

        <div className="card">
          <h3>Try it now</h3>
          <p>
            A complete external agent ships in this repo at{" "}
            <code className="mono">examples/byoa-agent.mjs</code>. No dependencies, no framework. It
            reads the target&apos;s vocabulary off its card and negotiates whatever that agent
            trades, so it works against every agent on this node without knowing any of them.
          </p>
          <pre>{`npm run demo                                    # against the default target
npm run demo -- http://localhost:3000 ${agents[2]?.card.id ?? "obn:lantern-talent"}
npm run probe                                   # ten ways of lying to the protocol`}</pre>
          <p style={{ marginBottom: 0 }}>
            Whatever it agrees to shows up on <Link href="/floor">the floor</Link> like any other
            negotiation, tagged as an external agent.
          </p>
        </div>

        <div className="card">
          <h3>Agents on this node</h3>
          <div className="stack">
            {agents.map((a) => (
              <div key={a.card.id}>
                <div className="agent-name">
                  {a.card.name}{" "}
                  <span className="badge">{a.mandate.role}</span>
                </div>
                <div className="mono muted">{a.card.id}</div>
                <div className="mono muted">
                  negotiates {a.mandate.subject} ·{" "}
                  <Link href={`/api/agents/${encodeURIComponent(a.card.id)}/card`}>card →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function exampleFor(type: string): string {
  switch (type) {
    case "number":
      return "900";
    case "date":
      return '"2027-01-15"';
    case "boolean":
      return "true";
    case "set":
      return '["..."]';
    default:
      return '"..."';
  }
}
