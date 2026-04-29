import { fileURLToPath } from "node:url";

import { lifiGet } from "../../integrations/lifi/client.js";
import type { LifiToolInfo, LifiToolsResponse } from "../../integrations/lifi/types.js";

export type { LifiToolInfo };

export interface LifiTools {
  bridges: LifiToolInfo[];
  exchanges: LifiToolInfo[];
}

let toolsCache: LifiTools | undefined;

export async function getLifiTools(): Promise<LifiTools> {
  if (toolsCache) return toolsCache;

  const response = await lifiGet<LifiToolsResponse>("/tools");

  if (!Array.isArray(response.bridges) || !Array.isArray(response.exchanges)) {
    throw new Error("LI.FI /tools returned an unexpected shape");
  }

  toolsCache = {
    bridges: response.bridges,
    exchanges: response.exchanges,
  };

  return toolsCache;
}

export async function getBridgeKeys(): Promise<string[]> {
  const tools = await getLifiTools();
  return tools.bridges.map((b) => b.key);
}

export async function getExchangeKeys(): Promise<string[]> {
  const tools = await getLifiTools();
  return tools.exchanges.map((e) => e.key);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tools = await getLifiTools();
  console.log(`LI.FI bridges (${tools.bridges.length}):`);
  for (const b of tools.bridges) {
    console.log(`  ${b.key.padEnd(24)}  ${b.name}`);
  }
  console.log(`\nLI.FI exchanges (${tools.exchanges.length}):`);
  for (const e of tools.exchanges) {
    console.log(`  ${e.key.padEnd(24)}  ${e.name}`);
  }
}
