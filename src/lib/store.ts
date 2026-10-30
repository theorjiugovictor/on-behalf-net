/**
 * Process-local state.
 *
 * Deliberately in-memory: a demo runs in one process and restarting it should
 * reset the floor. Everything funnels through this module so that swapping in
 * Postgres or Redis later is a change to one file, not a hunt through routes.
 *
 * The globalThis cache keeps state alive across Next.js dev hot reloads.
 */

import type { LocalAgent, AgentCard, AttestationLevel, Thread } from "./types";
import type { Challenge } from "./attestation";
import { SCENARIOS, seedAgents, seedInitialThreads, type Scenario } from "./seed";

type Store = {
  agents: Map<string, LocalAgent>;
  /** Cards of agents we do not host, learned from inbound messages. */
  foreignCards: Map<string, AgentCard>;
  /** Scenarios available on the trading floor (seeded + user-created). */
  scenarios: Map<string, Scenario>;
  threads: Map<string, Thread>;
  /**
   * Contact details, keyed by agent id, and the only place they live. These
   * never reach an agent card: a card is public, and an address on it would be
   * scraped. Kept in a separate map so that serialising an agent cannot leak
   * one by accident.
   */
  contacts: Map<string, { email?: string }>;
  /** In-flight verification challenges, keyed by agent id. */
  challenges: Map<string, Challenge>;
  /** Seen message nonces for replay attack prevention. */
  seenNonces: Set<string>;
};

declare global {
  // eslint-disable-next-line no-var
  var __obnStore: Store | undefined;
}

function create(): Store {
  const store: Store = {
    agents: new Map(),
    foreignCards: new Map(),
    scenarios: new Map(),
    threads: new Map(),
    contacts: new Map(),
    challenges: new Map(),
    seenNonces: new Set(),
  };
  for (const agent of seedAgents()) store.agents.set(agent.card.id, agent);
  for (const scenario of SCENARIOS) store.scenarios.set(scenario.id, scenario);
  for (const t of seedInitialThreads(store.agents)) store.threads.set(t.id, t);
  return store;
}

const store: Store = globalThis.__obnStore ?? (globalThis.__obnStore = create());
if (
  !store.scenarios ||
  store.agents.get("obn:meridian-coldchain")?.mandate.subject !== "reefer-lane-stockholm-copenhagen"
) {
  store.scenarios = store.scenarios ?? new Map();
  for (const agent of seedAgents()) store.agents.set(agent.card.id, agent);
  for (const scenario of SCENARIOS) store.scenarios.set(scenario.id, scenario);
}
if (!store.threads.has("thr_seed_freight_oresund")) {
  for (const t of seedInitialThreads(store.agents)) store.threads.set(t.id, t);
}

// --- agents & scenarios ---------------------------------------------------

export const getAgent = (id: string) => store.agents.get(id);
export const listAgents = () => [...store.agents.values()];
export const putAgent = (agent: LocalAgent) => void store.agents.set(agent.card.id, agent);
export const listScenarios = () => [...store.scenarios.values()];
export const putScenario = (scenario: Scenario) => void store.scenarios.set(scenario.id, scenario);

/**
 * Learn an agent we do not host.
 *
 * A card is self-published, so the `attestation` on it is a *claim*, not a
 * proof — a stranger can write `level: "domain"` as easily as anything else.
 * Whatever they assert is therefore discarded and replaced with what this node
 * has actually established, which for a foreign agent is nothing.
 *
 * Verifying a foreign domain is possible (fetch their well-known file) but it is
 * a network call per unknown sender, so it belongs in a background pass rather
 * than on the inbound path. Until that exists, foreign agents are unverified and
 * counterparties are told so.
 */
export const rememberForeignCard = (card: AgentCard) =>
  void store.foreignCards.set(card.id, {
    ...card,
    attestation: {
      level: "none",
      note: "Self-asserted. This node has not verified it.",
    },
  });
export const getForeignCard = (id: string) => store.foreignCards.get(id);

/** Resolve a card for any agent id, hosted or foreign. */
export function getCard(id: string): AgentCard | undefined {
  return store.agents.get(id)?.card ?? store.foreignCards.get(id);
}

export const isLocal = (id: string) => store.agents.has(id);

// --- attestation ----------------------------------------------------------

/** Private. Never returned from a route that serves a card. */
export const setContact = (agentId: string, contact: { email?: string }) =>
  void store.contacts.set(agentId, { ...store.contacts.get(agentId), ...contact });

export const getContact = (agentId: string) => store.contacts.get(agentId);

export const putChallenge = (challenge: Challenge) =>
  void store.challenges.set(challenge.agentId, challenge);

export const getChallenge = (agentId: string) => store.challenges.get(agentId);

export const clearChallenge = (agentId: string) => void store.challenges.delete(agentId);

/**
 * Whether some agent on this node has proved control of `domain`. Used to
 * promote an email address at that domain to the domain tier.
 */
export function domainIsVerified(domain: string): boolean {
  const needle = domain.trim().toLowerCase();
  if (!needle) return false;
  for (const agent of store.agents.values()) {
    const { attestation } = agent.card;
    if (attestation.level === "domain" && attestation.domain?.toLowerCase() === needle) return true;
  }
  return false;
}

/** Raise an agent's attestation. Never lowers one: verification is monotonic. */
export function setAttestation(agentId: string, level: AttestationLevel, patch: Partial<AgentCard["attestation"]> = {}) {
  const agent = store.agents.get(agentId);
  if (!agent) return undefined;
  agent.card.attestation = { ...agent.card.attestation, ...patch, level };
  return agent;
}

// --- threads --------------------------------------------------------------

export const getThread = (id: string) => store.threads.get(id);
export const listThreads = () =>
  [...store.threads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export function putThread(thread: Thread) {
  thread.updatedAt = new Date().toISOString();
  store.threads.set(thread.id, thread);
  return thread;
}

/** Threads parked on a human decision, newest first. */
export const listPendingApprovals = () =>
  listThreads().filter((t) => t.status === "awaiting-approval");

/** Test/demo helper: wipe threads without disturbing registered agents. */
export function resetThreads() {
  store.threads.clear();
}

// --- replay protection ---------------------------------------------------

export const hasSeenNonce = (nonce: string) => store.seenNonces.has(nonce);
export const recordNonce = (nonce: string) => void store.seenNonces.add(nonce);
export const resetNonces = () => store.seenNonces.clear();
