import { fileURLToPath } from "node:url";

import { requireChain } from "../integrations/omnihub/chains.js";
import { omnihubGet } from "../integrations/omnihub/client.js";
import type { CollectionSummary, DiscoverResponse } from "../integrations/omnihub/types.js";

export interface DiscoverResult {
  chain: string | null;
  bannerCollections: CollectionSummary[];
  trendingCollections: CollectionSummary[];
  promotedEditionCollections: CollectionSummary[];
  promotedDropCollections: CollectionSummary[];
  newCollections: CollectionSummary[];
}

/**
 * Always pass a chain alias for meaningful results — the unfiltered call
 * currently returns empty arrays from the OmniHub backend.
 */
export async function listDiscoverCollections(chain?: string): Promise<DiscoverResult> {
  const params: Record<string, string> = {};
  if (chain) params.chain = chain;

  const data = await omnihubGet<DiscoverResponse>("/collections/discover", params);
  return {
    chain: chain ?? null,
    bannerCollections: data.bannerCollections ?? [],
    trendingCollections: data.trendingCollections ?? [],
    promotedEditionCollections: data.promotedEditionCollections ?? [],
    promotedDropCollections: data.promotedDropCollections ?? [],
    newCollections: data.newCollections ?? [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();

  let chain: string | undefined;
  if (chainInput) {
    const resolved = await requireChain(chainInput);
    chain = resolved.alias;
  }

  const result = await listDiscoverCollections(chain);
  const label = chain ? `chain=${chain}` : "no chain filter";
  console.log(`Discover collections  (${label})\n`);
  console.log(`  banner:            ${result.bannerCollections.length} items`);
  console.log(`  trending:          ${result.trendingCollections.length} items`);
  console.log(`  promoted editions: ${result.promotedEditionCollections.length} items`);
  console.log(`  promoted drops:    ${result.promotedDropCollections.length} items`);
  console.log(`  new:               ${result.newCollections.length} items`);

  for (const c of result.trendingCollections.slice(0, 5)) {
    console.log(`\n  [trending] [${c.chain}] ${c.address}  holders=${c.holders}  mints=${c.mints}`);
  }
  for (const c of result.newCollections.slice(0, 5)) {
    console.log(`\n  [new]      [${c.chain}] ${c.address}  holders=${c.holders}  mints=${c.mints}`);
  }
}
