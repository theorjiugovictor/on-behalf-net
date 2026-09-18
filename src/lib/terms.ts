/**
 * Term machinery: how a single named term is checked, clamped, scored and
 * moved, for every term type.
 *
 * The trick that keeps this small is treating every ordered type as a number.
 * Dates compare as epoch milliseconds and booleans as 0/1, so "earlier is
 * better" and "prefer false" are both just `lower-better`, and one concession
 * routine covers money, dates, durations, headcounts and flags alike.
 */

import type {
  Direction,
  TermBound,
  TermSpec,
  TermType,
  TermValue,
  Violation,
} from "./types";

/**
 * The members an agent may agree to. Absent an explicit `allowed` list this is
 * just what the mandate requires — closed by default, so a set can never absorb
 * a commitment nobody authorised.
 */
function permittedMembers(bound: Extract<TermBound, { kind: "set" }>): Set<string> {
  return new Set([...(bound.allowed ?? []), ...(bound.required ?? [])]);
}

export function typeOfBound(bound: TermBound): TermType {
  return bound.kind;
}

/** Ordered types can be clamped toward a limit and conceded along a range. */
export function isOrdered(bound: TermBound): boolean {
  return bound.kind === "number" || bound.kind === "date" || bound.kind === "boolean";
}

// ---------------------------------------------------------------------------
// Ordinal projection
// ---------------------------------------------------------------------------

/** Project a value onto the number line, or null if it is not of the right type. */
export function toOrdinal(value: TermValue, bound: TermBound): number | null {
  switch (bound.kind) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    case "date": {
      if (typeof value !== "string") return null;
      const t = Date.parse(value);
      return Number.isNaN(t) ? null : t;
    }
    case "boolean":
      return typeof value === "boolean" ? (value ? 1 : 0) : null;
    default:
      return null;
  }
}

export function fromOrdinal(n: number, bound: TermBound): TermValue {
  switch (bound.kind) {
    case "number":
      return bound.integer ? Math.round(n) : Math.round(n * 100) / 100;
    case "date":
      return new Date(n).toISOString().slice(0, 10);
    case "boolean":
      return n >= 0.5;
    default:
      return n;
  }
}

/** The two ends of an ordered bound, as ordinals. Either may be absent. */
function boundEnds(bound: TermBound): { lo: number | null; hi: number | null } {
  switch (bound.kind) {
    case "number":
      return { lo: bound.min ?? null, hi: bound.max ?? null };
    case "date":
      return {
        lo: bound.notBefore ? Date.parse(bound.notBefore) : null,
        hi: bound.notAfter ? Date.parse(bound.notAfter) : null,
      };
    case "boolean":
      return bound.mustBe === undefined
        ? { lo: 0, hi: 1 }
        : { lo: bound.mustBe ? 1 : 0, hi: bound.mustBe ? 1 : 0 };
    default:
      return { lo: null, hi: null };
  }
}

/**
 * The ordinal a party concedes *toward* — the edge of its authority. A
 * `higher-better` party is floored, so its limit is the minimum.
 */
export function limitOrdinal(spec: TermSpec): number | null {
  const { lo, hi } = boundEnds(spec.bound);
  if (spec.direction === "higher-better") return lo;
  if (spec.direction === "lower-better") return hi;
  return lo ?? hi;
}

/** The ordinal furthest from the limit that is still in bounds. */
function farOrdinal(spec: TermSpec): number | null {
  const { lo, hi } = boundEnds(spec.bound);
  if (spec.direction === "higher-better") return hi;
  if (spec.direction === "lower-better") return lo;
  return null;
}

/**
 * Where to open. `anchor` reads as a fraction of the way from the limit toward
 * the far bound; with no far bound it becomes a fractional step out past the
 * limit, so an unbounded floor of 800 opens at 1024 rather than at infinity.
 */
export function openingOrdinal(spec: TermSpec): number | null {
  const limit = limitOrdinal(spec);
  if (limit === null) return null;
  if (spec.negotiable === false) return limit;

  const far = farOrdinal(spec);
  if (far !== null) return limit + (far - limit) * (spec.anchor ?? 0.85);

  const step = spec.anchor ?? 0.28;
  if (spec.direction === "higher-better") return limit * (1 + step);
  if (spec.direction === "lower-better") return limit * (1 - step);
  return limit;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function checkTerm(value: TermValue, spec: TermSpec): Violation | null {
  const b = spec.bound;
  const v = (code: Violation["code"], message: string, permitted?: TermValue): Violation => ({
    code,
    term: spec.key,
    message: `${spec.label}: ${message}`,
    permitted,
  });

  switch (b.kind) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return v("wrong-type", `expected a number, got ${describe(value)}.`);
      }
      if (b.min !== undefined && value < b.min) {
        return v("below-minimum", `${fmtNum(value, b.unit)} is below the ${fmtNum(b.min, b.unit)} limit.`, b.min);
      }
      if (b.max !== undefined && value > b.max) {
        return v("above-maximum", `${fmtNum(value, b.unit)} is above the ${fmtNum(b.max, b.unit)} limit.`, b.max);
      }
      return null;
    }

    case "date": {
      const t = toOrdinal(value, b);
      if (t === null) return v("wrong-type", `expected a date, got ${describe(value)}.`);
      if (b.notBefore && t < Date.parse(b.notBefore)) {
        return v("date-too-early", `${value} is before ${b.notBefore}.`, b.notBefore);
      }
      if (b.notAfter && t > Date.parse(b.notAfter)) {
        return v("date-too-late", `${value} is after ${b.notAfter}.`, b.notAfter);
      }
      return null;
    }

    case "enum": {
      if (typeof value !== "string") {
        return v("wrong-type", `expected one of ${b.allowed.join(", ")}.`);
      }
      if (!b.allowed.includes(value)) {
        return v(
          "option-not-allowed",
          `"${value}" is not permitted. Allowed: ${b.allowed.join(", ")}.`,
          b.preference?.[0] ?? b.allowed[0],
        );
      }
      return null;
    }

    case "set": {
      if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) {
        return v("wrong-type", `expected a list of names, got ${describe(value)}.`);
      }
      const forbidden = value.filter((x) => b.forbidden?.includes(x));
      if (forbidden.length) {
        return v(
          "forbidden-member",
          `"${forbidden.join('", "')}" ${forbidden.length > 1 ? "are" : "is"} expressly outside this agent's authority.`,
        );
      }
      const stray = value.filter((x) => !permittedMembers(b).has(x));
      if (stray.length) {
        return v(
          "member-not-allowed",
          `"${stray.join('", "')}" ${stray.length > 1 ? "are" : "is"} not something this agent is mandated to agree.`,
        );
      }
      const missing = (b.required ?? []).filter((x) => !value.includes(x));
      if (missing.length) {
        return v("required-member-missing", `must include "${missing.join('", "')}".`);
      }
      if (b.maxItems !== undefined && value.length > b.maxItems) {
        return v("too-many-members", `at most ${b.maxItems} may be agreed.`, b.maxItems);
      }
      return null;
    }

    case "boolean": {
      if (typeof value !== "boolean") {
        return v("wrong-type", `expected true or false, got ${describe(value)}.`);
      }
      if (b.mustBe !== undefined && value !== b.mustBe) {
        return v("boolean-must-be", `must be ${b.mustBe}.`, b.mustBe);
      }
      return null;
    }

    case "text": {
      if (typeof value !== "string") {
        return v("wrong-type", `expected text, got ${describe(value)}.`);
      }
      if (b.maxLength !== undefined && value.length > b.maxLength) {
        return v("too-many-members", `must be ${b.maxLength} characters or fewer.`);
      }
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

/**
 * Pull a value to the nearest point inside the bound. Returns null when the
 * term cannot be rescued — a wrongly typed value is a refusal, not a rounding
 * error.
 */
export function clampTerm(value: TermValue, spec: TermSpec): TermValue | null {
  const b = spec.bound;

  if (isOrdered(b)) {
    const n = toOrdinal(value, b);
    if (n === null) return null;
    const { lo, hi } = boundEnds(b);
    let out = n;
    if (lo !== null) out = Math.max(out, lo);
    if (hi !== null) out = Math.min(out, hi);
    return fromOrdinal(out, b);
  }

  switch (b.kind) {
    case "enum": {
      if (typeof value === "string" && b.allowed.includes(value)) return value;
      return b.preference?.[0] ?? b.allowed[0] ?? null;
    }
    case "set": {
      if (!Array.isArray(value)) return null;
      const permitted = permittedMembers(b);
      const kept = value.filter(
        (x) => typeof x === "string" && permitted.has(x) && !b.forbidden?.includes(x),
      );
      const withRequired = [...new Set([...(b.required ?? []), ...kept])];
      return b.maxItems !== undefined ? withRequired.slice(0, b.maxItems) : withRequired;
    }
    case "text":
      if (typeof value !== "string") return null;
      return b.maxLength !== undefined ? value.slice(0, b.maxLength) : value;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * How good a value is for the party holding this spec, from 0 at the edge of
 * its authority to 1 at its opening ask. Unordered terms score on preference
 * where they have one and are otherwise neutral — weight only bites on terms
 * that can actually be traded along a range.
 */
export function scoreTerm(value: TermValue, spec: TermSpec): number {
  const b = spec.bound;

  if (b.kind === "enum") {
    if (typeof value !== "string") return 0;
    if (!b.preference?.length) return b.allowed.includes(value) ? 1 : 0;
    const i = b.preference.indexOf(value);
    return i === -1 ? 0.5 : 1 - i / Math.max(b.preference.length - 1, 1);
  }

  if (b.kind === "set" || b.kind === "text") {
    return checkTerm(value, spec) === null ? 1 : 0;
  }

  const n = toOrdinal(value, b);
  if (n === null) return 0;

  const limit = limitOrdinal(spec);
  const opening = openingOrdinal(spec);
  if (limit === null || opening === null || limit === opening) return 0.5;

  const t = (n - limit) / (opening - limit);
  return Math.max(0, Math.min(1, t));
}

// ---------------------------------------------------------------------------
// Concession
// ---------------------------------------------------------------------------

/**
 * Move one term from our current position toward theirs, never past the edge of
 * our authority. Unordered terms adopt the counterparty's value when it is
 * permitted and we do not care much, and hold otherwise.
 *
 * `rate` is the round's base pressure, 0–1. Weighting happens here rather than
 * at the call site so that each term type can apply it the way that type needs:
 * a number slides, a flag flips.
 */
export function concedeTerm(
  mine: TermValue | undefined,
  theirs: TermValue | undefined,
  spec: TermSpec,
  rate: number,
): TermValue | null {
  if (spec.negotiable === false) {
    const limit = limitOrdinal(spec);
    if (limit !== null && isOrdered(spec.bound)) return fromOrdinal(limit, spec.bound);
    return mine ?? null;
  }

  const b = spec.bound;

  // A flag cannot be split down the middle. Whoever weights it less gives way,
  // which is how a binary term actually gets settled: the side that cares more
  // holds, and the side that cares less concedes once the round is late enough.
  if (b.kind === "boolean" && b.mustBe === undefined) {
    if (typeof theirs !== "boolean") return mine ?? false;
    if (typeof mine !== "boolean") return theirs;
    if (mine === theirs) return mine;
    return rate >= spec.weight ? theirs : mine;
  }

  // Defend what matters more, concede what matters less — but not so steeply
  // that the headline term takes twice as many rounds as everything else.
  const effective = Math.min(0.85, rate * (1.15 - spec.weight * 0.4));

  if (isOrdered(b)) {
    const base = mine !== undefined ? toOrdinal(mine, b) : openingOrdinal(spec);
    if (base === null) return mine ?? null;
    const target = theirs !== undefined ? toOrdinal(theirs, b) : null;
    if (target === null) return fromOrdinal(base, b);

    // Only ever move in the direction that costs us something; never walk back
    // a concession because the other side moved against their own interest.
    const towardUs =
      spec.direction === "higher-better" ? target > base : spec.direction === "lower-better" ? target < base : false;

    let next = towardUs ? base : base + (target - base) * effective;

    const limit = limitOrdinal(spec);
    if (limit !== null) {
      next = spec.direction === "higher-better" ? Math.max(next, limit) : spec.direction === "lower-better" ? Math.min(next, limit) : next;
    }
    const { lo, hi } = boundEnds(b);
    if (lo !== null) next = Math.max(next, lo);
    if (hi !== null) next = Math.min(next, hi);
    return fromOrdinal(next, b);
  }

  if (b.kind === "enum") {
    if (typeof theirs === "string" && b.allowed.includes(theirs)) {
      // Concede an option we are indifferent to immediately; defend a preferred
      // one until the rate says the round is late.
      const theirScore = scoreTerm(theirs, spec);
      const mineScore = mine !== undefined ? scoreTerm(mine, spec) : 0;
      if (theirScore >= mineScore || effective >= 1 - theirScore) return theirs;
    }
    return (mine as TermValue) ?? b.preference?.[0] ?? b.allowed[0];
  }

  if (b.kind === "set") {
    const ours = Array.isArray(mine) ? mine : (b.required ?? []);
    const asked = Array.isArray(theirs) ? theirs : [];
    const allowed = permittedMembers(b);
    // Only ever absorb an ask this mandate actually authorises.
    const permitted = asked.filter((x) => allowed.has(x) && !b.forbidden?.includes(x));
    // Low-weight sets absorb the counterparty's asks; high-weight ones do not.
    const absorb = spec.weight <= 0.4 || effective >= 0.45;
    const merged = absorb ? [...new Set([...ours, ...permitted])] : ours;
    return b.maxItems !== undefined ? merged.slice(0, b.maxItems) : merged;
  }

  return mine ?? null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmtNum(n: number, unit?: string): string {
  const pretty = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (!unit) return pretty;
  // Currency-ish units read better in front, everything else behind.
  return /^[A-Z]{3}$/.test(unit) ? `${unit} ${pretty}` : `${pretty} ${unit}`;
}

export function formatTermValue(value: TermValue, type: TermType, unit?: string): string {
  if (type === "number" && typeof value === "number") return fmtNum(value, unit);
  if (type === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return String(value);
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return "a list";
  if (value === null) return "null";
  return typeof value;
}

/** Public half of a spec — safe to publish on an agent card. */
export function publicSpec(spec: TermSpec) {
  const b = spec.bound;
  return {
    key: spec.key,
    label: spec.label,
    type: typeOfBound(b),
    ...(b.kind === "number" && b.unit ? { unit: b.unit } : {}),
    ...(b.kind === "enum" ? { options: b.allowed } : {}),
  };
}

export const directionOf = (spec: TermSpec): Direction => spec.direction;
