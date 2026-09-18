# Running the demo

## Before you start

```bash
npm install && npm run build && npm start
curl -s localhost:3000/api/health
```

`mode` tells you what you are running on: `live`, `partial`, or `offline`. All three work. If the
network dies mid-demo the floor keeps negotiating — the fallbacks are on the same code path, not a
separate "demo mode", so nothing about the screen changes.

Open two tabs: `/floor` and `/inbox`. Have a terminal ready in the repo directory.

## The run

**1 · Presence** — `/onboard`

Two doors: a company or a person. Show both — it is the difference between a B2B marketplace and
infrastructure.

*As a company:* type a URL. An agent comes back with its own keypair, a purpose read off the company's own
site, and a starter mandate whose terms were inferred from what that company actually trades. The
line to land: *a company got an email address, then a website. This is the next one.*

*As a person:* a name, an inbox and a sentence about what you do. You get the same engine and the
same protocol; what differs is attestation. A company proves a domain it controls, a person proves
an inbox — and the inbox is the point, because that is where an agreement would actually be sent.
Note the line under the button: the address is stored privately and never appears on the public
card. Verify with the code, and the badge goes from unverified to email verified.

Worth showing if you have a minute: register with an address at a domain already verified on the
node and the level jumps straight to domain verified. The employer proved the domain; this person
proved an address inside it.

The starter mandate always carries an `always` approval rule — a brand new agent can negotiate but
cannot close anything without a human, and its set terms have an empty allowlist so it cannot agree
to a clause the model invented. Worth pointing out; it is the kind of default that tells a
governance-minded audience you have thought about this.

**2 · Traversal** — `/traverse`

Pick an agent, hit Traverse. It reads the open web and comes back with counterparties, each with a
reason tied to that agent's mandate. *This is useful with nobody else in the room.* If Tavily is
unkeyed it returns fixtures in the identical shape and the strip says so honestly.

**3 · Negotiation** — `/floor`

Three scenarios sit on the picker: freight, executive search, shirt sponsorship. **Run one, then run
another.** That is the whole argument for the architecture in ten seconds — same engine, same
protocol, same approval gate, and the only thing that changed is data.

Things to point at:

- Each turn carries a green **within mandate** badge. That is not the model saying so — it is a
  deterministic check that ran before the message was signed.
- The **fit** number is how good those terms are for the agent sending them, against its own
  mandate. Watch it fall as each side concedes.
- In the sponsorship, watch **category exclusivity**. The club opens refusing it and the brand
  demands it. Around turn seven the club gives way and its fit drops from 77 to 56 — it surrendered
  the thing it had been defending, because the brand weighted it higher. Nobody scripted that.
- In the freight run, the shipper requires **temperature-logging** and the carrier absorbs it. Set
  terms negotiate too.

**4 · Approval** — the banner, then `/inbox`

The thread stops itself: *the agents have agreed, a human has not.* This is the moment. Switch to
the inbox, add a note, approve. The approval is signed and recorded on the wire like any other move,
so the audit trail shows a person closed it.

**5 · BYOA** — the terminal

```bash
npm run demo                                          # freight
npm run demo -- http://localhost:3000 obn:lantern-talent   # executive search
npm run demo -- http://localhost:3000 obn:harbour-fc       # sponsorship
```

One file, no dependencies, not running on the node. It says `hello`, lets the counterparty open,
reads the term vocabulary off their card, and negotiates whatever they trade. Running it against
all three targets is the point: *the same external agent closed a freight contract, a recruiting
engagement and a sponsorship, and it has never heard of any of them.*

When it accepts, the node parks it for a human on *its* side, and now says exactly why: the external
agent is unverified, and these mandates carry `{ kind: "counterparty-below", level: "email" }`. An
unverified stranger is never closed with automatically, however small the deal. That is what lets
the network admit everyone without lowering anyone's bar.

Then, if anyone asks what stops them from cheating:

```bash
npm run probe
npm run probe -- http://localhost:3000 obn:harbour-fc
```

Twelve probes: forged signatures, bodies tampered after signing, unknown senders, every number
driven to 1, clauses the agent may never agree to, and two terms smuggled in that no mandate
mentions, and a card claiming a verification it never earned. All refused or corrected, in every industry.

## If something goes wrong

- **Floor will not start** — needs the seeded agents. `curl localhost:3000/api/agents`.
- **A turn hangs** — a slow model call stalls one turn, not the thread. Press Step once.
- **Everything is slow** — unset `NEBIUS_API_KEY` and restart. Runs on the local strategy, still
  converges, still escalates.
- **The external agent is refused with a signature error** — it derives a stable key from its agent
  id, so this means something else is using that id with a different key. Change the seed string in
  `examples/byoa-agent.mjs`.
- **Reset between runs** — press New negotiation, or restart the server to clear all state.
