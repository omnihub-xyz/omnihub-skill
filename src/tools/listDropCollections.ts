import { fileURLToPath } from "node:url";

import { requireChain, toDiscoverBucket } from "../integrations/omnihub/chains.js";
import { omnihubGet } from "../integrations/omnihub/client.js";
import type {
  CollectionSummary,
  DiscoverResponse,
  DropsResponse,
} from "../integrations/omnihub/types.js";

/**
 * Per-mode population:
 * - chain-specific mode populates `chain`, `newCollections`, `promotedDropCollections`
 * - cross-chain bucket mode populates `bucket`, `newCollections`,
 *   `topHoldersCollections`, `topMintsCollections`
 * The other fields are always present but empty in the opposite mode.
 */
export interface DropResult {
  chain: string | null;
  bucket: "mainnets" | "testnets" | null;
  newCollections: CollectionSummary[];
  promotedDropCollections: CollectionSummary[];
  topHoldersCollections: CollectionSummary[];
  topMintsCollections: CollectionSummary[];
}

/**
 * Routes a chain alias to `/collections/discover?chain=…` (per-chain drops)
 * and `"mainnets"`/`"testnets"` to `/collections/discover/drops` (cross-chain
 * rankings). The two endpoints return different shapes — see `DropResult`.
 */
export async function listDropCollections(
  chainOrBucket = "mainnets",
  page = 1,
): Promise<DropResult> {
  if (chainOrBucket !== "mainnets" && chainOrBucket !== "testnets") {
    const data = await omnihubGet<DiscoverResponse>("/collections/discover", {
      chain: chainOrBucket,
    });
    return {
      chain: chainOrBucket,
      bucket: null,
      newCollections: data.newCollections ?? [],
      promotedDropCollections: data.promotedDropCollections ?? [],
      topHoldersCollections: [],
      topMintsCollections: [],
    };
  }

  const data = await omnihubGet<DropsResponse>("/collections/discover/drops", {
    chain: chainOrBucket,
    page: String(page),
  });
  return {
    chain: null,
    bucket: chainOrBucket,
    newCollections: data.newCollections ?? [],
    promotedDropCollections: [],
    topHoldersCollections: data.topHoldersCollections ?? [],
    topMintsCollections: data.topMintsCollections ?? [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim() ?? process.env.OMNIHUB_TYPE?.trim();
  const page = Number(process.env.OMNIHUB_PAGE ?? "1");

  let chainOrBucket = "mainnets";
  if (chainInput) {
    if (chainInput === "mainnets" || chainInput === "testnets") {
      chainOrBucket = chainInput;
    } else {
      const resolved = await requireChain(chainInput);
      chainOrBucket = resolved.alias;
    }
  }

  const result = await listDropCollections(chainOrBucket, page);

  if (result.chain) {
    console.log(`Drop collections  chain=${result.chain}\n`);
    console.log(`  promoted drops: ${result.promotedDropCollections.length} items`);
    console.log(`  new:            ${result.newCollections.length} items`);
    const sample = [...result.promotedDropCollections, ...result.newCollections].slice(0, 5);
    for (const c of sample) {
      console.log(`\n  [${c.chain}] ${c.address}  holders=${c.holders}  mints=${c.mints}`);
    }
  } else {
    console.log(`Drop collections  bucket=${result.bucket}  page=${page}\n`);
    console.log(`  new:          ${result.newCollections.length} items`);
    console.log(`  top holders:  ${result.topHoldersCollections.length} items`);
    console.log(`  top mints:    ${result.topMintsCollections.length} items`);
    const sample = [...result.topMintsCollections, ...result.newCollections].slice(0, 5);
    for (const c of sample) {
      console.log(`\n  [${c.chain}] ${c.address}  holders=${c.holders}  mints=${c.mints}`);
    }
  }
}
