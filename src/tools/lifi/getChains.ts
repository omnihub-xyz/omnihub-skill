import { fileURLToPath } from "node:url";

import { lifiGet } from "../../integrations/lifi/client.js";
import type { LifiChain, LifiChainsResponse } from "../../integrations/lifi/types.js";

export type { LifiChain };

let chainsCache: LifiChain[] | undefined;

export async function getLifiChains(): Promise<LifiChain[]> {
  if (chainsCache) return chainsCache;

  const response = await lifiGet<LifiChainsResponse>("/chains");

  if (!Array.isArray(response.chains)) {
    throw new Error("LI.FI /chains returned an unexpected shape");
  }

  chainsCache = response.chains;
  return chainsCache;
}

export async function resolveChainById(chainId: number): Promise<LifiChain | undefined> {
  const chains = await getLifiChains();
  return chains.find((c) => c.id === chainId);
}

export async function resolveChainByKey(key: string): Promise<LifiChain | undefined> {
  const chains = await getLifiChains();
  return chains.find((c) => c.key === key);
}

export async function resolveChainByName(name: string): Promise<LifiChain | undefined> {
  const chains = await getLifiChains();
  return chains.find((c) => c.name === name);
}

/** Returns `undefined` for ambiguous matches rather than guessing one. */
export async function resolveChainByPartialName(partial: string): Promise<LifiChain | undefined> {
  const chains = await getLifiChains();
  const lower = partial.toLowerCase();
  const matches = chains.filter((c) => c.name.toLowerCase().includes(lower));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Resolution order: chain ID → key → exact name → unambiguous partial name.
 * Ambiguous partial matches resolve to `undefined` to avoid silent wrong-chain dispatch.
 */
export async function resolveChain(input: string | number): Promise<LifiChain | undefined> {
  if (typeof input === "number") return resolveChainById(input);

  const asNumber = Number(input);
  if (!isNaN(asNumber) && Number.isInteger(asNumber)) {
    const byId = await resolveChainById(asNumber);
    if (byId) return byId;
  }

  const byKey = await resolveChainByKey(input);
  if (byKey) return byKey;

  const byName = await resolveChainByName(input);
  if (byName) return byName;

  return resolveChainByPartialName(input);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chains = await getLifiChains();
  console.log(`LI.FI supported chains (${chains.length}):`);
  for (const c of chains) {
    console.log(`  ${String(c.id).padStart(8)}  ${c.key.padEnd(12)}  ${c.name}`);
  }
}
