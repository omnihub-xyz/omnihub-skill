import { fileURLToPath } from "node:url";

import { requireChain } from "../integrations/omnihub/chains.js";
import { omnihubGet } from "../integrations/omnihub/client.js";
import type { CollectionHolder, HoldersResponse } from "../integrations/omnihub/types.js";

export interface HoldersResult {
  chain: string;
  address: string;
  page: number;
  holders: CollectionHolder[];
}

/**
 * `chain` must be the alias from `/api/chains` (use `resolveChain`/`requireChain`
 * to get it from raw user input).
 */
export async function getCollectionHolders(
  chain: string,
  address: string,
  page = 1,
): Promise<HoldersResult> {
  if (!chain || !address) {
    throw new Error("getCollectionHolders requires both chain alias and contract address");
  }

  const data = await omnihubGet<HoldersResponse>(`/collections/${chain}/${address}/holders`, {
    page: String(page),
  });

  return { chain, address, page, holders: data.holders };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();
  const address = process.env.OMNIHUB_ADDRESS?.trim();
  const page = Number(process.env.OMNIHUB_PAGE ?? "1");

  if (!chainInput || !address) {
    console.error(
      "Usage: OMNIHUB_CHAIN=<chain> OMNIHUB_ADDRESS=<0x…> npm run omnihub:holders\n" +
        "OMNIHUB_CHAIN accepts chain names, aliases, or IDs (resolved via /api/chains)",
    );
    process.exit(1);
  }

  const resolved = await requireChain(chainInput);
  const result = await getCollectionHolders(resolved.alias, address, page);

  console.log(`Holders for [${result.chain}] ${result.address}  (page ${result.page})\n`);

  if (result.holders.length === 0) {
    console.log("  No holders recorded.");
  } else {
    for (const h of result.holders) {
      console.log(`  ${h.address}  qty=${h.quantity}  ts=${h.timestamp}`);
    }
  }
}
