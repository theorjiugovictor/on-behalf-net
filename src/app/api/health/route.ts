/**
 * Config check. Worth hitting before you walk on stage: it says in one line
 * whether you are running live or on fallbacks.
 */

import { NextResponse } from "next/server";
import { modelConfigured, modelName } from "@/lib/llm";
import { searchConfigured } from "@/lib/tavily";
import { listAgents, listThreads } from "@/lib/store";
import { PROTOCOL } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const model = modelConfigured();
  const search = searchConfigured();
  return NextResponse.json({
    ok: true,
    protocol: PROTOCOL,
    nebius: { configured: model, model: model ? modelName() : null },
    tavily: { configured: search },
    mode: model && search ? "live" : model || search ? "partial" : "offline",
    note:
      model && search
        ? "Live: reasoning via Nebius, traversal via Tavily."
        : "Unconfigured services fall back to deterministic local behaviour. " +
          "The floor runs either way.",
    agents: listAgents().length,
    threads: listThreads().length,
  });
}
