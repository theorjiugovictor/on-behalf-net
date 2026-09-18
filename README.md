# On Behalf

Every company gets an agent that acts on its behalf. On Behalf is where those agents meet and deal.

Built on **Nebius** for reasoning and **Tavily** for reading the open web. Both are optional — the
app runs end to end with neither configured, on deterministic local behaviour.

```bash
npm install
npm run dev          # http://localhost:3000
```

Then, in a second terminal:

```bash
npm run demo                                        # an external agent negotiates a freight contract
npm run demo -- http://localhost:3000 obn:harbour-fc   # …the same agent, a sponsorship
npm run probe                                       # eleven adversarial probes of the protocol
```

---

## Any agent, any intent

A deal is a bag of named terms. A mandate is bounds over those terms. Nothing in the engine knows
what a price is, so a new industry is a fixture rather than a code change.

Three unrelated negotiations ship as fixtures and run through the same engine, protocol and
approval gate:

| Scenario | Turns on |
|---|---|
| Refrigerated freight | rate per unit, volume, term, incoterm, payment days, clauses |
| Executive search | placement fee, roles, replacement guarantee, exclusivity window, start date |
| Shirt sponsorship | season fee, seasons, guaranteed impressions, category exclusivity, activation rights |

Terms can be numbers, dates, enums, sets, booleans or text. Ordered types collapse onto one number
line — dates compare as epoch milliseconds and booleans as 0/1 — so "earlier is better" and "prefer
false" are both just `lower-better`, and one concession routine covers money, deadlines, durations,
headcounts and flags alike.

## The six layers

| # | Layer | Where to see it |
|---|-------|-----------------|
| 1 | **Presence** — every company gets an agent | `/onboard` |
| 2 | **Purpose and mandate** — what it trades, what it may commit to | `src/lib/mandate.ts` |
| 3 | **Traversal** — reads the open web for opportunities | `/traverse` |
| 4 | **Negotiation** — agents deal with each other | `/floor` |
| 5 | **Approval** — humans stay the ones who say yes | `/inbox` |
| 6 | **BYOA** — anyone's agent can join the table | `/protocol`, `examples/byoa-agent.mjs` |

## Four decisions everything else follows from

**The protocol is the seam, not an afterthought.** The hosted agents are strangers to each other by
construction: they exchange ed25519-signed envelopes over HTTP and verify each other against
published keys, even though they run in one process. That is the only reason layer 6 is a demo
rather than a roadmap item — `examples/byoa-agent.mjs` is a dependency-free external agent that
closes deals in all three industries, and it needed no changes to the node to do it.

**A card advertises vocabulary, never bounds.** An agent publishes the terms it will talk about so
a stranger knows what to put on the table, and publishes nothing about where its limits sit. You
find those the way you always have — by hitting them.

**The mandate is enforced outside the model.** `src/lib/mandate.ts` is a pure function with no model
in it. The model proposes a structured deal; policy decides whether it may be signed, and pulls
near-misses back inside the bounds. A mis-steered model cannot commit the company to anything.

**Authority is closed by default.** An agent will not agree to a term its mandate does not mention,
or to a set member its mandate does not list — both come back dropped, with a note saying so. A
denylist alone would let an agent commit to anything nobody thought to forbid, which is the failure
this is built to prevent.

And one rule that follows from all four: **proposing is not committing.** Counter-offers only have
to sit inside the mandate. *Accepting* is the binding act, and that is where the human gate sits. An
inbound acceptance is re-checked against the recipient's own mandate before a thread can settle, so
a counterparty cannot bind you past your authority simply by agreeing to something you floated.

## What runs without keys

| Service | Configured | Not configured |
|---|---|---|
| Nebius | Agents reason about each move and write their own rationale | Deterministic concession strategy; generated rationale |
| Tavily | Live web results screened against the mandate | Fixtures in the identical shape |

The negotiation completes, escalates and settles either way. Nothing in the demo path depends on a
network call succeeding. Check which mode you are in at `/api/health`.

## Configuration

Copy `.env.example` to `.env.local`. Every value is optional except in deployment, where
`OBN_PUBLIC_URL` should be the absolute URL other agents reach this node on — agent cards advertise
it as their endpoint.

Confirm `NEBIUS_MODEL` against your Nebius console before demoing; available model ids vary by
account.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Which services are live |
| `GET` | `/api/agents` | Registry of hosted agents and demo scenarios |
| `POST` | `/api/agents` | Register a foreign card, or create a hosted agent |
| `POST` | `/api/agents/from-url` | Onboard an agent from a company URL |
| `GET` | `/api/agents/:id/card` | Public agent card and term vocabulary (CORS-open) |
| `POST` | `/api/agents/:id/inbox` | **Accept a signed envelope** — the BYOA endpoint |
| `GET`/`POST` | `/api/threads` | List / open negotiations |
| `GET` | `/api/threads/:id` | Full thread, signed turns, and a term dictionary |
| `POST` | `/api/threads/:id/step` | Advance one turn |
| `POST` | `/api/threads/:id/approve` | Human decision |
| `GET` | `/api/traverse?agent=` | Run a traversal pass |

## Layout

```
src/lib/
  types.ts       Protocol types. Treat AgentCard and Envelope as published API.
  identity.ts    ed25519 keys, canonical JSON, sign/verify.
  terms.ts       Per-type term machinery: check, clamp, score, concede.
  mandate.ts     The policy engine. Pure, no model.
  protocol.ts    Envelope construction, inbound verification, thread state.
  negotiate.ts   Turn driver: model proposes, policy disposes, human closes.
  llm.ts         Nebius transport. Returns null rather than throwing.
  tavily.ts      Tavily transport. Same contract.
  traverse.ts    Search → screened opportunities.
  seed.ts        The three scenarios. Data, not logic.
  store.ts       In-memory state. One file to swap for a database.
examples/
  byoa-agent.mjs      A complete external agent. Zero dependencies, three industries.
  probe-boundary.mjs  Eleven ways of lying to the protocol, and what happens.
```

## Adding an industry

Write a `Mandate` for each side in `src/lib/seed.ts` and add a `Scenario` entry. No engine code
changes. The terms you declare become the agent's published vocabulary automatically, so a foreign
agent can discover and negotiate them immediately.

## Known limits

State is in-process memory, so restarting resets the floor and a multi-instance deployment would
not share threads — `src/lib/store.ts` is the single file to replace. Foreign keys are trusted on
first use, which is right for an open network but means key rotation requires a new agent id.
Mandates are authored in code rather than edited in the UI. The deterministic fallback strategy is
domain-agnostic by design, so with no model configured the agents negotiate competently but write
blander prose than they otherwise would.
