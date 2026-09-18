/**
 * Proving a principal is who they claim.
 *
 * Two methods, one endpoint, because the difference is only in what the
 * principal has to work with:
 *
 *  - a company serves its agent's public key at a well-known path on its own
 *    domain. Self-verifying — no third party holds anything, and nothing secret
 *    ever crosses the wire.
 *  - a person enters a code sent to their inbox.
 *
 * Verification only ever raises a level. Nothing here can lower one, so a
 * failed attempt cannot be used to strip a rival's standing.
 */

import { NextResponse } from "next/server";
import {
  checkChallenge,
  domainProofToken,
  levelForEmail,
  verifyDomain,
  WELL_KNOWN_PATH,
} from "@/lib/attestation";
import {
  clearChallenge,
  domainIsVerified,
  getAgent,
  getChallenge,
  setAttestation,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/** What this agent must do to prove itself. Safe to show publicly. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agent = getAgent(decodeURIComponent(id));
  if (!agent) return NextResponse.json({ error: `No agent "${id}" here.` }, { status: 404 });

  const { principal, attestation, publicKey } = agent.card;

  return NextResponse.json({
    id: agent.card.id,
    attestation,
    ...(principal.kind === "company"
      ? {
          method: "domain",
          instructions: `Serve this exact line at https://${principal.domain}${WELL_KNOWN_PATH}, then POST here.`,
          proof: domainProofToken(publicKey),
          url: `https://${principal.domain}${WELL_KNOWN_PATH}`,
        }
      : {
          method: "email",
          instructions: "POST here with the six-digit code sent to your inbox.",
        }),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agentId = decodeURIComponent(id);
  const agent = getAgent(agentId);
  if (!agent) return NextResponse.json({ error: `No agent "${agentId}" here.` }, { status: 404 });

  if (agent.card.attestation.level === "domain") {
    return NextResponse.json({ verified: true, attestation: agent.card.attestation });
  }

  const body = await req.json().catch(() => ({}) as { code?: string });
  const { principal, publicKey } = agent.card;

  // --- company: fetch the proof they published ---
  if (principal.kind === "company") {
    const proof = await verifyDomain(principal.domain, publicKey);
    if (!proof.ok) {
      return NextResponse.json(
        {
          verified: false,
          error: proof.error,
          // A network the node cannot reach is not the principal's fault, and
          // saying so beats implying they did it wrong.
          reachable: proof.reachable,
          expected: domainProofToken(publicKey),
          url: `https://${principal.domain}${WELL_KNOWN_PATH}`,
        },
        { status: proof.reachable ? 400 : 502 },
      );
    }
    const updated = setAttestation(agentId, "domain", proof.attestation);
    return NextResponse.json({ verified: true, attestation: updated?.card.attestation });
  }

  // --- person: check the code against the live challenge ---
  const code = (body as { code?: string }).code?.trim();
  if (!code) return NextResponse.json({ error: "Provide the `code` you were sent." }, { status: 400 });

  const challenge = getChallenge(agentId);
  if (!challenge) {
    return NextResponse.json(
      { error: "No verification is in progress. Request a new code." },
      { status: 409 },
    );
  }

  const result = checkChallenge(challenge, code);
  if (!result.ok) {
    if (result.exhausted) clearChallenge(agentId);
    return NextResponse.json({ verified: false, error: result.error }, { status: 400 });
  }

  // An address inside a domain that is itself verified here earns the domain
  // tier: the employer proved the domain, this person proved an address in it.
  const attestation = levelForEmail(challenge.address, domainIsVerified);
  clearChallenge(agentId);
  const updated = setAttestation(agentId, attestation.level, attestation);

  return NextResponse.json({ verified: true, attestation: updated?.card.attestation });
}
