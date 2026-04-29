/**
 * OmniHub chain registry.
 *
 * `/api/chains` is the single source of truth for chain alias, chain ID,
 * testnet flag, and RPC URLs. Never hardcode any of these — fetch from the
 * registry so the integration stays in sync when networks are added or
 * removed. Of the API-supplied fields, only `alias` is used in URL
 * construction; `name`/`description`/etc. are display-only and untrusted.
 */

import { omnihubGet } from "./client.js";

export interface OmniChain {
  name: string;
  id: number;
  alias: string;
  rpc: string[];
  testnet: boolean;
  faucet?: boolean;
  factory?: string;
}

let _chainCache: OmniChain[] | null = null;

const _rpcCache = new Map<string, string>();

export async function listSupportedChains(): Promise<OmniChain[]> {
  if (_chainCache) return _chainCache;
  const data = await omnihubGet<OmniChain[]>("/api/chains");
  _chainCache = data;
  return _chainCache;
}

export async function refreshChainRegistry(): Promise<OmniChain[]> {
  _chainCache = null;
  _rpcCache.clear();
  return listSupportedChains();
}

export function flushChainCache(): void {
  _chainCache = null;
  _rpcCache.clear();
}

/** True only if the endpoint responds AND reports the expected chain ID. */
async function probeRpc(url: string, expectedChainId: number): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { result?: string };
    const chainId = parseInt(data.result ?? "0x0", 16);
    return chainId === expectedChainId;
  } catch {
    return false;
  }
}

/**
 * Resolve a working RPC URL for `chain`. Tries the session cache first, then
 * probes each `chain.rpc` entry in order and returns the first healthy one.
 * RPCs come exclusively from `/api/chains` — never from env vars.
 */
export async function resolveRpcForChain(chain: OmniChain): Promise<string> {
  const cached = _rpcCache.get(chain.alias);
  if (cached) return cached;

  const candidates = chain.rpc ?? [];
  for (const url of candidates) {
    if (await probeRpc(url, chain.id)) {
      _rpcCache.set(chain.alias, url);
      return url;
    }
  }

  throw new Error(
    `No working RPC found for ${chain.name} (chain ID ${chain.id}). ` +
      (candidates.length > 0
        ? `Tried ${candidates.length} endpoint(s): ${candidates.map((u) => new URL(u).hostname).join(", ")}. `
        : `No RPC endpoints are listed for this chain in /api/chains. `) +
      `The chain registry entry may be stale — retry later.`,
  );
}

/**
 * Maps user-facing phrases to the canonical `OmniChain.name` from `/api/chains`
 * (matched case-insensitively). Keep entries conservative — only add phrases
 * that unambiguously identify one chain. Slang that could resolve to the wrong
 * network must never be added.
 */
const NL_TO_NAME: Record<string, string> = {
  eth: "ethereum",
  mainnet: "ethereum",
  "ethereum mainnet": "ethereum",
  arb: "arbitrum one",
  arbitrum: "arbitrum one",
  "arb one": "arbitrum one",
  op: "optimism",
  matic: "polygon",
  "polygon mainnet": "polygon",
  bnb: "bnb smart chain",
  bsc: "bnb smart chain",
  binance: "bnb smart chain",
  "binance smart chain": "bnb smart chain",
  "ape chain": "ape chain",
  apechain: "ape chain",
  "world chain": "world chain",
  worldchain: "world chain",
  "hyper evm": "hyper evm",
  hyperevm: "hyper evm",
  sei: "sei network",
  "sei network": "sei network",
};

/**
 * Resolve a chain name, alias, NL phrase, or numeric chain ID to a live
 * `OmniChain`. Returns `null` when no match is found.
 *
 * Resolution order: NL alias → exact alias → exact name → chain ID →
 * unambiguous partial. An ambiguous partial match returns `null` rather
 * than guessing.
 */
export async function resolveChain(input: string): Promise<OmniChain | null> {
  const chains = await listSupportedChains();
  const lower = input.toLowerCase().trim();

  const nlTarget = NL_TO_NAME[lower];
  if (nlTarget) {
    const byNL = chains.find((c) => c.name.toLowerCase() === nlTarget);
    if (byNL) return byNL;
  }

  const byAlias = chains.find((c) => c.alias.toLowerCase() === lower);
  if (byAlias) return byAlias;

  const byName = chains.find((c) => c.name.toLowerCase() === lower);
  if (byName) return byName;

  const asNumber = parseInt(lower, 10);
  if (!isNaN(asNumber)) {
    const byId = chains.find((c) => c.id === asNumber);
    if (byId) return byId;
  }

  const partial = chains.filter(
    (c) => c.name.toLowerCase().includes(lower) || c.alias.toLowerCase().includes(lower),
  );
  if (partial.length === 1) return partial[0];

  return null;
}

export async function requireChain(input: string): Promise<OmniChain> {
  const chain = await resolveChain(input);
  if (chain) return chain;

  const chains = await listSupportedChains();
  const lower = input.toLowerCase().trim();

  const suggestions = chains
    .filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.alias.toLowerCase().includes(lower) ||
        lower.includes(c.alias.toLowerCase()),
    )
    .slice(0, 5)
    .map((c) => `  ${c.alias}  (${c.name})`)
    .join("\n");

  const hint = suggestions
    ? `\nDid you mean one of:\n${suggestions}`
    : `\nRun "npm run omnihub:chains" to see all supported networks.`;

  throw new Error(`Unsupported network: "${input}".${hint}`);
}

/** Returns false for unknown aliases. */
export async function isTestnetChain(alias: string): Promise<boolean> {
  const chains = await listSupportedChains();
  return chains.find((c) => c.alias === alias)?.testnet ?? false;
}

/**
 * `/collections/discover/editions` and `/collections/discover/drops` only
 * accept the string `"mainnets"` or `"testnets"` — never a chain alias —
 * so a concrete alias is collapsed to its bucket here.
 */
export async function toDiscoverBucket(chainOrBucket: string): Promise<"mainnets" | "testnets"> {
  if (chainOrBucket === "mainnets" || chainOrBucket === "testnets") {
    return chainOrBucket;
  }
  const testnet = await isTestnetChain(chainOrBucket);
  return testnet ? "testnets" : "mainnets";
}
