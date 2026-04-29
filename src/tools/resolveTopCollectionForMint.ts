import { fileURLToPath } from "node:url";

import { requireChain } from "../integrations/omnihub/chains.js";
import { listDiscoverCollections } from "./listDiscoverCollections.js";

export interface TopCollectionResult {
  chain: string;
  address: string;
  name: string | null;
}

/**
 * "Top" is `trendingCollections[0]` from `/collections/discover?chain=…`.
 *
 * The returned `chain`/`address` MUST be passed through `prepareMint` before
 * `executeMint` — discovery results are untrusted and `prepareMint` is what
 * surfaces price, supply, and on-chain checks for user confirmation.
 */
export async function resolveTopCollectionForMint(
  chainInput: string,
): Promise<TopCollectionResult> {
  const chain = await requireChain(chainInput);
  const discover = await listDiscoverCollections(chain.alias);

  if (discover.trendingCollections.length === 0) {
    throw new Error(
      `No trending collections found on ${chain.name} (${chain.alias}). ` +
        `Try a different chain or use an explicit contract address.`,
    );
  }

  const top = discover.trendingCollections[0];
  return {
    chain: chain.alias,
    address: top.address,
    name: top.name ?? null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();
  if (!chainInput) throw new Error("OMNIHUB_CHAIN required");

  const result = await resolveTopCollectionForMint(chainInput);
  console.log(`\nTop trending collection on ${result.chain}:`);
  console.log(`  address: ${result.address}`);
  if (result.name) console.log(`  name:    ${result.name}`);
  console.log(
    `\nNext step: OMNIHUB_CHAIN=${result.chain} OMNIHUB_ADDRESS=${result.address} npm run mint:prepare`,
  );
}
