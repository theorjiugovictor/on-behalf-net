#!/usr/bin/env node
/**
 * Adversarial probe of the protocol boundary.
 *
 *   node examples/probe-boundary.mjs [baseUrl] [targetAgentId]
 *
 * An open protocol is only worth something if lying to it fails. This lies to
 * it ten different ways and prints what happens — forged signatures, tampered
 * bodies, unknown senders, offers outside the mandate, clauses the agent may
 * never agree to.
 *
 * Useful to run in front of anyone who asks "but what stops me from just…".
 */

import { createPrivateKey, generateKeyPairSync, randomUUID, sign as edSign } from "node:crypto";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const TARGET = process.argv[3] ?? "obn:meridian-coldchain";
const PROTOCOL = "obn/0.1";
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
  id: "obn:probe",
  name: "Boundary Probe",
  domain: "probe.example",
  purpose: "Tests what this node refuses.",
  publicKey: keys.publicKey,
  endpoint: "https://probe.example/inbox",
  capabilities: ["buy", "negotiate"],
};

const OFFER = {
  sku: "reefer-lane-lagos-accra",
  currency: "USD",
  unitPrice: 900,
  volume: 100,
  termMonths: 6,
  incoterm: "DAP",
  paymentTermsDays: 30,
  clauses: [],
};

const envelope = (over = {}) => ({
  protocol: PROTOCOL,
  id: `msg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  threadId: `thr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  from: CARD.id,
  to: TARGET,
  type: "propose",
  ts: new Date().toISOString(),
  body: { offer: OFFER, card: CARD },
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

function expect(label, status, wanted, detail) {
  total += 1;
  const ok = wanted.includes(status);
  if (ok) passed += 1;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${String(status).padEnd(4)} ${label}`);
  if (detail) console.log(`              ${detail}`);
}

async function main() {
  console.log(`\n  Probing ${BASE} as an untrusted stranger\n`);

  // --- identity and integrity ---
  const ok = await post(sign(envelope(), keys.privateKey));
  expect("a correctly signed stranger is admitted", ok.status, [200], `thread ${ok.json.threadId}`);

  const forged = sign(envelope(), keys.privateKey);
  forged.sig = Buffer.from("x".repeat(64)).toString("base64url");
  const r2 = await post(forged);
  expect("forged signature", r2.status, [401], r2.json.error);

  const tampered = sign(envelope(), keys.privateKey);
  tampered.body.offer = { ...OFFER, unitPrice: 1 };
  const r3 = await post(tampered);
  expect("price changed after signing", r3.status, [401], r3.json.error);

  const impostor = mintKeys();
  const r4 = await post(sign(envelope(), impostor.privateKey));
  expect("signed with a key the card does not match", r4.status, [401], r4.json.error);

  const r5 = await post(sign(envelope({ from: "obn:ghost", body: { offer: OFFER } }), keys.privateKey));
  expect("unknown sender presenting no card", r5.status, [404], r5.json.error);

  // A card whose id disagrees with the sender is never adopted, so this lands
  // as an unknown sender rather than confirming anything about the card.
  const r6 = await post(sign(envelope({ from: "obn:someone-else" }), keys.privateKey));
  expect("card id disagrees with the sender", r6.status, [400, 404], r6.json.error);

  const r7 = await post(sign(envelope({ protocol: "obn/9.9" }), keys.privateKey));
  expect("unsupported protocol version", r7.status, [400], r7.json.error);

  const r8 = await post(sign(envelope({ to: "obn:kairo-foods" }), keys.privateKey));
  expect("envelope addressed to a different agent", r8.status, [400], r8.json.error);

  // --- mandate enforcement ---
  const lowball = { ...OFFER, unitPrice: 50, volume: 400 };
  const r9 = await post(sign(envelope({ body: { offer: lowball, card: CARD } }), keys.privateKey));
  const counter = r9.json.reply?.body?.offer;
  total += 1;
  const heldFloor = Boolean(counter) && counter.unitPrice >= 820 && r9.json.status !== "accepted";
  if (heldFloor) passed += 1;
  console.log(`  ${heldFloor ? "pass" : "FAIL"}  ${r9.status}  an offer far below the floor is never accepted`);
  console.log(`              offered USD 50 → replied "${r9.json.reply?.type}" at USD ${counter?.unitPrice}`);

  const dirty = { ...OFFER, clauses: ["exclusivity", "unlimited-liability"] };
  const r10 = await post(sign(envelope({ body: { offer: dirty, card: CARD } }), keys.privateKey));
  const c10 = r10.json.reply?.body?.offer;
  total += 1;
  const stripped = Boolean(c10) && !c10.clauses.some((c) => dirty.clauses.includes(c));
  if (stripped) passed += 1;
  console.log(`  ${stripped ? "pass" : "FAIL"}  ${r10.status}  forbidden clauses never survive into a reply`);
  console.log(`              asked for [${dirty.clauses}] → agreed to [${c10?.clauses ?? ""}]`);

  console.log(`\n  ${passed}/${total} probes behaved as specified.\n`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  ✗ ${err.message}\n    Is the node running? Try: npm run dev\n`);
  process.exit(1);
});
