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
 * It runs its own mandate, which the node it is negotiating against never sees
 * and could not enforce. Each side polices itself; each side verifies the other.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const TARGET = process.argv[3] ?? "obn:meridian-coldchain";
const PROTOCOL = "obn/0.1";

// --- crypto ---------------------------------------------------------------

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function mintKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
  return {
    publicKey: spki.subarray(spki.length - 32).toString("base64url"),
    privateKey: pkcs8.subarray(pkcs8.length - 32).toString("base64url"),
  };
}

/** Must match the node byte for byte: keys sorted recursively, no whitespace. */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

function signEnvelope(unsigned, privateKeyRaw) {
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(privateKeyRaw, "base64url")]),
    format: "der",
    type: "pkcs8",
  });
  const sig = edSign(null, Buffer.from(canonicalize(unsigned), "utf8"), key);
  return { ...unsigned, sig: sig.toString("base64url") };
}

function verifyEnvelope(envelope, publicKeyRaw) {
  try {
    const { sig, ...rest } = envelope;
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyRaw, "base64url")]),
      format: "der",
      type: "spki",
    });
    return edVerify(
      null,
      Buffer.from(canonicalize(rest), "utf8"),
      key,
      Buffer.from(sig, "base64url"),
    );
  } catch {
    return false;
  }
}

// --- this agent -----------------------------------------------------------

const keys = mintKeys();

const CARD = {
  protocol: PROTOCOL,
  id: "obn:northwind-produce",
  name: "Northwind Produce",
  domain: "northwind-produce.example",
  purpose:
    "We export chilled produce out of Lagos and buy refrigerated lane capacity on " +
    "fixed-term contracts. We care about claims history more than headline rate.",
  publicKey: keys.publicKey,
  endpoint: "https://northwind-produce.example/agent/inbox",
  capabilities: ["buy", "negotiate"],
};

/** Our own mandate. The other node cannot see or enforce this — we do. */
const MANDATE = {
  role: "buyer",
  sku: "reefer-lane-lagos-accra",
  currency: "USD",
  ceilingUnitPrice: 940,
  minVolume: 60,
  maxVolume: 260,
  maxTermMonths: 12,
  maxTotalValue: 220_000,
  allowedIncoterms: ["DAP", "CIF"],
  maxPaymentTermsDays: 60,
};

const withinMandate = (offer) =>
  offer.sku === MANDATE.sku &&
  offer.currency === MANDATE.currency &&
  offer.unitPrice <= MANDATE.ceilingUnitPrice &&
  offer.volume >= MANDATE.minVolume &&
  offer.volume <= MANDATE.maxVolume &&
  offer.termMonths <= MANDATE.maxTermMonths &&
  offer.unitPrice * offer.volume <= MANDATE.maxTotalValue &&
  MANDATE.allowedIncoterms.includes(offer.incoterm);

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

// --- strategy -------------------------------------------------------------

const round2 = (n) => Math.round(n * 100) / 100;

function openingOffer() {
  return {
    sku: MANDATE.sku,
    currency: MANDATE.currency,
    unitPrice: round2(MANDATE.ceilingUnitPrice * 0.78),
    volume: 120,
    termMonths: 6,
    incoterm: "DAP",
    paymentTermsDays: 45,
    clauses: [],
  };
}

function concede(mine, theirs, round) {
  const rate = Math.min(0.6, 0.35 + round * 0.06);
  const unitPrice = Math.min(
    MANDATE.ceilingUnitPrice,
    theirs.unitPrice > mine.unitPrice
      ? mine.unitPrice + (theirs.unitPrice - mine.unitPrice) * rate
      : mine.unitPrice,
  );
  return {
    ...mine,
    unitPrice: round2(unitPrice),
    volume: Math.round(
      Math.min(Math.max(mine.volume + (theirs.volume - mine.volume) * rate, MANDATE.minVolume), MANDATE.maxVolume),
    ),
    termMonths: Math.min(
      Math.round(mine.termMonths + (theirs.termMonths - mine.termMonths) * rate),
      MANDATE.maxTermMonths,
    ),
    incoterm: MANDATE.allowedIncoterms.includes(theirs.incoterm) ? theirs.incoterm : mine.incoterm,
    paymentTermsDays: Math.min(theirs.paymentTermsDays, MANDATE.maxPaymentTermsDays),
  };
}

// --- run ------------------------------------------------------------------

const fmt = (o) =>
  `${o.currency} ${o.unitPrice}/unit × ${o.volume} units, ${o.termMonths}mo, ${o.incoterm}, ` +
  `net ${o.paymentTermsDays} (total ${o.currency} ${(o.unitPrice * o.volume).toLocaleString()})`;

async function main() {
  console.log(`\n  Northwind Produce — an agent that does not live on ${BASE}\n`);

  const theirCard = await fetchCard(TARGET);
  console.log(`  Counterparty : ${theirCard.name} (${theirCard.id})`);
  console.log(`  Their key    : ${theirCard.publicKey.slice(0, 24)}…`);
  console.log(`  Our key      : ${CARD.publicKey.slice(0, 24)}…\n`);

  const threadId = `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  let mine = openingOffer();
  let round = 0;
  let first = true;

  while (round < 10) {
    const envelope = signEnvelope(
      {
        protocol: PROTOCOL,
        id: `msg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        threadId,
        from: CARD.id,
        to: TARGET,
        type: first ? "propose" : "counter",
        ts: new Date().toISOString(),
        body: {
          offer: mine,
          rationale: first
            ? "We have recurring weekly volume on this lane and can commit to a fixed term."
            : `We can move to ${mine.currency} ${mine.unitPrice} against ${mine.volume} units.`,
          // The card rides on the opening message so the node learns our key.
          ...(first ? { card: CARD } : {}),
        },
      },
      keys.privateKey,
    );

    console.log(`  → us   (${envelope.type}) ${fmt(mine)}`);
    const result = await send(envelope);
    first = false;
    round += 1;

    const reply = result.reply;
    if (!reply) {
      console.log(`\n  Thread is ${result.status}. No reply expected.\n`);
      break;
    }

    if (!verifyEnvelope(reply, theirCard.publicKey)) {
      console.error("\n  ✗ Their signature did not verify. Refusing to continue.\n");
      process.exit(1);
    }

    const theirOffer = reply.body.offer;
    console.log(
      `  ← them (${reply.type}) ${theirOffer ? fmt(theirOffer) : reply.body.reason ?? ""} ✓ signature verified`,
    );
    if (reply.body.rationale) console.log(`         "${reply.body.rationale}"`);

    if (reply.type === "accept") {
      console.log(`\n  ✓ Deal agreed at ${fmt(theirOffer)}\n`);
      break;
    }
    if (reply.type === "escalate") {
      console.log(
        `\n  ⏸ They agree but cannot close: ${reply.body.reason}\n` +
          `     Parked for a human at ${theirCard.name}. See ${BASE}/inbox\n`,
      );
      break;
    }
    if (reply.type === "reject") {
      console.log(`\n  ✗ Rejected: ${reply.body.reason}\n`);
      break;
    }

    if (!theirOffer) break;

    // Their terms are inside our mandate and close to ours: take the deal.
    if (withinMandate(theirOffer) && Math.abs(theirOffer.unitPrice - mine.unitPrice) / mine.unitPrice <= 0.05) {
      const accept = signEnvelope(
        {
          protocol: PROTOCOL,
          id: `msg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
          threadId,
          from: CARD.id,
          to: TARGET,
          type: "accept",
          ts: new Date().toISOString(),
          body: { offer: theirOffer, rationale: "Agreed. That works on our side." },
        },
        keys.privateKey,
      );
      console.log(`  → us   (accept) ${fmt(theirOffer)}`);
      const outcome = await send(accept);

      // Our acceptance does not automatically bind them: their mandate is
      // re-checked on their side, and a large deal parks for a human there.
      if (outcome.status === "awaiting-approval") {
        console.log(
          `\n  ⏸ We accepted, but it is not binding yet.\n` +
            `     ${outcome.pendingApproval?.reason ?? "Their mandate requires human sign-off."}\n` +
            `     Parked for a human at ${theirCard.name}. See ${BASE}/inbox\n`,
        );
      } else if (outcome.status === "rejected") {
        console.log(`\n  ✗ They could not honour those terms after all.\n`);
      } else {
        console.log(`\n  ✓ Deal agreed at ${fmt(theirOffer)}\n`);
      }
      break;
    }

    mine = concede(mine, theirOffer, round);
  }

  console.log(`  Full transcript: ${BASE}/floor\n`);
}

main().catch((err) => {
  console.error(`\n  ✗ ${err.message}`);
  console.error(`    Is the node running? Try: npm run dev\n`);
  process.exit(1);
});
