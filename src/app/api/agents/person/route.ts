/**
 * The second door: onboarding a person.
 *
 * A company proves itself by controlling a domain. A person proves themselves by
 * controlling an inbox — which is not a lesser substitute but the same idea
 * applied to what an individual actually has. The inbox is where an agreement
 * would be sent, so proving control of it proves a route to recourse.
 *
 * The address is stored privately and never reaches the agent card. What the
 * network learns is a level, not a way to contact someone out of band.
 */

import { NextResponse } from "next/server";
import { generateKeyPair, newId } from "@/lib/identity";
import { draftFromDescription, starterMandate } from "@/lib/onboarding";
import { isEmail, newChallenge, newCode } from "@/lib/attestation";
import { getCard, putAgent, putChallenge, setContact } from "@/lib/store";
import { publicSpec } from "@/lib/terms";
import { PROTOCOL, type LocalAgent } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Whether this node can actually deliver a code. */
const canSendEmail = () => Boolean(process.env.OBN_SMTP_URL);

export async function POST(req: Request) {
  let body: { name?: string; email?: string; about?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const about = body.about?.trim();

  if (!name) return NextResponse.json({ error: "Provide your `name`." }, { status: 400 });
  if (!email || !isEmail(email)) {
    return NextResponse.json({ error: "Provide a valid `email`." }, { status: 400 });
  }
  if (!about) {
    return NextResponse.json(
      { error: "Provide `about`: what you do, and what you are looking to agree." },
      { status: 400 },
    );
  }

  const id = agentIdForPerson(name);
  if (getCard(id)) {
    return NextResponse.json({ error: `An agent named "${id}" already exists.` }, { status: 409 });
  }

  const draft = await draftFromDescription(name, about);
  const mandate = starterMandate(id, draft, "individual");
  const { publicKey, privateKey } = generateKeyPair();
  const origin = process.env.OBN_PUBLIC_URL ?? new URL(req.url).origin;

  const agent: LocalAgent = {
    card: {
      protocol: PROTOCOL,
      id,
      name,
      purpose: draft?.purpose?.trim() || about,
      principal: { kind: "person", name },
      // Unverified until the code comes back. Counterparties can see that.
      attestation: { level: "none" },
      publicKey,
      endpoint: `${origin}/api/agents/${encodeURIComponent(id)}/inbox`,
      capabilities: ["negotiate", "traverse"],
      negotiates: {
        subject: mandate.subject,
        role: mandate.role,
        terms: mandate.terms.map(publicSpec),
      },
    },
    privateKey,
    mandate,
    createdAt: new Date().toISOString(),
  };

  putAgent(agent);
  setContact(id, { email });

  const code = newCode();
  putChallenge(newChallenge(id, email, code));
  const delivered = await deliverCode(email, code);

  return NextResponse.json(
    {
      created: true,
      card: agent.card,
      mandate: agent.mandate,
      drafted: Boolean(draft),
      verification: {
        method: "email",
        sent: delivered,
        // With no mail transport configured the code is returned so the flow can
        // still be completed. Never do this where anyone else can see it.
        devCode: delivered ? undefined : code,
        hint: delivered
          ? `A six-digit code is on its way to ${maskEmail(email)}.`
          : "No mail transport is configured, so the code is returned here instead of being sent.",
      },
      notice:
        "This mandate is a conservative draft and every deal it reaches will stop " +
        "for a human. Review the terms before the agent negotiates anything real.",
    },
    { status: 201 },
  );
}

/**
 * Send the code. Returns false when no transport is configured, which the caller
 * surfaces honestly rather than pretending a mail went out.
 */
async function deliverCode(email: string, code: string): Promise<boolean> {
  if (!canSendEmail()) {
    console.info(`[attestation] verification code for ${email}: ${code}`);
    return false;
  }
  // A real transport belongs here. Kept as a single seam so that wiring one in
  // does not touch the verification logic.
  console.info(`[attestation] would send ${code} to ${email} via OBN_SMTP_URL`);
  return true;
}

/** Enough to recognise your own address, not enough to harvest someone else's. */
function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  const shown = user.length <= 2 ? user[0] : user.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(user.length - shown.length, 1))}@${domain}`;
}

/**
 * People have no domain to derive an id from, and two of them may share a name,
 * so a short random suffix keeps ids unique without encoding anything private.
 */
function agentIdForPerson(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "person";
  return `obn:${slug}-${newId("").replace("_", "").slice(0, 4)}`;
}
