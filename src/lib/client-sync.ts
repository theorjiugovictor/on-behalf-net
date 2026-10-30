import type { LocalAgent, Thread } from "./types";
import type { Scenario } from "./seed";

const BUNDLE_KEY = "obn_sync_bundle_v1";

export type StoredBundle = {
  agents: LocalAgent[];
  scenarios: Scenario[];
  threads: Thread[];
};

function readBundle(): StoredBundle {
  if (typeof window === "undefined") return { agents: [], scenarios: [], threads: [] };
  try {
    const raw = localStorage.getItem(BUNDLE_KEY);
    if (!raw) return { agents: [], scenarios: [], threads: [] };
    const parsed = JSON.parse(raw) as Partial<StoredBundle>;
    return {
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
      threads: Array.isArray(parsed.threads) ? parsed.threads : [],
    };
  } catch {
    return { agents: [], scenarios: [], threads: [] };
  }
}

export function saveClientBundle(patch: Partial<StoredBundle>) {
  if (typeof window === "undefined") return;
  try {
    const current = readBundle();
    const agentMap = new Map(current.agents.map((a) => [a.card.id, a]));
    for (const a of patch.agents ?? []) {
      if (a?.card?.id) agentMap.set(a.card.id, a);
    }

    const scenarioMap = new Map(current.scenarios.map((s) => [s.id, s]));
    for (const s of patch.scenarios ?? []) {
      if (s?.id) scenarioMap.set(s.id, s);
    }

    const threadMap = new Map(current.threads.map((t) => [t.id, t]));
    for (const t of patch.threads ?? []) {
      if (t?.id) threadMap.set(t.id, t);
    }

    const next: StoredBundle = {
      agents: [...agentMap.values()],
      scenarios: [...scenarioMap.values()],
      threads: [...threadMap.values()],
    };
    localStorage.setItem(BUNDLE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

export async function syncClientBundleToServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const bundle = readBundle();
  if (
    bundle.agents.length === 0 &&
    bundle.scenarios.length === 0 &&
    bundle.threads.length === 0
  ) {
    return;
  }
  try {
    await fetch("/api/agents/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle),
    });
  } catch {
    // ignore network errors
  }
}

