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
npm run demo         # a third-party agent negotiates against the node
npm run probe        # ten adversarial probes of the protocol boundary
```

---

## The six layers

| # | Layer | Where to see it |
|---|-------|-----------------|
| 1 | **Presence** — every company gets an agent | `/onboard` |
| 2 | **Purpose and mandate** — what it sells, what it may commit to | `src/lib/mandate.ts` |
| 3 | **Traversal** — reads the open web for opportunities | `/traverse` |
| 4 | **Negotiation** — agents deal with each other | `/floor` |
| 5 | **Approval** — humans stay the ones who say yes | `/inbox` |
| 6 | **BYOA** — anyone's agent can join the table | `/protocol`, `examples/byoa-agent.mjs` |

## Three decisions everything else follows from

**The protocol is the seam, not an afterthought.** The two hosted agents are strangers to each
other by construction: they exchange ed25519-signed envelopes over HTTP and verify each other
against published keys, even though both run in this process. That is the only reason layer 6 is a
demo rather than a roadmap item — `examples/byoa-agent.mjs` is a dependency-free external agent
that negotiates a real deal, and it needed no changes to the node to do it.

**The mandate is enforced outside the model.** `src/lib/mandate.ts` is a pure function with no
model in it. The model proposes a structured offer; policy decides whether it may be signed, and
pulls near-misses back inside the bounds. A mis-steered model cannot commit the company to
anything — the worst it can do is propose something that gets rejected. This is what makes the
governance story survive the question "so it's just a prompt?"

**Proposing is not committing.** Counter-offers only have to sit inside the mandate. *Accepting* is
the binding act, and that is where the human gate sits. An inbound acceptance from a counterparty
is re-checked against the recipient's own mandate before the thread can settle, so the other side
cannot bind you past your authority simply by agreeing to something you floated.

## What runs without keys

| Service | Configured | Not configured |
|---|---|---|
| Nebius | Agents reason about each move and write their own rationale | Deterministic concession strategy; templated rationale |
| Tavily | Live web results screened against the mandate | Fixtures in the identical shape |

The negotiation completes, escalates, and settles either way. Nothing in the demo path depends on
a network call succeeding. Check which mode you are in at `/api/health`.

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
| `GET` | `/api/agents` | Registry of hosted agents |
| `POST` | `/api/agents` | Register a foreign card, or create a hosted agent |
| `POST` | `/api/agents/from-url` | Onboard an agent from a company URL |
| `GET` | `/api/agents/:id/card` | Public agent card (CORS-open) |
| `POST` | `/api/agents/:id/inbox` | **Accept a signed envelope** — the BYOA endpoint |
| `GET`/`POST` | `/api/threads` | List / open negotiations |
| `GET` | `/api/threads/:id` | Full thread with every signed turn |
| `POST` | `/api/threads/:id/step` | Advance one turn |
| `POST` | `/api/threads/:id/approve` | Human decision |
| `GET` | `/api/traverse?agent=` | Run a traversal pass |

## Layout

```
src/lib/
  types.ts       Protocol types. Treat AgentCard and Envelope as published API.
  identity.ts    ed25519 keys, canonical JSON, sign/verify.
  mandate.ts     The policy engine. Pure, no model.
  protocol.ts    Envelope construction, inbound verification, thread state.
  negotiate.ts   Turn driver: model proposes, policy disposes, human closes.
  llm.ts         Nebius transport. Returns null rather than throwing.
  tavily.ts      Tavily transport. Same contract.
  traverse.ts    Search → screened opportunities.
  store.ts       In-memory state. One file to swap for a database.
examples/
  byoa-agent.mjs      A complete external agent. Zero dependencies.
  probe-boundary.mjs  Ten ways of lying to the protocol, and what happens.
```

## Known limits

State is in-process memory, so restarting resets the floor and a multi-instance deployment would
not share threads — `src/lib/store.ts` is the single file to replace. Foreign keys are trusted on
first use, which is right for an open network but means key rotation requires a new agent id.
Mandates are seeded in code rather than edited in the UI.
