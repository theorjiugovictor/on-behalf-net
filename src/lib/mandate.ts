/**
 * The mandate policy engine.
 *
 * This is deliberately a pure, model-free module. Every commitment an agent
 * makes passes through `evaluateOffer` before it is signed, so the worst a
 * mis-steered model can do is propose something that gets rejected here.
 *
 * `clampToMandate` exists so that a near-miss becomes a legal counter-offer
 * instead of a dead thread — the model's intent is preserved, its arithmetic is
 * overruled.
 */

import type { Mandate, Offer, PolicyVerdict, Violation } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totalValueOf(offer: Offer): number {
  return round2(offer.unitPrice * offer.volume);
}

export function evaluateOffer(offer: Offer, mandate: Mandate): PolicyVerdict {
  const violations: Violation[] = [];
  const totalValue = totalValueOf(offer);

  if (offer.sku !== mandate.sku) {
    violations.push({
      code: "sku-mismatch",
      field: "sku",
      message: `Mandate covers "${mandate.sku}", offer is for "${offer.sku}".`,
      permitted: mandate.sku,
    });
  }

  if (offer.currency !== mandate.currency) {
    violations.push({
      code: "currency-mismatch",
      field: "currency",
      message: `Mandate is denominated in ${mandate.currency}, offer in ${offer.currency}.`,
      permitted: mandate.currency,
    });
  }

  if (mandate.role === "seller" && mandate.floorUnitPrice !== undefined) {
    if (offer.unitPrice < mandate.floorUnitPrice) {
      violations.push({
        code: "below-price-floor",
        field: "unitPrice",
        message: `${offer.unitPrice} is below the ${mandate.currency} ${mandate.floorUnitPrice} floor.`,
        permitted: mandate.floorUnitPrice,
      });
    }
  }

  if (mandate.role === "buyer" && mandate.ceilingUnitPrice !== undefined) {
    if (offer.unitPrice > mandate.ceilingUnitPrice) {
      violations.push({
        code: "above-price-ceiling",
        field: "unitPrice",
        message: `${offer.unitPrice} is above the ${mandate.currency} ${mandate.ceilingUnitPrice} ceiling.`,
        permitted: mandate.ceilingUnitPrice,
      });
    }
  }

  if (offer.volume < mandate.minVolume || offer.volume > mandate.maxVolume) {
    violations.push({
      code: "volume-out-of-range",
      field: "volume",
      message: `${offer.volume} units is outside the permitted ${mandate.minVolume}–${mandate.maxVolume}.`,
      permitted: Math.min(Math.max(offer.volume, mandate.minVolume), mandate.maxVolume),
    });
  }

  if (offer.termMonths > mandate.maxTermMonths) {
    violations.push({
      code: "term-too-long",
      field: "termMonths",
      message: `${offer.termMonths} months exceeds the ${mandate.maxTermMonths}-month limit.`,
      permitted: mandate.maxTermMonths,
    });
  }

  if (totalValue > mandate.maxTotalValue) {
    violations.push({
      code: "total-value-exceeded",
      field: "unitPrice",
      message: `Total exposure ${mandate.currency} ${totalValue} exceeds the ${mandate.maxTotalValue} cap.`,
      permitted: mandate.maxTotalValue,
    });
  }

  if (!mandate.allowedIncoterms.includes(offer.incoterm)) {
    violations.push({
      code: "incoterm-not-allowed",
      field: "incoterm",
      message: `${offer.incoterm} is not permitted. Allowed: ${mandate.allowedIncoterms.join(", ")}.`,
      permitted: mandate.allowedIncoterms[0],
    });
  }

  if (offer.paymentTermsDays > mandate.maxPaymentTermsDays) {
    violations.push({
      code: "payment-terms-too-long",
      field: "paymentTermsDays",
      message: `Net ${offer.paymentTermsDays} exceeds the net ${mandate.maxPaymentTermsDays} limit.`,
      permitted: mandate.maxPaymentTermsDays,
    });
  }

  for (const clause of offer.clauses) {
    if (mandate.forbiddenClauses.includes(clause)) {
      violations.push({
        code: "forbidden-clause",
        field: "clauses",
        message: `"${clause}" is expressly outside this agent's authority.`,
      });
    }
  }

  if (violations.length > 0) {
    return { decision: "violates-mandate", violations, totalValue };
  }

  if (totalValue >= mandate.autoApproveBelowValue) {
    return {
      decision: "needs-approval",
      violations: [],
      totalValue,
      approvalReason:
        `Total value ${mandate.currency} ${totalValue.toLocaleString()} is at or above the ` +
        `${mandate.currency} ${mandate.autoApproveBelowValue.toLocaleString()} threshold for human sign-off.`,
    };
  }

  return { decision: "within-mandate", violations: [], totalValue };
}

/**
 * Pull an offer to the nearest point inside the mandate. Returns null when the
 * offer cannot be rescued — a mismatched SKU or a forbidden clause is a refusal,
 * not a rounding error.
 */
export function clampToMandate(offer: Offer, mandate: Mandate): Offer | null {
  if (offer.sku !== mandate.sku) return null;

  const clauses = offer.clauses.filter((c) => !mandate.forbiddenClauses.includes(c));

  let unitPrice = offer.unitPrice;
  if (mandate.role === "seller" && mandate.floorUnitPrice !== undefined) {
    unitPrice = Math.max(unitPrice, mandate.floorUnitPrice);
  }
  if (mandate.role === "buyer" && mandate.ceilingUnitPrice !== undefined) {
    unitPrice = Math.min(unitPrice, mandate.ceilingUnitPrice);
  }

  const volume = Math.min(Math.max(offer.volume, mandate.minVolume), mandate.maxVolume);

  const clamped: Offer = {
    sku: mandate.sku,
    currency: mandate.currency,
    unitPrice: round2(unitPrice),
    volume,
    termMonths: Math.min(offer.termMonths, mandate.maxTermMonths),
    incoterm: mandate.allowedIncoterms.includes(offer.incoterm)
      ? offer.incoterm
      : mandate.allowedIncoterms[0],
    paymentTermsDays: Math.min(offer.paymentTermsDays, mandate.maxPaymentTermsDays),
    clauses,
  };

  // Exposure is the one bound we cannot fix by moving a single field: shrink
  // volume first, since price is usually the negotiated term.
  if (totalValueOf(clamped) > mandate.maxTotalValue) {
    const affordable = Math.floor(mandate.maxTotalValue / clamped.unitPrice);
    if (affordable < mandate.minVolume) return null;
    clamped.volume = Math.min(affordable, mandate.maxVolume);
  }

  return evaluateOffer(clamped, mandate).decision === "violates-mandate" ? null : clamped;
}

/** Compact, model-readable restatement of the bounds. Used in the system prompt. */
export function describeMandate(mandate: Mandate): string {
  const lines = [
    `Role: ${mandate.role}`,
    `Product: ${mandate.sku}, priced in ${mandate.currency}`,
    mandate.role === "seller"
      ? `Never quote below ${mandate.currency} ${mandate.floorUnitPrice} per unit.`
      : `Never agree above ${mandate.currency} ${mandate.ceilingUnitPrice} per unit.`,
    `Volume must be between ${mandate.minVolume} and ${mandate.maxVolume} units.`,
    `Contract term must not exceed ${mandate.maxTermMonths} months.`,
    `Total contract value must not exceed ${mandate.currency} ${mandate.maxTotalValue}.`,
    `Permitted incoterms: ${mandate.allowedIncoterms.join(", ")}.`,
    `Payment terms must not exceed net ${mandate.maxPaymentTermsDays} days.`,
  ];
  if (mandate.forbiddenClauses.length > 0) {
    lines.push(`You may never agree to any of: ${mandate.forbiddenClauses.join(", ")}.`);
  }
  lines.push(
    `Deals at or above ${mandate.currency} ${mandate.autoApproveBelowValue} require human sign-off; ` +
      `you may signal agreement but must not treat them as final.`,
  );
  return lines.join("\n");
}
