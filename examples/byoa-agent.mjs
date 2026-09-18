#!/usr/bin/env node
/**
 * A complete third-party On Behalf agent.
 *
 *   node examples/byoa-agent.mjs [baseUrl] [targetAgentId]
 *
 * Zero dependencies and nothing imported from the app — that is the point. This
 * file is the whole integration surface: mint a keypair, publish a card, sign
 * canonical JSON, POST to the counterparty's inbox, read the signed reply.
 *
 * It opens with `hello` and lets the counterparty state its position first, then
 * reads the term vocabulary off their card and negotiates whatever they trade.
 * The same code below closes a freight contract, a recruiting engagement and a
 * sponsorship without knowing anything about any of them — only the mandate
 * changes, and a mandate is data its owner writes.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const TARGET = process.argv[3] ?? "obn:meridian-coldchain";
const PROTOCOL = "obn/0.2";

// --- crypto ---------------------------------------------------------------

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * Derive this agent's keypair from a fixed seed, so the same agent id always
 * carries the same key. That is not a shortcut — it is the behaviour the
 * network requires: a node learns your key on first contact and checks every
 * later message against it, so an agent that mints a fresh key each run looks
 * like an impostor the second time it speaks. A real deployment would read this
 * from a secret store; the point is only that the identity is stable.
 */
function keysFromSeed(seed) {
  const raw = createHash("sha256").update(seed).digest();
  const priv = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, raw]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(priv).export({ type: "spki", format: "der" });
  return {
    publicKey: spki.subarray(spki.length - 32).toString("base64url"),
    privateKey: raw.toString("base64url"),
  };
}

/** Must match the node byte for byte: keys sorted recursively, no whitespace. */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
    .join(",")}}`;
}

function sign(unsigned, privateKeyRaw) {
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(privateKeyRaw, "base64url")]),
    format: "der",
    type: "pkcs8",
  });
  return {
    ...unsigned,
    sig: edSign(null, Buffer.from(canonicalize(unsigned), "utf8"), key).toString("base64url"),
  };
}

function verify(envelope, publicKeyRaw) {
  try {
    const { sig, ...rest } = envelope;
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyRaw, "base64url")]),
      format: "der",
      type: "spki",
    });
    return edVerify(null, Buffer.from(canonicalize(rest), "utf8"), key, Buffer.from(sig, "base64url"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Our mandates
//
// One per subject we are prepared to trade. `want` is the direction that
// favours us; `limit` is the edge of our authority — the value we concede
// toward and never cross. This is the part a company writes for itself: no
// agent can infer what it is allowed to agree to.
// ---------------------------------------------------------------------------

const IDENTITY = {
  "reefer-lane-lagos-accra": {
    id: "obn:northwind-produce",
    name: "Northwind Produce",
    domain: "northwind-produce.example",
    role: "shipper",
    purpose:
      "We export chilled produce out of Lagos and buy refrigerated lane capacity " +
      "on fixed-term contracts. We care about claims history more than headline rate.",
    terms: {
      rate: { want: "lower", limit: 940, weight: 0.9 },
      volume: { want: "lower", limit: 260, weight: 0.4 },
      term_months: { want: "lower", limit: 12, weight: 0.3 },
      payment_days: { want: "higher", limit: 20, weight: 0.4 },
      incoterm: { want: "match", prefer: ["DAP", "CIF"], weight: 0.2 },
      clauses: { want: "match", forbidden: ["exclusivity", "unlimited-liability"], weight: 0.5 },
    },
  },
  "senior-robotics-engineer-search": {
    id: "obn:northwind-produce",
    name: "Northwind Produce",
    domain: "northwind-produce.example",
    role: "employer",
    purpose:
      "We are hiring controls engineers for our cold chain automation programme and " +
      "will pay for a good shortlist rather than run an open search.",
    terms: {
      placement_fee: { want: "lower", limit: 25_000, weight: 0.9 },
      roles: { want: "lower", limit: 3, weight: 0.4 },
      guarantee_days: { want: "higher", limit: 60, weight: 0.6 },
      exclusivity_weeks: { want: "lower", limit: 6, weight: 0.5 },
      start_date: { want: "lower", limit: "2027-02-01", weight: 0.2 },
      clauses: { want: "match", forbidden: ["unlimited-replacements"], weight: 0.5 },
    },
  },
  "harbour-fc-2027-shirt-sponsorship": {
    id: "obn:northwind-produce",
    name: "Northwind Produce",
    domain: "northwind-produce.example",
    role: "sponsor",
    purpose:
      "We are taking our chilled juice brand into club partnerships and need visible " +
      "matchday inventory to justify the spend.",
    terms: {
      fee: { want: "lower", limit: 320_000, weight: 0.9 },
      term_seasons: { want: "lower", limit: 3, weight: 0.5 },
      impressions_guaranteed: { want: "higher", limit: 30, weight: 0.6 },
      category_exclusivity: { want: "higher", limit: false, weight: 0.7 },
      activation_rights: { want: "match", forbidden: ["stadium-naming"], weight: 0.4 },
      launch_date: { want: "match", weight: 0.2 },
    },
  },
};

// ---------------------------------------------------------------------------
// Strategy — term-type agnostic, exactly like the node's
// ---------------------------------------------------------------------------

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ord = (v) =>
  typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : isDate(v) ? Date.parse(v) : null;
const unord = (n, like) =>
  typeof like === "number" ? Math.round(n * 100) / 100
  : typeof like === "boolean" ? n >= 0.5
  : new Date(n).toISOString().slice(0, 10);

function withinLimit(value, rule) {
  if (rule.want === "match") {
    if (Array.isArray(value) && rule.forbidden) return !value.some((x) => rule.forbidden.includes(x));
    if (rule.prefer && typeof value === "string") return rule.prefer.includes(value);
    return true;
  }
  const v = ord(value);
  const lim = ord(rule.limit);
  if (v === null || lim === null) return true;
  return rule.want === "lower" ? v <= lim : v >= lim;
}

/** Move one term from where we are toward where they are, never past our limit. */
function concede(mine, theirs, rule, rate) {
  if (theirs === undefined) return mine;

  if (rule.want === "match") {
    if (Array.isArray(theirs)) {
      const kept = theirs.filter((x) => !(rule.forbidden ?? []).includes(x));
      return [...new Set([...(Array.isArray(mine) ? mine : []), ...kept])];
    }
    if (rule.prefer && typeof theirs === "string" && rule.prefer.includes(theirs)) return theirs;
    return mine ?? theirs;
  }

  const base = ord(mine);
  const target = ord(theirs);
  const lim = ord(rule.limit);
  if (base === null || target === null) return mine ?? theirs;

  // Never walk back a concession because they moved against their own interest.
  const alreadyBetter = rule.want === "lower" ? target < base : target > base;
  let next = alreadyBetter ? base : base + (target - base) * rate;
  if (lim !== null) next = rule.want === "lower" ? Math.min(next, lim) : Math.max(next, lim);

  return unord(next, typeof mine === "boolean" || typeof theirs === "boolean" ? true : (mine ?? theirs));
}

/** Our opening position: our limit, pushed out by a margin we hope to keep. */
function openingFrom(theirDeal, mandate) {
  const terms = {};
  for (const [key, rule] of Object.entries(mandate.terms)) {
    const theirs = theirDeal.terms[key];
    if (theirs === undefined) continue;

    if (rule.want === "match") {
      terms[key] = Array.isArray(theirs)
        ? theirs.filter((x) => !(rule.forbidden ?? []).includes(x))
        : theirs;
      continue;
    }

    const lim = ord(rule.limit);
    if (lim === null) {
      terms[key] = theirs;
      continue;
    }

    // Open 25% of the way past our limit, away from it — our aspiration.
    const stretch = typeof rule.limit === "number" ? Math.abs(lim) * 0.25 : 45 * 86_400_000;
    const aim = rule.want === "lower" ? lim - stretch : lim + stretch;
    const opening = unord(
      typeof rule.limit === "boolean" ? (rule.want === "higher" ? 1 : 0) : aim,
      rule.limit,
    );

    // Never ask for less than they have already offered. On a secondary term
    // their opening is often better for us than anything we would have thought
    // to ask for, and haggling backwards from it would be absurd.
    const theirOrd = ord(theirs);
    const openOrd = ord(opening);
    const theirsIsBetter =
      theirOrd !== null && openOrd !== null
        ? rule.want === "lower"
          ? theirOrd < openOrd
          : theirOrd > openOrd
        : false;

    terms[key] = theirsIsBetter ? theirs : opening;
  }
  return { subject: theirDeal.subject, terms };
}

/** Weighted mean of how good each term is for us, 0–1, for deciding when to stop. */
function utility(deal, mandate, reference) {
  let total = 0;
  let weight = 0;
  for (const [key, rule] of Object.entries(mandate.terms)) {
    const v = deal.terms[key];
    if (v === undefined || rule.want === "match") continue;
    const cur = ord(v);
    const lim = ord(rule.limit);
    const ref = ord(reference?.terms?.[key]);
    if (cur === null || lim === null || ref === null || ref === lim) continue;
    const t = (cur - lim) / (ref - lim);
    total += Math.max(0, Math.min(1, t)) * rule.weight;
    weight += rule.weight;
  }
  return weight === 0 ? 0.5 : total / weight;
}

// --- transport ------------------------------------------------------------

async function fetchCard(agentId) {
  const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(agentId)}/card`);
  if (!res.ok) throw new Error(`Could not fetch card for ${agentId}: HTTP ${res.status}`);
  return res.json();
}

async function send(envelope) {
  const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(TARGET)}/inbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// --- presentation ---------------------------------------------------------

function fmt(deal, vocab) {
  return Object.entries(deal.terms)
    .map(([k, v]) => {
      const spec = vocab[k];
      const shown = Array.isArray(v)
        ? v.length
          ? v.join("/")
          : "none"
        : typeof v === "boolean"
          ? v ? "yes" : "no"
          : typeof v === "number"
            ? v.toLocaleString()
            : v;
      return `${spec?.label ?? k} ${shown}${spec?.unit ? ` ${spec.unit}` : ""}`;
    })
    .join(", ");
}

// --- run ------------------------------------------------------------------

async function main() {
  const theirCard = await fetchCard(TARGET);
  const subject = theirCard.negotiates?.subject;
  const mandate = subject ? IDENTITY[subject] : undefined;

  if (!mandate) {
    console.error(
      `\n  ${theirCard.name} negotiates "${subject ?? "nothing it advertises"}".\n` +
        `  We hold no mandate for that, so we will not open a thread.\n` +
        `  Mandates we hold: ${Object.keys(IDENTITY).join(", ")}\n`,
    );
    process.exit(1);
  }

  const keys = keysFromSeed(`on-behalf-example:${mandate.id}`);
  const card = {
    protocol: PROTOCOL,
    id: mandate.id,
    name: mandate.name,
    principal: { kind: "company", name: mandate.name, domain: mandate.domain },
    // A card is self-published, so whatever we claim here is only a claim. The
    // node discards it and treats us as unverified until it establishes
    // otherwise itself — which is why counterparties may still stop for a human.
    attestation: { level: "none" },
    purpose: mandate.purpose,
    publicKey: keys.publicKey,
    endpoint: `https://${mandate.domain}/agent/inbox`,
    capabilities: ["negotiate"],
    negotiates: {
      subject,
      role: mandate.role,
      terms: (theirCard.negotiates?.terms ?? []).filter((t) => mandate.terms[t.key]),
    },
  };

  const vocab = Object.fromEntries((theirCard.negotiates?.terms ?? []).map((t) => [t.key, t]));

  console.log(`\n  ${mandate.name} — an agent that does not live on ${BASE}\n`);
  console.log(`  Counterparty : ${theirCard.name} (${theirCard.id})`);
  console.log(`  Negotiating  : ${subject}, as the ${mandate.role}`);
  console.log(`  Their key    : ${theirCard.publicKey.slice(0, 24)}…`);
  console.log(`  Our key      : ${card.publicKey.slice(0, 24)}…\n`);

  const threadId = `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const envelope = (type, body) =>
    sign(
      {
        protocol: PROTOCOL,
        id: `msg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        threadId,
        from: card.id,
        to: TARGET,
        type,
        ts: new Date().toISOString(),
        body,
      },
      keys.privateKey,
    );

  // Open with a greeting and let them state their position first. We learn what
  // is on the table before committing to a number.
  console.log(`  → us   (hello)  introducing ourselves, asking them to open`);
  let result = await send(envelope("hello", { card, rationale: "We are interested. Where do you open?" }));

  let mine = null;
  let reference = null;

  for (let round = 0; round < 10; round++) {
    const reply = result.reply;
    if (!reply) {
      console.log(`\n  Thread is ${result.status}. No reply expected.\n`);
      break;
    }

    if (!verify(reply, theirCard.publicKey)) {
      console.error("\n  ✗ Their signature did not verify. Refusing to continue.\n");
      process.exit(1);
    }

    const theirDeal = reply.body.deal;
    console.log(
      `  ← them (${reply.type}) ${theirDeal ? fmt(theirDeal, vocab) : reply.body.reason ?? ""} ✓ signature verified`,
    );
    if (reply.body.rationale) console.log(`         "${reply.body.rationale}"`);

    if (reply.type === "accept") {
      console.log(`\n  ✓ Deal agreed.\n`);
      break;
    }
    if (reply.type === "escalate") {
      console.log(`\n  ⏸ They agree but cannot close: ${reply.body.reason}`);
      console.log(`     Parked for a human at ${theirCard.name}. See ${BASE}/inbox\n`);
      break;
    }
    if (reply.type === "reject") {
      console.log(`\n  ✗ Rejected: ${reply.body.reason}\n`);
      break;
    }
    if (!theirDeal) break;

    // Their opening is our yardstick for judging every later move.
    if (!reference) reference = theirDeal;
    if (!mine) mine = openingFrom(theirDeal, mandate);

    const everyTermAcceptable = Object.entries(mandate.terms).every(([key, rule]) => {
      const v = theirDeal.terms[key];
      return v === undefined || withinLimit(v, rule);
    });

    const rate = Math.min(0.6, 0.35 + round * 0.06);
    const next = { subject: theirDeal.subject, terms: {} };
    for (const [key, rule] of Object.entries(mandate.terms)) {
      if (theirDeal.terms[key] === undefined) continue;
      next.terms[key] = concede(mine.terms[key], theirDeal.terms[key], rule, rate);
    }

    // Close when another round would not gain us anything worth having.
    const theirUtility = utility(theirDeal, mandate, reference);
    const nextUtility = utility(next, mandate, reference);
    if (everyTermAcceptable && nextUtility - theirUtility <= 0.03) {
      console.log(`  → us   (accept) ${fmt(theirDeal, vocab)}`);
      const outcome = await send(
        envelope("accept", { deal: theirDeal, rationale: "Agreed. That works on our side." }),
      );

      // Our acceptance does not automatically bind them: their mandate is
      // re-checked on their side, and a large deal parks for a human there.
      if (outcome.status === "awaiting-approval") {
        console.log(`\n  ⏸ We accepted, but it is not binding yet.`);
        console.log(`     ${outcome.pendingApproval?.reason ?? "Their mandate requires human sign-off."}`);
        console.log(`     Parked for a human at ${theirCard.name}. See ${BASE}/inbox\n`);
      } else if (outcome.status === "rejected") {
        console.log(`\n  ✗ They could not honour those terms after all.\n`);
      } else {
        console.log(`\n  ✓ Deal agreed.\n`);
      }
      break;
    }

    mine = next;
    console.log(`  → us   (counter) ${fmt(mine, vocab)}`);
    result = await send(
      envelope("counter", {
        deal: mine,
        rationale: `That is more than we can carry. Here is where we can get to.`,
      }),
    );
  }

  console.log(`  Full transcript: ${BASE}/floor\n`);
}

main().catch((err) => {
  console.error(`\n  ✗ ${err.message}`);
  console.error(`    Is the node running? Try: npm run dev\n`);
  process.exit(1);
});
