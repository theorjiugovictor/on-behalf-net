/**
 * Agent identity and message signing.
 *
 * Keys are ed25519. We move them as raw 32-byte values in base64url rather than
 * PEM so that a BYOA agent written in any language can interoperate without
 * needing a Node-compatible key format.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  randomUUID,
} from "node:crypto";
import type { Envelope, KeyDelegation } from "./types";

// DER wrappers for raw ed25519 keys. Both are fixed-length for this curve.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");

export type KeyPair = { publicKey: string; privateKey: string };

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  // Raw key material is the tail of each DER structure.
  return {
    publicKey: b64u(spki.subarray(spki.length - 32)),
    privateKey: b64u(pkcs8.subarray(pkcs8.length - 32)),
  };
}

function publicKeyObject(raw: string) {
  return createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, unb64u(raw)]),
    format: "der",
    type: "spki",
  });
}

function privateKeyObject(raw: string) {
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, unb64u(raw)]),
    format: "der",
    type: "pkcs8",
  });
}

/**
 * Deterministic JSON: object keys sorted recursively, no insignificant
 * whitespace. Both sides must produce byte-identical output for a signature to
 * verify, so this is the one function that must never be "improved" casually.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

/** The bytes a signature commits to: every envelope field except `sig`. */
export function signingPayload(envelope: Omit<Envelope, "sig">): Buffer {
  return Buffer.from(canonicalize(envelope), "utf8");
}

export function signEnvelope(
  envelope: Omit<Envelope, "sig">,
  privateKey: string,
): Envelope {
  const sig = nodeSign(null, signingPayload(envelope), privateKeyObject(privateKey));
  return { ...envelope, sig: b64u(sig) };
}

/**
 * Verify an envelope against a claimed public key. Returns false rather than
 * throwing on malformed input: envelopes arrive from untrusted agents, and a
 * bad signature and a bad key are the same outcome to the caller.
 */
export function verifyEnvelope(envelope: Envelope, publicKey: string): boolean {
  try {
    const { sig, ...rest } = envelope;
    if (!sig) return false;
    return nodeVerify(null, signingPayload(rest), publicKeyObject(publicKey), unb64u(sig));
  } catch {
    return false;
  }
}

/** Sign a delegation granting an operational key permission to sign for a root key. */
export function signDelegation(args: {
  rootPublicKey: string;
  rootPrivateKey: string;
  delegatedTo: string;
  validUntil: string;
}): KeyDelegation {
  const unsigned = {
    rootPublicKey: args.rootPublicKey,
    delegatedTo: args.delegatedTo,
    validUntil: args.validUntil,
  };
  const payload = Buffer.from(canonicalize(unsigned), "utf8");
  const sig = nodeSign(null, payload, privateKeyObject(args.rootPrivateKey));
  return {
    ...unsigned,
    sig: b64u(sig),
  };
}

/** Verify that a delegation was signed by the root key and has not expired. */
export function verifyDelegation(delegation: KeyDelegation): boolean {
  try {
    const { sig, ...unsigned } = delegation;
    if (!sig) return false;
    if (new Date() > new Date(delegation.validUntil)) return false;
    const payload = Buffer.from(canonicalize(unsigned), "utf8");
    return nodeVerify(null, payload, publicKeyObject(delegation.rootPublicKey), unb64u(sig));
  } catch {
    return false;
  }
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Stable, readable agent id derived from a domain. Collisions are the caller's problem. */
export function agentIdForDomain(domain: string): string {
  const slug = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `obn:${slug || "agent"}`;
}
