# Running the demo

## Before you walk on

```bash
npm install && npm run build && npm start
curl -s localhost:3000/api/health
```

`mode` tells you what you are running on: `live`, `partial`, or `offline`. All three work. If the
venue wifi dies mid-demo, the floor keeps negotiating — the fallbacks are on the same code path,
not a separate "demo mode", so nothing about the screen changes.

Open two tabs: `/floor` and `/inbox`. Have a terminal ready in the repo directory.

## The run, four minutes

**1 · Presence** — `/onboard`

Type a company URL. An agent comes back with its own keypair, a purpose read off the company's own
site, and a starter mandate. The line to land: *a company got an email address, then a website.
This is the next one.*

The starter mandate sets `autoApproveBelowValue: 0` — a brand new agent can negotiate but cannot
close anything without a human. Worth pointing out; it is the kind of default that tells a
governance-minded audience you have thought about this.

**2 · Traversal** — `/traverse`

Pick an agent, hit Traverse. It reads the open web and comes back with counterparties, each with a
reason tied to that agent's mandate. *This is useful with nobody else in the room.* If Tavily is
unkeyed it returns fixtures in the identical shape and the strip says so honestly.

**3 · Negotiation** — `/floor`

Open the floor and let it run. Eight turns, roughly fifteen seconds. Two things to point at:

- Each turn carries a green **within mandate** badge. That is not the model saying so — it is a
  deterministic check that ran before the message was signed.
- They converge from 1,049 and 841 to about 921, between the seller's floor and the buyer's
  ceiling. Neither side is told where the other's limits are.

**4 · Approval** — the banner, then `/inbox`

The thread stops itself: *the agents have agreed, a human has not.* This is the moment. Switch to
the inbox, add a note, approve. The approval is signed and recorded on the wire like any other
move, so the audit trail shows a person closed it.

**5 · BYOA** — the terminal

```bash
npm run demo
```

A third-party agent, no dependencies, not running on the node. It mints a keypair, is learned by
the node on its first message, negotiates a real deal, and verifies every reply's signature. When
it accepts a large deal, the node parks it for a human on *its* side — a counterparty cannot bind
you past your own mandate by agreeing.

Then, if anyone asks what stops them from cheating:

```bash
npm run probe
```

Ten probes: forged signatures, tampered bodies, unknown senders, an offer at USD 50 against a floor
of 820, clauses the agent may never agree to. All ten refused or corrected.

## Decision: does BYOA go in tonight?

It already is in — that was the point of building the protocol as the seam rather than as a later
extraction. You do not have to choose between shipping it and describing it. Run `npm run demo` if
the room is technical and you have four minutes; describe it over the `/protocol` page if you are
short on time. Either way the claim is demonstrated rather than promised.

## If something goes wrong

- **Floor will not start** — needs two agents. `curl localhost:3000/api/agents`.
- **A turn hangs** — a slow model call stalls one turn, not the thread. Press Step once.
- **Everything is slow** — unset `NEBIUS_API_KEY` and restart. Runs on the local strategy, still
  converges, still escalates.
- **Reset between runs** — press New negotiation, or restart the server to clear all state.
