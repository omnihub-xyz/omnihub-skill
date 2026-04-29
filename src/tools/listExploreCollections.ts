import { fileURLToPath } from "node:url";

import { requireChain } from "../integrations/omnihub/chains.js";
import { omnihubGet } from "../integrations/omnihub/client.js";
import type { CollectionSummary, ExploreResponse } from "../integrations/omnihub/types.js";

export interface ExploreParams {
  /** Chain alias, `"all"`, or `"mainnets"`/`"testnets"`. Defaults to `"all"`. */
  chain?: string;
  page?: number;
  timeframe?: string;
  /** `"new"` is the only sort value confirmed to work against the live API. */
  sort?: string;
  type?: string;
}

export interface ExploreResult {
  collections: CollectionSummary[];
  page: number;
  lastPage: number;
  total: number;
}

export async function listExploreCollections(params: ExploreParams = {}): Promise<ExploreResult> {
  const chain = params.chain ?? "all";
  const timeframe = params.timeframe ?? "7d";
  const sort = params.sort ?? "new";
  const page = params.page ?? 1;

  const query: Record<string, string> = {
    page: String(page),
    chain,
    timeframe,
    sort,
  };
  if (params.type) query.type = params.type;

  const data = await omnihubGet<ExploreResponse>("/collections/explore", query);

  return {
    collections: data.collections.data,
    page: data.collections.meta.currentPage,
    lastPage: data.collections.meta.lastPage,
    total: data.collections.meta.total,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();
  const timeframe = process.env.OMNIHUB_TIMEFRAME ?? "7d";
  const sort = process.env.OMNIHUB_SORT ?? "new";
  const type = process.env.OMNIHUB_TYPE;
  const page = Number(process.env.OMNIHUB_PAGE ?? "1");

  let chain = "all";
  if (chainInput && chainInput !== "all") {
    const resolved = await requireChain(chainInput);
    chain = resolved.alias;
  }

  const result = await listExploreCollections({ page, chain, timeframe, sort, type });
  console.log(`Explore collections  chain=${chain}  timeframe=${timeframe}  sort=${sort}`);
  console.log(`Page ${result.page} of ${result.lastPage} (${result.total} total)\n`);
  for (const c of result.collections) {
    console.log(`  [${c.chain}] ${c.address}  holders=${c.holders}  mints=${c.mints}`);
  }
}
