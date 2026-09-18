#!/usr/bin/env node
/**
 * Adversarial probe of the protocol boundary.
 *
 *   node examples/probe-boundary.mjs [baseUrl] [targetAgentId]
 *
 * An open protocol is only worth something if lying to it fails. This lies to it
 * twelve different ways and prints what happens — forged signatures, tampered
 * bodies, unknown senders, terms far outside the mandate, clauses the agent may
 * never agree to, and terms nobody gave it authority over at all.
 *
 * It reads the target's term vocabulary off its card, so it probes whatever that
 * agent trades rather than assuming an industry.
 *
 * Useful to run in front of anyone who asks "but what stops me from just…".
 */

import { createPrivateKey, generateKeyPairSync, randomUUID, sign as edSign } from "node:crypto";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const TARGET = process.argv[3] ?? "obn:meridian-coldchain";
const PROTOCOL = "obn/0.3";
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** Clause names no well-governed agent should ever sign up to. */
const DANGEROUS = [
  "exclusivity",
  "unlimited-liability",
  "auto-renewal",
  "unlimited-replacements",
  "fee-on-failure",
  "stadium-naming",
];

function mintKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
  return {
    publicKey: spki.subarray(spki.length - 32).toString("base64url"),
    privateKey: pkcs8.subarray(pkcs8.length - 32).toString("base64url"),
  };
}

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

const keys = mintKeys();

const CARD = {
  protocol: PROTOCOL,
  // A fresh identity per run. The node learns a stranger's key on first contact
  // and holds it, so reusing an id under a new key would (correctly) be refused
  // as impersonation — which is a different finding than the ones being probed.
  id: `obn:probe-${randomUUID().slice(0, 8)}`,
  name: "Boundary Probe",
  principal: { kind: "company", name: "Boundary Probe", domain: "probe.example" },
  // Deliberately claims the strongest tier it can. The node must ignore that.
  attestation: { level: "domain", domain: "probe.example" },
  purpose: "Tests what this node refuses.",
  publicKey: keys.publicKey,
  endpoint: "https://probe.example/inbox",
  capabilities: ["negotiate"],
};

// Filled in from the target's card, so the probe is not tied to one industry.
let SUBJECT = "unknown";
let DEAL = { subject: SUBJECT, terms: {} };
let NUMBER_KEYS = [];
let SET_KEY = null;

function plausible(spec) {
  switch (spec.type) {
    case "number":
      return 100;
    case "date":
      return "2027-01-15";
    case "boolean":
      return true;
    case "set":
      return [];
    case "enum":
      return spec.options?.[0] ?? "";
    default:
      return "";
  }
}

const envelope = (over = {}) => ({
  protocol: PROTOCOL,
  id: `msg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  threadId: `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  from: CARD.id,
  to: TARGET,
  type: "propose",
  ts: new Date().toISOString(),
  validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  nonce: `non_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  body: { deal: DEAL, card: CARD },
  ...over,
});

async function post(env) {
  const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(TARGET)}/inbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(env),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

let passed = 0;
let total = 0;

function expect(label, ok, detail, status = "") {
  total += 1;
  if (ok) passed += 1;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${String(status).padEnd(4)} ${label}`);
  if (detail) console.log(`              ${detail}`);
}

const expectStatus = (label, status, wanted, detail) =>
  expect(label, wanted.includes(status), detail, status);

async function main() {
  const cardRes = await fetch(`${BASE}/api/agents/${encodeURIComponent(TARGET)}/card`);
  if (!cardRes.ok) throw new Error(`Could not fetch card for ${TARGET}: HTTP ${cardRes.status}`);
  const theirCard = await cardRes.json();

  const vocab = theirCard.negotiates?.terms ?? [];
  SUBJECT = theirCard.negotiates?.subject ?? "unknown";
  DEAL = { subject: SUBJECT, terms: Object.fromEntries(vocab.map((t) => [t.key, plausible(t)])) };
  NUMBER_KEYS = vocab.filter((t) => t.type === "number").map((t) => t.key);
  SET_KEY = vocab.find((t) => t.type === "set")?.key ?? null;

  console.log(`\n  Probing ${BASE} as an untrusted stranger`);
  console.log(`  Target: ${theirCard.name}, negotiating "${SUBJECT}"\n`);

  // --- identity and integrity ---

  const r1 = await post(sign(envelope(), keys.privateKey));
  expectStatus("a correctly signed stranger is admitted", r1.status, [200], `thread ${r1.json.threadId}`);

  const forged = sign(envelope(), keys.privateKey);
  forged.sig = Buffer.from("x".repeat(64)).toString("base64url");
  const r2 = await post(forged);
  expectStatus("forged signature", r2.status, [401], r2.json.error);

  const tampered = sign(envelope(), keys.privateKey);
  tampered.body.deal = {
    ...DEAL,
    terms: { ...DEAL.terms, ...(NUMBER_KEYS[0] ? { [NUMBER_KEYS[0]]: 1 } : {}) },
  };
  const r3 = await post(tampered);
  expectStatus("a term changed after signing", r3.status, [401], r3.json.error);

  const impostor = mintKeys();
  const r4 = await post(sign(envelope(), impostor.privateKey));
  expectStatus("signed with a key the card does not match", r4.status, [401], r4.json.error);

  const r5 = await post(sign(envelope({ from: "obn:ghost", body: { deal: DEAL } }), keys.privateKey));
  expectStatus("unknown sender presenting no card", r5.status, [404], r5.json.error);

  // A card whose id disagrees with the sender is never adopted, so this lands as
  // an unknown sender rather than confirming anything about the card.
  const r6 = await post(sign(envelope({ from: "obn:someone-else" }), keys.privateKey));
  expectStatus("card id disagrees with the sender", r6.status, [400, 404], r6.json.error);

  const r7 = await post(sign(envelope({ protocol: "obn/9.9" }), keys.privateKey));
  expectStatus("unsupported protocol version", r7.status, [400], r7.json.error);

  const r8 = await post(sign(envelope({ to: "obn:definitely-not-this-agent" }), keys.privateKey));
  expectStatus("envelope addressed to a different agent", r8.status, [400, 404], r8.json.error);

  // --- mandate enforcement ---

  // Every number driven to 1: whatever the mandate protects, this crosses it.
  const lowball = {
    subject: SUBJECT,
    terms: { ...DEAL.terms, ...Object.fromEntries(NUMBER_KEYS.map((k) => [k, 1])) },
  };
  const r9 = await post(sign(envelope({ body: { deal: lowball, card: CARD } }), keys.privateKey));
  const counter9 = r9.json.reply?.body?.deal;
  const corrected = NUMBER_KEYS.filter((k) => counter9?.terms?.[k] !== 1);
  expect(
    "terms far outside the mandate are never accepted",
    r9.json.status !== "accepted" && corrected.length === NUMBER_KEYS.length,
    `sent every number as 1 → replied "${r9.json.reply?.type}" with ${corrected.length}/${NUMBER_KEYS.length} corrected` +
      (NUMBER_KEYS[0] ? ` (${NUMBER_KEYS[0]} came back as ${counter9?.terms?.[NUMBER_KEYS[0]]})` : ""),
    r9.status,
  );

  if (SET_KEY) {
    const dirty = { subject: SUBJECT, terms: { ...DEAL.terms, [SET_KEY]: DANGEROUS } };
    const r10 = await post(sign(envelope({ body: { deal: dirty, card: CARD } }), keys.privateKey));
    const got = r10.json.reply?.body?.deal?.terms?.[SET_KEY];
    const survivors = Array.isArray(got) ? got.filter((c) => DANGEROUS.includes(c)) : ["<no reply>"];
    expect(
      "clauses outside the agent's authority never survive into a reply",
      Array.isArray(got) && survivors.length === 0,
      `asked for [${DANGEROUS.join(", ")}] → agreed to [${Array.isArray(got) ? got.join(", ") : "?"}]`,
      r10.status,
    );
  }

  // A term nobody mandated. The agent has no authority over it, so it must not
  // come back agreed — whatever it is, and however plausible it looks.
  const smuggled = {
    subject: SUBJECT,
    terms: { ...DEAL.terms, side_letter_payment: 250_000, governing_law: "nowhere" },
  };
  const r11 = await post(sign(envelope({ body: { deal: smuggled, card: CARD } }), keys.privateKey));
  const back = r11.json.reply?.body?.deal?.terms ?? {};
  expect(
    "terms the mandate says nothing about are dropped, not agreed",
    !("side_letter_payment" in back) && !("governing_law" in back),
    `smuggled in side_letter_payment and governing_law → reply carries ${Object.keys(back).length} terms, neither of them`,
    r11.status,
  );

  // A card is self-published. This one claims domain verification it has not
  // earned; if the node believed it, anyone could dress as a verified party.
  const seen = await fetch(`${BASE}/api/agents/${encodeURIComponent(CARD.id)}/card`);
  const asSeen = seen.ok ? await seen.json() : null;
  expect(
    "a self-asserted attestation is not believed",
    Boolean(asSeen) && asSeen.attestation?.level !== "domain",
    `claimed "${CARD.attestation.level}" → node records "${asSeen?.attestation?.level ?? "unknown"}"`,
    seen.status,
  );

  // --- protocol hardening: replay protection and expiration ---

  const expiredEnv = sign(
    envelope({
      validUntil: new Date(Date.now() - 3_600_000).toISOString(), // 1 hour in the past
    }),
    keys.privateKey,
  );
  const r13 = await post(expiredEnv);
  expectStatus("an expired envelope is refused", r13.status, [400], r13.json.error);

  const freshEnv = sign(envelope(), keys.privateKey);
  const firstPost = await post(freshEnv);
  const replayedPost = await post(freshEnv);
  expectStatus(
    "a replayed envelope with duplicate nonce is refused",
    replayedPost.status,
    [409],
    replayedPost.json.error,
  );

  // --- coupled constraint enforcement ---
  if (TARGET === "obn:meridian-coldchain") {
    const coupledAsk = {
      subject: SUBJECT,
      terms: { ...DEAL.terms, payment_days: 40, rate: 830 },
    };
    const r15 = await post(sign(envelope({ body: { deal: coupledAsk, card: CARD } }), keys.privateKey));
    const replyRate = r15.json.reply?.body?.deal?.terms?.rate;
    expect(
      "coupled constraints enforce dependent term thresholds",
      typeof replyRate === "number" && replyRate >= 880,
      `asked payment_days=40, rate=830 → reply rate clamped to ${replyRate} (minimum 880)`,
      r15.status,
    );
  }

  // --- reciprocal game theory: stonewall defense ---
  const stoneThreadId = `thr_stone_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const stoneEnv1 = sign(
    envelope({
      threadId: stoneThreadId,
      body: { deal: DEAL, card: CARD },
    }),
    keys.privateKey,
  );
  const stoneRes1 = await post(stoneEnv1);
  const firstReplyRate = stoneRes1.json.reply?.body?.deal?.terms?.rate;

  // Counterparty stonewalls: repeats exact same terms with zero concession
  const stoneEnv2 = sign(
    envelope({
      threadId: stoneThreadId,
      body: { deal: DEAL },
    }),
    keys.privateKey,
  );
  const stoneRes2 = await post(stoneEnv2);
  const secondReplyRate = stoneRes2.json.reply?.body?.deal?.terms?.rate;

  expect(
    "stonewalling counterparty triggers zero concession defense",
    firstReplyRate !== undefined && secondReplyRate === firstReplyRate,
    `counterparty stonewalled with zero movement → host held rate firmly at ${secondReplyRate}`,
    stoneRes2.status,
  );

  console.log(`\n  ${passed}/${total} probes behaved as specified.\n`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  ✗ ${err.message}\n    Is the node running? Try: npm run dev\n`);
  process.exit(1);
});
