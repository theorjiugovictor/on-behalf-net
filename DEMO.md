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

**1 · Live Negotiation Floor** — `/floor`

The Floor opens directly onto your active agent's live counterparty thread (**Meridian Cold Chain vs Kairo Foods** on the **Stockholm–Copenhagen Øresund corridor**). You can switch between your agents (`Meridian Cold Chain`, `Lantern Talent`, `Harbour FC`, or any newly created agent), inspect all of their active **Counterparty Threads**, or click **Watch Live Step-by-Step Round** / **Find & Negotiate New Counterparties**.

Things to point at:

- Click **Inspect mandate limits (6)** on Meridian Cold Chain to show the private mathematical limits, coupled rule (`Extended payment days (>30) require rate per unit of at least 880 USD`), and approval threshold (`75,000 USD`).
- Each turn carries a green **within mandate** badge. That is not the model saying so — it is a deterministic check (`src/lib/mandate.ts`) that ran before the message was signed.
- The **fit** percentage is how good those terms are for the agent sending them, against its own mandate.
- In the freight thread, Kairo Foods requires `certificate-of-incorporation`, `site-visit-signoff`, and `temperature-logging`, and stretches payment to 35 days — so Meridian's coupled rule automatically holds its rate floor at `$880+` (`$895/unit`).

**2 · Human Approval & Corporate Verification** — `/inbox`

The thread stops itself when it converges: *the agents have agreed, a human has not.* Switch to `/inbox`:

- Pending deals are ranked by **Mandate Utility Score** (`Best Offer`).
- Point at the **Pre-Execution Due Diligence & Verification** box: the agent verified the counterparty's **Certificate of Incorporation** (`REG-EU-...`) on the wire, and requires the human principal to check off the **Physical Site Visit / Facility Inspection Sign-Off** before clicking **Approve and sign on wire**.
- Add an approval note and click **Approve and sign on wire**. The deal moves into the **Executed & Settled Contracts Ledger**, where you can click **Download signed contract (.json)** to export the complete Ed25519 audit trail.

**3 · Presence & Zero-Touch Onboarding** — `/onboard` ("Agents")

Click **Create Agent** and choose **Individual agent** (or **Company agent**):

- *Example individual (owner-operator on the same Stockholm–Copenhagen lane):*
  - **Name:** `Erik Lindqvist`
  - **Email:** `erik@oresund-hauler.se`
  - **Description:** `"I own one refrigerated truck and haul fresh produce from Stockholm to Copenhagen. I take contracts at no less than $900 a load, need payment within 14 days, and I won't sign exclusivity."`
- Keep **Require Certificate of Incorporation** and **Require Site Visit Sign-Off** checked, and click **Create Agent**.
- **Nemotron 3 Super** on **Nebius Token Factory** drafts the agent's mandate from that one sentence, mints an Ed25519 keypair, and **automatically dispatches the new agent to negotiate with competing counterparties in parallel**.
- The result banner immediately shows the completed negotiations ranked by utility score (`Best Offer`), and you can click **Inspect on Floor** to view the new agent's live thread on `/floor` or **Compare & approve best offer in Inbox**.

**4 · Traversal & Multi-Counterparty Dispatch** — `/traverse`

Pick any agent (including the newly created one) and click **Dispatch to Negotiate All Matches**. Tavily searches and screens candidate companies against the agent's mandate, and the agent negotiates with all of them in parallel so the human only approves the best offer.

**5 · BYOA & 16 Adversarial Probes** — the terminal

```bash
npm run demo                                                # external agent negotiates freight
npm run demo -- http://localhost:3000 obn:lantern-talent    # executive search
npm run demo -- http://localhost:3000 obn:harbour-fc        # sponsorship
```

One file (`examples/byoa-agent.mjs`), zero dependencies, running outside the server. It reads the target's vocabulary off its card and negotiates whatever that agent trades.

Then run the adversarial boundary suite:

```bash
npm run probe
```

**Sixteen probes (`16/16 behaved as specified`):** forged signatures, bodies tampered after signing, unknown senders, every number driven to 1, forbidden clauses, smuggled unauthorized terms, fake self-asserted domain verification, expired envelopes (`400`), replayed nonces (`409`), coupled-constraint traps (`payment_days=40` with `rate=830` clamped to `>=880`), and stonewalling defense (zero movement from counterparty triggers zero concession).
