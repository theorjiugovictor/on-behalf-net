/**
 * Process & `/tmp`-persisted state.
 *
 * Persists automatically to `/tmp/obn-store-v3.json` so state survives across
 * Next.js route worker bundles and warm serverless invocations, and also
 * supports client-side bundle hydration (`importClientBundle`) so newly
 * created agents never vanish across cold serverless instances on Vercel.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LocalAgent, AgentCard, AttestationLevel, Thread } from "./types";
import type { Challenge } from "./attestation";
import { SCENARIOS, seedAgents, seedInitialThreads, type Scenario } from "./seed";

const SNAPSHOT_FILE = path.join(os.tmpdir(), "obn-store-v3.json");

type Store = {
  agents: Map<string, LocalAgent>;
  /** Cards of agents we do not host, learned from inbound messages. */
  foreignCards: Map<string, AgentCard>;
  /** Scenarios available on the trading floor (seeded + user-created). */
  scenarios: Map<string, Scenario>;
  threads: Map<string, Thread>;
  /** Private contact details, keyed by agent id. */
  contacts: Map<string, { email?: string }>;
  /** In-flight verification challenges, keyed by agent id. */
  challenges: Map<string, Challenge>;
  /** Seen message nonces for replay attack prevention. */
  seenNonces: Set<string>;
  lastLoadedMtime: number;
};

type SerializedStore = {
  agents: [string, LocalAgent][];
  foreignCards: [string, AgentCard][];
  scenarios: [string, Scenario][];
  threads: [string, Thread][];
  contacts: [string, { email?: string }][];
  challenges: [string, Challenge][];
  seenNonces: string[];
};

export type ClientSyncBundle = {
  agents?: LocalAgent[];
  scenarios?: Scenario[];
  threads?: Thread[];
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
    lastLoadedMtime: 0,
  };
  for (const agent of seedAgents()) store.agents.set(agent.card.id, agent);
  for (const scenario of SCENARIOS) store.scenarios.set(scenario.id, scenario);
  for (const t of seedInitialThreads(store.agents)) store.threads.set(t.id, t);
  return store;
}

const store: Store = globalThis.__obnStore ?? (globalThis.__obnStore = create());

function loadFromDiskIfNewer() {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return;
    const stat = fs.statSync(SNAPSHOT_FILE);
    if (stat.mtimeMs <= store.lastLoadedMtime) return;
    const raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
    const data = JSON.parse(raw) as SerializedStore;
    if (Array.isArray(data.agents)) {
      for (const [k, v] of data.agents) store.agents.set(k, v);
    }
    if (Array.isArray(data.foreignCards)) {
      for (const [k, v] of data.foreignCards) store.foreignCards.set(k, v);
    }
    if (Array.isArray(data.scenarios)) {
      for (const [k, v] of data.scenarios) store.scenarios.set(k, v);
    }
    if (Array.isArray(data.threads)) {
      for (const [k, v] of data.threads) store.threads.set(k, v);
    }
    if (Array.isArray(data.contacts)) {
      for (const [k, v] of data.contacts) store.contacts.set(k, v);
    }
    if (Array.isArray(data.challenges)) {
      for (const [k, v] of data.challenges) store.challenges.set(k, v);
    }
    if (Array.isArray(data.seenNonces)) {
      for (const n of data.seenNonces) store.seenNonces.add(n);
    }
    store.lastLoadedMtime = stat.mtimeMs;
  } catch {
    // ignore disk read errors in restricted environments
  }
}

function saveToDisk() {
  try {
    const payload: SerializedStore = {
      agents: [...store.agents.entries()],
      foreignCards: [...store.foreignCards.entries()],
      scenarios: [...store.scenarios.entries()],
      threads: [...store.threads.entries()],
      contacts: [...store.contacts.entries()],
      challenges: [...store.challenges.entries()],
      seenNonces: [...store.seenNonces.values()],
    };
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload), "utf8");
    const stat = fs.statSync(SNAPSHOT_FILE);
    store.lastLoadedMtime = stat.mtimeMs;
  } catch {
    // ignore disk write errors
  }
}

loadFromDiskIfNewer();

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

/** Merge a client-cached bundle of user-created agents/scenarios/threads into the store. */
export function importClientBundle(bundle: ClientSyncBundle) {
  loadFromDiskIfNewer();
  let changed = false;
  if (Array.isArray(bundle.agents)) {
    for (const a of bundle.agents) {
      if (a?.card?.id && !store.agents.has(a.card.id)) {
        store.agents.set(a.card.id, a);
        changed = true;
      }
    }
  }
  if (Array.isArray(bundle.scenarios)) {
    for (const s of bundle.scenarios) {
      if (s?.id && !store.scenarios.has(s.id)) {
        store.scenarios.set(s.id, s);
        changed = true;
      }
    }
  }
  if (Array.isArray(bundle.threads)) {
    for (const t of bundle.threads) {
      if (!t?.id) continue;
      const existing = store.threads.get(t.id);
      if (
        !existing ||
        t.turns.length > existing.turns.length ||
        (t.status !== existing.status && existing.status !== "accepted")
      ) {
        store.threads.set(t.id, t);
        changed = true;
      }
    }
  }
  if (changed) saveToDisk();
}

// --- agents & scenarios ---------------------------------------------------

export const getAgent = (id: string) => {
  loadFromDiskIfNewer();
  return store.agents.get(id);
};

export const listAgents = () => {
  loadFromDiskIfNewer();
  return [...store.agents.values()];
};

export const putAgent = (agent: LocalAgent) => {
  loadFromDiskIfNewer();
  store.agents.set(agent.card.id, agent);
  saveToDisk();
};

export const listScenarios = () => {
  loadFromDiskIfNewer();
  return [...store.scenarios.values()];
};

export const putScenario = (scenario: Scenario) => {
  loadFromDiskIfNewer();
  store.scenarios.set(scenario.id, scenario);
  saveToDisk();
};

export const rememberForeignCard = (card: AgentCard) => {
  loadFromDiskIfNewer();
  store.foreignCards.set(card.id, {
    ...card,
    attestation: {
      level: "none",
      note: "Self-asserted. This node has not verified it.",
    },
  });
  saveToDisk();
};

export const getForeignCard = (id: string) => {
  loadFromDiskIfNewer();
  return store.foreignCards.get(id);
};

/** Resolve a card for any agent id, hosted or foreign. */
export function getCard(id: string): AgentCard | undefined {
  loadFromDiskIfNewer();
  return store.agents.get(id)?.card ?? store.foreignCards.get(id);
}

export const isLocal = (id: string) => {
  loadFromDiskIfNewer();
  return store.agents.has(id);
};

// --- attestation ----------------------------------------------------------

/** Private. Never returned from a route that serves a card. */
export const setContact = (agentId: string, contact: { email?: string }) => {
  loadFromDiskIfNewer();
  store.contacts.set(agentId, { ...store.contacts.get(agentId), ...contact });
  saveToDisk();
};

export const getContact = (agentId: string) => {
  loadFromDiskIfNewer();
  return store.contacts.get(agentId);
};

export const putChallenge = (challenge: Challenge) => {
  loadFromDiskIfNewer();
  store.challenges.set(challenge.agentId, challenge);
  saveToDisk();
};

export const getChallenge = (agentId: string) => {
  loadFromDiskIfNewer();
  return store.challenges.get(agentId);
};

export const clearChallenge = (agentId: string) => {
  loadFromDiskIfNewer();
  store.challenges.delete(agentId);
  saveToDisk();
};

export function domainIsVerified(domain: string): boolean {
  loadFromDiskIfNewer();
  const needle = domain.trim().toLowerCase();
  if (!needle) return false;
  for (const agent of store.agents.values()) {
    const { attestation } = agent.card;
    if (attestation.level === "domain" && attestation.domain?.toLowerCase() === needle) return true;
  }
  return false;
}

export function setAttestation(
  agentId: string,
  level: AttestationLevel,
  patch: Partial<AgentCard["attestation"]> = {},
) {
  loadFromDiskIfNewer();
  const agent = store.agents.get(agentId);
  if (!agent) return undefined;
  agent.card.attestation = { ...agent.card.attestation, ...patch, level };
  saveToDisk();
  return agent;
}

// --- threads --------------------------------------------------------------

export const getThread = (id: string) => {
  loadFromDiskIfNewer();
  return store.threads.get(id);
};

export const listThreads = () => {
  loadFromDiskIfNewer();
  return [...store.threads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export function putThread(thread: Thread) {
  loadFromDiskIfNewer();
  thread.updatedAt = new Date().toISOString();
  store.threads.set(thread.id, thread);
  saveToDisk();
  return thread;
}

/** Threads parked on a human decision, newest first. */
export const listPendingApprovals = () =>
  listThreads().filter((t) => t.status === "awaiting-approval");

/** Test/demo helper: wipe threads without disturbing registered agents. */
export function resetThreads() {
  store.threads.clear();
  saveToDisk();
}

// --- replay protection ---------------------------------------------------

export const hasSeenNonce = (nonce: string) => {
  loadFromDiskIfNewer();
  return store.seenNonces.has(nonce);
};

export const recordNonce = (nonce: string) => {
  loadFromDiskIfNewer();
  store.seenNonces.add(nonce);
  saveToDisk();
};

export const resetNonces = () => {
  store.seenNonces.clear();
  saveToDisk();
};
