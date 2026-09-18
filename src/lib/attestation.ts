/**
 * Attestation — how much an identity is worth.
 *
 * The question a negotiation network has to answer is not "is this a real
 * human" but "can this party be found and held to what they agreed". That is
 * why email sits where it does: the inbox is where an agreement would actually
 * be sent, so proving control of it proves a route to recourse. A phone number
 * proves someone holds a SIM, which nobody serves a contract to.
 *
 * Two rules hold throughout:
 *
 *  - Contact details are never published. A card is fetched by strangers; an
 *    address on it would be harvested immediately. Cards carry a level, and the
 *    address lives in private storage keyed by agent id.
 *  - Verification never depends on a third party where it does not have to.
 *    Domain proof is a file the principal serves themselves.
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { meetsLevel } from "./principal";
import type { Attestation } from "./types";

export { meetsLevel, describeLevel, principalHandle, principalSlug } from "./principal";

/** Where a principal proves domain control. */
export const WELL_KNOWN_PATH = "/.well-known/on-behalf.txt";

const CHALLENGE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (value: string) => EMAIL_RE.test(value.trim());

export const emailDomain = (value: string) => value.trim().toLowerCase().split("@")[1] ?? "";

/**
 * Free-mail providers prove an inbox and nothing more. An address at any other
 * domain is a weak signal about affiliation, but only a *verified* company
 * domain on this node promotes the level — see `levelForEmail`.
 */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "fastmail.com",
  "hey.com",
]);

export const isFreeMail = (address: string) => FREE_MAIL.has(emailDomain(address));

/**
 * The level a verified address earns. An address at a domain that already holds
 * a domain-verified agent here counts as `domain`: the employer has proved the
 * domain, and this person has proved they hold an address inside it.
 */
export function levelForEmail(
  address: string,
  domainIsVerifiedHere: (domain: string) => boolean,
): Attestation {
  const domain = emailDomain(address);
  if (domain && !isFreeMail(address) && domainIsVerifiedHere(domain)) {
    return {
      level: "domain",
      verifiedAt: new Date().toISOString(),
      domain,
      note: `Verified via an address at ${domain}, which is domain-verified on this node.`,
    };
  }
  return { level: "email", verifiedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

export type Challenge = {
  agentId: string;
  /** Hashed, never stored in the clear — this is a bearer credential. */
  codeHash: string;
  /** The address being proved. Private: it must not reach any card. */
  address: string;
  expiresAt: number;
  attempts: number;
};

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

export function newChallenge(agentId: string, address: string, code: string): Challenge {
  return {
    agentId,
    codeHash: hashCode(code),
    address: address.trim().toLowerCase(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    attempts: 0,
  };
}

export type ChallengeResult =
  | { ok: true }
  | { ok: false; error: string; exhausted?: boolean };

/** Compare in constant time and burn the challenge after too many tries. */
export function checkChallenge(challenge: Challenge, code: string): ChallengeResult {
  if (Date.now() > challenge.expiresAt) {
    return { ok: false, error: "That code has expired. Request a new one.", exhausted: true };
  }
  challenge.attempts += 1;
  if (challenge.attempts > MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code.", exhausted: true };
  }

  const a = Buffer.from(hashCode(code.trim()), "hex");
  const b = Buffer.from(challenge.codeHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "That code is not right." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Domain proof
// ---------------------------------------------------------------------------

/** What the principal must serve at the well-known path. */
export const domainProofToken = (publicKey: string) => `on-behalf-agent=${publicKey}`;

export type DomainProof =
  | { ok: true; attestation: Attestation }
  | { ok: false; error: string; reachable: boolean };

/**
 * Fetch the well-known file and look for this agent's key. Deliberately tolerant
 * about formatting — a key on its own line, or the full token, both count — and
 * deliberately strict about the key itself.
 */
export async function verifyDomain(
  domain: string,
  publicKey: string,
  timeoutMs = 8000,
): Promise<DomainProof> {
  const url = `https://${domain}${WELL_KNOWN_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      return {
        ok: false,
        reachable: true,
        error: `${url} returned ${res.status}. Serve the proof there and try again.`,
      };
    }
    const body = (await res.text()).slice(0, 4000);
    if (!body.includes(publicKey)) {
      return {
        ok: false,
        reachable: true,
        error: `${url} does not contain this agent's key.`,
      };
    }
    return {
      ok: true,
      attestation: {
        level: "domain",
        verifiedAt: new Date().toISOString(),
        domain,
        note: `Proved by serving the agent key at ${WELL_KNOWN_PATH}.`,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reachable: false,
      error: `Could not reach ${url} (${(err as Error).message}).`,
    };
  } finally {
    clearTimeout(timer);
  }
}

