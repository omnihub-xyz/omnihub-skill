/**
 * Token list cached per chain. Native gas tokens are normalized to the zero
 * address — LI.FI's canonical representation for the native asset.
 */

import { fileURLToPath } from "node:url";

import { lifiGet } from "../../integrations/lifi/client.js";
import type { LifiToken, LifiTokensResponse } from "../../integrations/lifi/types.js";

export type { LifiToken };

/** LI.FI represents the native gas token as the zero address. */
export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

const tokenCache = new Map<string, LifiToken[]>();

export async function getLifiTokens(chainId?: number): Promise<LifiToken[]> {
  const cacheKey = chainId !== undefined ? String(chainId) : "all";

  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!;
  }

  const params: Record<string, string | number | undefined> = {};
  if (chainId !== undefined) params.chains = chainId;

  const response = await lifiGet<LifiTokensResponse>("/tokens", params);

  if (!response.tokens || typeof response.tokens !== "object") {
    throw new Error("LI.FI /tokens returned an unexpected shape");
  }

  const all: LifiToken[] = Object.values(response.tokens).flat();

  const normalized = all.map((t) => ({
    ...t,
    address: t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS ? NATIVE_TOKEN_ADDRESS : t.address,
  }));

  tokenCache.set(cacheKey, normalized);

  if (chainId !== undefined) {
    /** Seed the all-chains cache only when empty — never overwrite a prior full fetch. */
    if (!tokenCache.has("all")) {
      const existing = tokenCache.get("all") ?? [];
      const merged = [...existing, ...normalized].filter(
        (t, i, arr) =>
          arr.findIndex((x) => x.address === t.address && x.chainId === t.chainId) === i,
      );
      tokenCache.set("all", merged);
    }
  }

  return normalized;
}

export async function resolveTokenByAddress(
  address: string,
  chainId: number,
): Promise<LifiToken | undefined> {
  const tokens = await getLifiTokens(chainId);
  const lower = address.toLowerCase();
  return tokens.find((t) => t.chainId === chainId && t.address.toLowerCase() === lower);
}

/** Returns `undefined` for ambiguous symbol matches rather than guessing. */
export async function resolveTokenBySymbol(
  symbol: string,
  chainId: number,
): Promise<LifiToken | undefined> {
  const tokens = await getLifiTokens(chainId);
  const upper = symbol.toUpperCase();
  const matches = tokens.filter((t) => t.chainId === chainId && t.symbol.toUpperCase() === upper);
  return matches.length === 1 ? matches[0] : undefined;
}

export async function resolveNativeToken(chainId: number): Promise<LifiToken | undefined> {
  return resolveTokenByAddress(NATIVE_TOKEN_ADDRESS, chainId);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chainIdStr = process.env.LIFI_CHAIN_ID;
  const chainId = chainIdStr ? Number(chainIdStr) : undefined;
  const tokens = await getLifiTokens(chainId);
  const label = chainId !== undefined ? `chain ${chainId}` : "all chains";
  console.log(`LI.FI tokens for ${label}: ${tokens.length}`);
  const sample = tokens.slice(0, 10);
  for (const t of sample) {
    console.log(`  [${t.chainId}] ${t.symbol.padEnd(10)}  ${t.address}  ${t.name}`);
  }
  if (tokens.length > 10) {
    console.log(`  ... and ${tokens.length - 10} more`);
  }
}
