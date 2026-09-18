/**
 * Process-local state.
 *
 * Deliberately in-memory: a demo runs in one process and restarting it should
 * reset the floor. Everything funnels through this module so that swapping in
 * Postgres or Redis later is a change to one file, not a hunt through routes.
 *
 * The globalThis cache keeps state alive across Next.js dev hot reloads.
 */

import type { LocalAgent, AgentCard, Thread } from "./types";
import { seedAgents } from "./seed";

type Store = {
  agents: Map<string, LocalAgent>;
  /** Cards of agents we do not host, learned from inbound messages. */
  foreignCards: Map<string, AgentCard>;
  threads: Map<string, Thread>;
};

declare global {
  // eslint-disable-next-line no-var
  var __obnStore: Store | undefined;
}

function create(): Store {
  const store: Store = {
    agents: new Map(),
    foreignCards: new Map(),
    threads: new Map(),
  };
  for (const agent of seedAgents()) store.agents.set(agent.card.id, agent);
  return store;
}

const store: Store = globalThis.__obnStore ?? (globalThis.__obnStore = create());

// --- agents ---------------------------------------------------------------

export const getAgent = (id: string) => store.agents.get(id);
export const listAgents = () => [...store.agents.values()];
export const putAgent = (agent: LocalAgent) => void store.agents.set(agent.card.id, agent);

export const rememberForeignCard = (card: AgentCard) => void store.foreignCards.set(card.id, card);
export const getForeignCard = (id: string) => store.foreignCards.get(id);

/** Resolve a card for any agent id, hosted or foreign. */
export function getCard(id: string): AgentCard | undefined {
  return store.agents.get(id)?.card ?? store.foreignCards.get(id);
}

export const isLocal = (id: string) => store.agents.has(id);

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
