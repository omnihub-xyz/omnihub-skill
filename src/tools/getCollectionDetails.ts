import { fileURLToPath } from "node:url";

import { requireChain } from "../integrations/omnihub/chains.js";
import { omnihubGet } from "../integrations/omnihub/client.js";
import type { CollectionDetails } from "../integrations/omnihub/types.js";

/** Raw API shape; the `user` object is flattened so only safe fields leave this module. */
interface RawCollection extends Omit<CollectionDetails, "user"> {
  user: {
    id: number;
    address: string;
    username: string | null;
    nonce: string;
    rewards: string;
    email: string | null;
    website: string | null;
    bio: string | null;
    dailyStreak: number;
    lastStreakAt: string | null;
    createdAt: string;
    updatedAt: string;
    media: unknown[];
  };
}

/**
 * `chain` must be the alias from `/api/chains` (use `resolveChain`/`requireChain`
 * to get it from raw user input).
 */
export async function getCollectionDetails(
  chain: string,
  address: string,
): Promise<CollectionDetails> {
  if (!chain || !address) {
    throw new Error("getCollectionDetails requires both chain alias and contract address");
  }

  const raw = await omnihubGet<RawCollection>(`/collections/${chain}/${address}`);

  /** Strip PII-like creator fields (email, nonce, streak, etc.); keep only id + address. */
  return {
    id: raw.id,
    userId: raw.userId,
    alias: raw.alias,
    chain: raw.chain,
    type: raw.type,
    address: raw.address,
    name: raw.name,
    symbol: raw.symbol,
    description: raw.description,
    price: raw.price,
    supply: raw.supply,
    currentSupply: raw.currentSupply,
    mints: raw.mints,
    holders: raw.holders,
    links: raw.links,
    blockNumber: raw.blockNumber,
    banner: raw.banner,
    promoted: raw.promoted,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastMintAt: raw.lastMintAt,
    followTask: raw.followTask,
    retweetTask: raw.retweetTask,
    media: raw.media,
    user: {
      id: raw.user.id,
      address: raw.user.address,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();
  const address = process.env.OMNIHUB_ADDRESS?.trim();

  if (!chainInput || !address) {
    console.error(
      "Usage: OMNIHUB_CHAIN=<chain> OMNIHUB_ADDRESS=<0x…> npm run omnihub:collection\n" +
        "OMNIHUB_CHAIN accepts chain names, aliases, or IDs (resolved via /api/chains)",
    );
    process.exit(1);
  }

  const resolved = await requireChain(chainInput);
  const c = await getCollectionDetails(resolved.alias, address);

  console.log(`Collection: [${c.chain}] ${c.address}`);
  console.log(`  ID:           ${c.id}`);
  console.log(`  Type:         ${c.type}`);
  console.log(`  Price:        ${c.price}`);
  console.log(`  Supply:       ${c.supply}`);
  console.log(`  Current:      ${c.currentSupply}`);
  console.log(`  Mints:        ${c.mints}`);
  console.log(`  Holders:      ${c.holders}`);
  console.log(`  Block:        ${c.blockNumber}`);
  console.log(`  Creator:      ${c.user.address}`);
  console.log(`  Created at:   ${c.createdAt}`);
  console.log(`  Last mint at: ${c.lastMintAt ?? "never"}`);
  console.log(
    `\nNext step: OMNIHUB_CHAIN=${resolved.alias} OMNIHUB_ADDRESS=${address} npm run omnihub:holders`,
  );
}
