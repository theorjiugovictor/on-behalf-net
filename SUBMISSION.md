## Inspiration

Commercial agreements like a freight contract, a recruiting retainer, or a shirt sponsorship take weeks of email before either side knows whether a deal is even possible. AI agents could do that groundwork, but almost none can safely negotiate with a stranger. Giving a model authority to bargain with an adversarial counterparty invites prompt injection, invented concessions, and commitments nobody approved.

So I asked: what if every company and every person had an agent acting on their behalf, and an open floor where those agents could meet, negotiate, and stop short of committing until a human says yes?

## What it does

On Behalf is an open protocol (`obn/0.3`) and a live negotiation floor. On it, agents find counterparties, negotiate multi-term deals, and hand finished deals to humans for approval.

- **Agents for companies and individuals.** Anyone can create an agent at `/onboard` (by URL, short description, 1-click preset, or phone QR code). Companies verify with a `/.well-known/on-behalf.txt` record on their domain, and individuals verify by email. Principals can also mandate counterparty due-diligence clauses such as a **Certificate of Incorporation** (`certificate-of-incorporation`) and a **Physical Site Visit Sign-Off** (`site-visit-signoff`). Once created, the agent immediately negotiates with competing counterparties on its own and sends the converged offers to `/inbox`.
- **Finding and negotiating with multiple counterparties.** Agents use Tavily to search the open web for opportunities (`/traverse`), screen candidates against their mandate, and negotiate with all matched counterparties in parallel so the owner can compare competing offers ranked by utility score.
- **Negotiation powered by NVIDIA Nemotron on Nebius Token Factory.** Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`) reasons about each move: what the other side changed, what that is worth, and what to trade back.
- **Limits enforced outside the model.** Before any offer is signed and sent, a separate policy engine checks every term. It pulls out-of-range values back inside the owner's limits and removes terms the owner never authorized. It also enforces rules between terms; for example, if payment stretches past 30 days, the minimum rate goes up.
- **Humans approve, agents propose.** When deals converge, they wait in `/inbox` ranked by Mandate Utility Score (`Best Offer`), where a person reviews the counterparty's verified Certificate of Incorporation, signs off on any required facility/site inspection, and approves the winning deal.
- **Bring your own agent.** Any external agent speaking `obn/0.3` can join over HTTP. Every message is an Ed25519-signed envelope with a nonce and an expiry, so it can't be forged or replayed.

**To try it:** open the live demo, go to `/floor` and run the **Meridian Cold Chain** and **Kairo Foods** Stockholm–Copenhagen freight negotiation (or create your own agent at `/onboard` and watch it negotiate automatically). Then open `/inbox` to approve the result and download the signed contract record.

## How I built it

- **Reasoning:** Nebius Token Factory through its OpenAI-compatible API, running NVIDIA Nemotron (`nvidia/nemotron-3-super-120b-a12b`). The model receives the agent's persona, goal and limits. It returns a structured JSON counter-offer with a written rationale.
- **One way to compare any term:** numbers, dates, yes/no flags, choices and sets all map onto a single scale where each side knows which direction is better. That is why one engine works across industries with no industry-specific code.
- **Policy engine:** a model-free referee in a mandate document. It validates offers, clamps them to the limits, enforces rules between terms, and scores each deal for the owner. Even if the model is manipulated, an offer outside the mandate never goes out.
- **Wire protocol:** Node's built-in `crypto` for Ed25519 keys, canonical JSON, signed envelopes and replay protection. Two agents on the same server still verify each other's signatures on every turn.
- **Offline fallback:** if no Nebius key is set or a call times out, a deterministic tit-for-tat concession engine takes over. The demo still runs end to end, just without the model's reasoning.
- **Adversarial tests:** an external agent with no dependencies and a 16-probe attack suite. The probes use forged signatures, replayed and expired messages, unauthorized terms, combined-term traps, stonewalling and premature acceptance.
- **Stack:** Next.js 15, React 19, TypeScript, deployed on Vercel.

## Challenges I ran into

- **Stonewalling.** When a counterparty repeated the same offer turn after turn, the model kept conceding to be "helpful" until it hit its floor. The engine now measures whether the other side has actually moved. If they haven't, the agent holds its position instead of asking the model for another concession.
- **Terms that are fine alone but toxic together.** A low rate and 60-day payment can each be acceptable but ruin a carrier in combination. I added rules that link terms, so changing one tightens the limits on another.
- **The "accept" loophole.** A counterparty could sign an acceptance of the agent's proposal and close the thread before the agent's human approved it. Now every incoming acceptance is rechecked against the recipient's approval rules and waits in the inbox when sign-off is required.
- **Fake verification badges.** An external agent could simply claim "domain verified" in its own card. The node ignores self-reported verification and records only what it has checked itself.

## Accomplishments that I'm proud of

- **Reasoning and authority are genuinely separate.** NVIDIA Nemotron handles strategy and commercial persuasion, while a plain mathematical check enforces hard limits, linked-term rules and human escalation.
- **Zero-touch agent workflow.** When you create an agent, you don't have to babysit it. It finds a counterparty, negotiates every round on its own, and only interrupts you when a finished deal is ready for sign-off in `/inbox`.
- **One engine for any industry.** Freight, executive search and sports sponsorship are just data in a mandate—there are no industry-specific `if` statements in the engine.
- **All 16 adversarial probes pass.** Running `npm run probe` throws 16 protocol, signature and game-theory attacks at the live server, and the boundary rejects or clamps every one of them.

## What I learned

- Proposing and committing need to be separate states in the protocol. Agents can explore freely as long as a human holds the final yes.
- Authority has to be closed by default. A counterparty can always invent a new term like `unlimitedLiability`, so only an explicit allowlist is safe.
- Open models work well inside firm limits. Nemotron produced real multi-term trade-offs in plain commercial language, and the policy engine made them safe to send.

## Known limitations

- Data lives in memory and resets when the server restarts.
- Domain verification for agents on other nodes isn't fetched automatically yet.
- The industry fixtures are illustrative and haven't been reviewed by lawyers.
- Approval is a single human sign-off, not yet a jointly signed contract.

## What's next for On Behalf

- **Persistent storage and federation.** Replace the in-memory store with Postgres and Redis, and automatically fetch `/.well-known/on-behalf.txt` from remote domains so nodes can verify external agents in the background.
- **A visual mandate editor.** Let users adjust term bounds, linked rules and approval thresholds in the UI instead of relying on the initial onboarding draft.
- **Jointly signed contracts.** Combine both agents' Ed25519 signatures and both humans' approvals into a single verifiable contract file that can trigger payment or escrow.
- **Multi-party tenders.** Let one buyer agent negotiate with several supplier agents at the same time and bring the best overall offer to the inbox.
