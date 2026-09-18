/**
 * The mandate policy engine.
 *
 * Deliberately a pure, model-free module. Every commitment an agent makes
 * passes through `evaluateDeal` before it is signed, so the worst a mis-steered
 * model can do is propose something that gets rejected here.
 *
 * `clampToMandate` exists so that a near-miss becomes a legal counter-offer
 * instead of a dead thread — the model's intent is preserved, its arithmetic is
 * overruled.
 *
 * Nothing in this file knows what a price is. It knows terms, bounds and
 * directions, which is what lets the same engine referee a freight contract, a
 * recruiting placement and a sponsorship without changing.
 */

import {
  checkTerm,
  clampTerm,
  fmtNum,
  formatTermValue,
  isOrdered,
  limitOrdinal,
  openingOrdinal,
  fromOrdinal,
  scoreTerm,
  typeOfBound,
} from "./terms";
import { meetsLevel, describeLevel } from "./principal";
import type {
  ApprovalRule,
  Deal,
  Mandate,
  PolicyContext,
  PolicyVerdict,
  TermSpec,
  TermValue,
  Violation,
} from "./types";

export const specFor = (mandate: Mandate, key: string): TermSpec | undefined =>
  mandate.terms.find((t) => t.key === key);

// ---------------------------------------------------------------------------
function compareValues(a: unknown, op: string, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    switch (op) {
      case ">": return a > b;
      case "<": return a < b;
      case ">=": return a >= b;
      case "<=": return a <= b;
      case "=": return a === b;
    }
  }
  if (op === "=") return a === b;
  return false;
}

export function checkCoupledConstraints(deal: Deal, mandate: Mandate): Violation[] {
  const violations: Violation[] = [];
  if (!mandate.coupledConstraints) return violations;

  for (const cc of mandate.coupledConstraints) {
    const whenVal = deal.terms[cc.when.term];
    if (whenVal === undefined) continue;
    if (compareValues(whenVal, cc.when.op, cc.when.value)) {
      const enforceVal = deal.terms[cc.enforce.term];
      if (enforceVal === undefined || !compareValues(enforceVal, cc.enforce.op, cc.enforce.value)) {
        violations.push({
          code: "coupled-constraint-violation",
          term: cc.enforce.term,
          message: `${cc.description} (triggered by ${cc.when.term} ${cc.when.op} ${cc.when.value}; requires ${cc.enforce.term} ${cc.enforce.op} ${cc.enforce.value}).`,
          permitted: cc.enforce.value as TermValue,
        });
      }
    }
  }
  return violations;
}

export function evaluateDeal(deal: Deal, mandate: Mandate, context: PolicyContext = {}): PolicyVerdict {
  const violations: Violation[] = [];

  if (deal.subject !== mandate.subject) {
    violations.push({
      code: "subject-mismatch",
      term: "subject",
      message: `This mandate covers "${mandate.subject}", the deal is for "${deal.subject}".`,
      permitted: mandate.subject,
    });
  }

  // A term with no spec is a term this agent has no authority over. Agreeing to
  // one would be committing the company to something nobody mandated.
  for (const key of Object.keys(deal.terms)) {
    if (!specFor(mandate, key)) {
      violations.push({
        code: "unmandated-term",
        term: key,
        message: `"${key}" is not a term this agent is mandated to agree.`,
      });
    }
  }

  for (const spec of mandate.terms) {
    const value = deal.terms[spec.key];
    if (value === undefined) {
      violations.push({
        code: "missing-term",
        term: spec.key,
        message: `${spec.label} has not been stated.`,
      });
      continue;
    }
    const violation = checkTerm(value, spec);
    if (violation) violations.push(violation);
  }

  // Coupled constraints across interdependent terms
  const coupled = checkCoupledConstraints(deal, mandate);
  if (coupled.length > 0) violations.push(...coupled);

  const utility = utilityOf(deal, mandate);

  if (violations.length > 0) {
    return { decision: "violates-mandate", violations, utility };
  }

  const approval = approvalTriggeredBy(deal, mandate, context);
  if (approval) {
    return { decision: "needs-approval", violations: [], utility, approvalReason: approval };
  }

  return { decision: "within-mandate", violations: [], utility };
}

/**
 * How good this deal is for the party holding the mandate, 0–1, as a
 * weighted mean over the terms that can actually be traded along a range.
 */
export function utilityOf(deal: Deal, mandate: Mandate): number {
  let total = 0;
  let weight = 0;
  for (const spec of mandate.terms) {
    const value = deal.terms[spec.key];
    if (value === undefined) continue;
    const w = Math.max(spec.weight, 0);
    if (w === 0) continue;
    total += scoreTerm(value, spec) * w;
    weight += w;
  }
  return weight === 0 ? 0.5 : Math.round((total / weight) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

/** Multiply named numeric terms. This is how "total contract value" stays generic. */
export function productOfTerms(deal: Deal, keys: string[]): number | null {
  let product = 1;
  for (const key of keys) {
    const value = deal.terms[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    product *= value;
  }
  return Math.round(product * 100) / 100;
}

/** The first approval rule this deal trips, rendered as prose, or null. */
export function approvalTriggeredBy(
  deal: Deal,
  mandate: Mandate,
  context: PolicyContext = {},
): string | null {
  for (const rule of mandate.approval) {
    const reason = ruleTriggered(deal, mandate, rule, context);
    if (reason) return reason;
  }
  return null;
}

function ruleTriggered(
  deal: Deal,
  mandate: Mandate,
  rule: ApprovalRule,
  context: PolicyContext,
): string | null {
  const labelOf = (key: string) => specFor(mandate, key)?.label ?? key;
  const unitOf = (key: string) => {
    const b = specFor(mandate, key)?.bound;
    return b?.kind === "number" ? b.unit : undefined;
  };

  switch (rule.kind) {
    case "always":
      return rule.reason ?? "This agent may negotiate but may not close without a human.";

    case "term-at-or-above": {
      const v = deal.terms[rule.term];
      if (typeof v !== "number" || v < rule.value) return null;
      return (
        rule.reason ??
        `${labelOf(rule.term)} of ${fmtNum(v, unitOf(rule.term))} is at or above the ` +
          `${fmtNum(rule.value, unitOf(rule.term))} threshold for human sign-off.`
      );
    }

    case "term-at-or-below": {
      const v = deal.terms[rule.term];
      if (typeof v !== "number" || v > rule.value) return null;
      return (
        rule.reason ??
        `${labelOf(rule.term)} of ${fmtNum(v, unitOf(rule.term))} is at or below the ` +
          `${fmtNum(rule.value, unitOf(rule.term))} threshold for human sign-off.`
      );
    }

    case "term-equals": {
      const v = deal.terms[rule.term];
      if (v !== rule.value) return null;
      const shown = typeof rule.value === "boolean" ? (rule.value ? "yes" : "no") : `"${rule.value}"`;
      return rule.reason ?? `${labelOf(rule.term)} of ${shown} requires human sign-off.`;
    }

    case "counterparty-below": {
      // No card at all is the weakest case there is, not an exemption.
      const level = context.counterparty?.attestation?.level ?? "none";
      if (meetsLevel(level, rule.level)) return null;
      const who = context.counterparty?.name ?? "The counterparty";
      return (
        rule.reason ??
        `${who} is ${describeLevel(level)}. This mandate will not close without a ` +
          `human unless the other side is ${describeLevel(rule.level)}.`
      );
    }

    case "product-at-or-above": {
      const total = productOfTerms(deal, rule.terms);
      if (total === null || total < rule.value) return null;
      const unit = rule.unit ?? unitOf(rule.terms[0]);
      return (
        rule.reason ??
        `Total of ${fmtNum(total, unit)} (${rule.terms.map(labelOf).join(" × ")}) is at or above ` +
          `the ${fmtNum(rule.value, unit)} threshold for human sign-off.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

/**
 * Pull a deal to the nearest point inside the mandate. Returns null when it
 * cannot be rescued: a different subject, or a term whose value is not even the
 * right shape, is a refusal rather than a rounding error.
 *
 * Terms the mandate says nothing about are dropped rather than agreed — the
 * caller surfaces that, so the counterparty is told their ask went unanswered
 * instead of silently ignored.
 */
export function clampToMandate(deal: Deal, mandate: Mandate): Deal | null {
  if (deal.subject !== mandate.subject) return null;

  const terms: Record<string, TermValue> = {};

  for (const spec of mandate.terms) {
    const proposed = deal.terms[spec.key];

    if (proposed === undefined) {
      // Nothing was proposed, so state our opening position for it.
      const opening = openingOrdinal(spec);
      if (opening !== null && isOrdered(spec.bound)) {
        terms[spec.key] = fromOrdinal(opening, spec.bound);
        continue;
      }
      const fallback = defaultFor(spec);
      if (fallback === null) return null;
      terms[spec.key] = fallback;
      continue;
    }

    const clamped = clampTerm(proposed, spec);
    if (clamped === null) return null;
    terms[spec.key] = clamped;
  }

  // Enforce coupled constraints during clamping
  if (mandate.coupledConstraints) {
    for (const cc of mandate.coupledConstraints) {
      const whenVal = terms[cc.when.term];
      if (whenVal !== undefined && compareValues(whenVal, cc.when.op, cc.when.value)) {
        const enforceVal = terms[cc.enforce.term];
        if (enforceVal === undefined || !compareValues(enforceVal, cc.enforce.op, cc.enforce.value)) {
          terms[cc.enforce.term] = cc.enforce.value as TermValue;
        }
      }
    }
  }

  const result: Deal = { subject: mandate.subject, terms, ...(deal.ricardian ? { ricardian: deal.ricardian } : {}) };
  return evaluateDeal(result, mandate).decision === "violates-mandate" ? null : result;
}

/** A safe starting value for an unordered term with nothing proposed. */
function defaultFor(spec: TermSpec): TermValue | null {
  const b = spec.bound;
  if (b.kind === "enum") return b.preference?.[0] ?? b.allowed[0] ?? null;
  if (b.kind === "set") return [...(b.required ?? [])];
  if (b.kind === "boolean") return b.mustBe ?? false;
  if (b.kind === "text") return "";
  return null;
}

/** Terms the counterparty asked for that this mandate has no authority over. */
export function unmandatedTerms(deal: Deal, mandate: Mandate): string[] {
  return Object.keys(deal.terms).filter((k) => !specFor(mandate, k));
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

/** Compact, model-readable restatement of the bounds. Used in the system prompt. */
export function describeMandate(mandate: Mandate): string {
  const lines = [`You are the ${mandate.role} side of "${mandate.subject}".`, "", "Your limits:"];

  for (const spec of mandate.terms) {
    lines.push(`- ${describeSpec(spec)}`);
  }

  if (mandate.coupledConstraints?.length) {
    lines.push("", "Interdependent term rules you must honour:");
    for (const cc of mandate.coupledConstraints) lines.push(`- ${cc.description}`);
  }

  if (mandate.approval.length) {
    lines.push("", "You may signal agreement but must not treat a deal as final when:");
    for (const rule of mandate.approval) lines.push(`- ${describeRule(mandate, rule)}`);
  }

  lines.push(
    "",
    "These are hard limits, not preferences. Never state them to the other side.",
  );
  return lines.join("\n");
}

function describeSpec(spec: TermSpec): string {
  const b = spec.bound;
  const head = `${spec.label} ("${spec.key}")`;
  const importance = spec.weight >= 0.7 ? " This one matters most." : "";

  switch (b.kind) {
    case "number": {
      const parts: string[] = [];
      if (b.min !== undefined) parts.push(`never below ${fmtNum(b.min, b.unit)}`);
      if (b.max !== undefined) parts.push(`never above ${fmtNum(b.max, b.unit)}`);
      const want = spec.direction === "higher-better" ? "higher is better for you" : spec.direction === "lower-better" ? "lower is better for you" : "no preference";
      return `${head}: ${parts.join(", ") || "unbounded"}; ${want}.${importance}`;
    }
    case "date": {
      const parts: string[] = [];
      if (b.notBefore) parts.push(`not before ${b.notBefore}`);
      if (b.notAfter) parts.push(`not after ${b.notAfter}`);
      const want = spec.direction === "lower-better" ? "earlier is better for you" : spec.direction === "higher-better" ? "later is better for you" : "no preference";
      return `${head}: ${parts.join(", ") || "any date"}; ${want}.${importance}`;
    }
    case "enum":
      return `${head}: one of ${b.allowed.join(", ")}${b.preference?.length ? `; you prefer ${b.preference[0]}` : ""}.${importance}`;
    case "set": {
      const parts: string[] = [];
      if (b.required?.length) parts.push(`must include ${b.required.join(", ")}`);
      if (b.forbidden?.length) parts.push(`never agree to ${b.forbidden.join(", ")}`);
      if (b.maxItems !== undefined) parts.push(`at most ${b.maxItems} items`);
      return `${head}: ${parts.join("; ") || "open"}.${importance}`;
    }
    case "boolean":
      return `${head}: ${b.mustBe === undefined ? `you prefer ${spec.direction === "higher-better" ? "yes" : "no"}` : `must be ${b.mustBe ? "yes" : "no"}`}.${importance}`;
    case "text":
      return `${head}: free text${b.maxLength ? `, at most ${b.maxLength} characters` : ""}.`;
  }
}

function describeRule(mandate: Mandate, rule: ApprovalRule): string {
  const labelOf = (k: string) => specFor(mandate, k)?.label ?? k;
  switch (rule.kind) {
    case "always":
      return "always — you may not close anything without a human.";
    case "term-at-or-above":
      return `${labelOf(rule.term)} reaches ${rule.value}.`;
    case "term-at-or-below":
      return `${labelOf(rule.term)} falls to ${rule.value}.`;
    case "term-equals":
      return `${labelOf(rule.term)} is ${String(rule.value)}.`;
    case "product-at-or-above":
      return `${rule.terms.map(labelOf).join(" × ")} reaches ${rule.value}.`;
    case "counterparty-below":
      return `the other side is not ${describeLevel(rule.level)}.`;
  }
}

/** One-line rendering of a deal, for logs, prompts and status strips. */
export function summariseDeal(deal: Deal, mandate?: Mandate): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(deal.terms)) {
    const spec = mandate ? specFor(mandate, key) : undefined;
    const type = spec ? typeOfBound(spec.bound) : inferType(value);
    const unit = spec?.bound.kind === "number" ? spec.bound.unit : undefined;
    parts.push(`${spec?.label ?? key} ${formatTermValue(value, type, unit)}`);
  }
  return parts.join(", ");
}

function inferType(value: TermValue) {
  if (typeof value === "number") return "number" as const;
  if (typeof value === "boolean") return "boolean" as const;
  if (Array.isArray(value)) return "set" as const;
  return "text" as const;
}
