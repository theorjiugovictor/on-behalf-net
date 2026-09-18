/**
 * Pure helpers for principals and attestation levels.
 *
 * Deliberately free of any Node built-in so that client components can render a
 * counterparty's standing without dragging crypto into the browser bundle. The
 * verification machinery itself lives in attestation.ts, which is server-only.
 */

import { ATTESTATION_RANK, type AttestationLevel, type Principal } from "./types";

export const meetsLevel = (have: AttestationLevel, need: AttestationLevel) =>
  ATTESTATION_RANK[have] >= ATTESTATION_RANK[need];

export const describeLevel = (level: AttestationLevel): string =>
  level === "domain"
    ? "domain verified"
    : level === "email"
      ? "email verified"
      : "unverified";

/**
 * The line shown under a principal's name. A company is identified by its
 * domain; a person by an optional handle, or nothing at all. Never a contact
 * address — see the note at the top of attestation.ts.
 */
export function principalHandle(principal: Principal): string {
  return principal.kind === "company" ? principal.domain : (principal.handle ?? "individual");
}

/** A short slug for prompts and search queries, with no punctuation. */
export function principalSlug(principal: Principal): string {
  const raw = principal.kind === "company" ? principal.domain.split(".")[0] : principal.name;
  return raw.replace(/[^a-z0-9]+/gi, " ").trim();
}
