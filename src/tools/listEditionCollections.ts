import { fileURLToPath } from "node:url";

import {
  listSupportedChains,
  requireChain,
  toDiscoverBucket,
} from "../integrations/omnihub/chains.js";
import { omnihubGet } from "../integrations/omnihub/client.js";
import type { CollectionSummary, EditionsResponse } from "../integrations/omnihub/types.js";

export interface EditionResult {
  bucket: "mainnets" | "testnets";
  topOfTheDay: CollectionSummary[];
  topOfTheWeek: CollectionSummary[];
  topOfTheMonth: CollectionSummary[];
  topOfAllTime: CollectionSummary[];
  newCollections: CollectionSummary[];
  topHoldersCollections: CollectionSummary[];
  topMintsCollections: CollectionSummary[];
}

/**
 * `chainOrBucket` accepts a chain alias OR `"mainnets"`/`"testnets"` —
 * a concrete alias is collapsed to its bucket via the chain registry,
 * since `/collections/discover/editions` only accepts the buckets.
 */
export async function listEditionCollections(
  chainOrBucket = "mainnets",
  page = 1,
): Promise<EditionResult> {
  const bucket = await toDiscoverBucket(chainOrBucket);
  const data = await omnihubGet<EditionsResponse>("/collections/discover/editions", {
    chain: bucket,
    page: String(page),
  });
  return {
    bucket,
    topOfTheDay: data.topOfTheDay ?? [],
    topOfTheWeek: data.topOfTheWeek ?? [],
    topOfTheMonth: data.topOfTheMonth ?? [],
    topOfAllTime: data.topOfAllTime ?? [],
    newCollections: data.newCollections ?? [],
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

  const result = await listEditionCollections(chainOrBucket, page);
  console.log(`Edition collections  bucket=${result.bucket}  page=${page}\n`);
  console.log(`  top of day:     ${result.topOfTheDay.length} items`);
  console.log(`  top of week:    ${result.topOfTheWeek.length} items`);
  console.log(`  top of month:   ${result.topOfTheMonth.length} items`);
  console.log(`  top all time:   ${result.topOfAllTime.length} items`);
  console.log(`  new:            ${result.newCollections.length} items`);
  console.log(`  top holders:    ${result.topHoldersCollections.length} items`);
  console.log(`  top mints:      ${result.topMintsCollections.length} items`);

  const sample = [
    ...result.topMintsCollections,
    ...result.topOfTheWeek,
    ...result.newCollections,
  ].slice(0, 5);
  for (const c of sample) {
    console.log(`\n  [${c.chain}] ${c.address}  holders=${c.holders}  mints=${c.mints}`);
  }

  if (sample.length === 0) {
    console.log("\n  No edition collections returned for this bucket.");
    const chains = await listSupportedChains();
    const mainnets = chains.filter((c) => !c.testnet).length;
    const testnets = chains.filter((c) => c.testnet).length;
    console.log(`  (${mainnets} mainnets and ${testnets} testnets available via /api/chains)`);
  }
}
