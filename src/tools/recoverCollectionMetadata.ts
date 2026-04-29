/**
 * Canonical retry path when `setMetadata` failed after a successful deploy
 * + backend sync. Always requires OmniHub auth and routes through the
 * standard confirmation helper (so `AUTO_CONFIRM_TRANSACTIONS=true` works).
 *
 * Shares `extractOnchainMetadataFromMedia` with `executeCollectionDeploy`
 * so the backend-media → on-chain-metadata mapping has a single source of
 * truth — never inline an alternative mapping here.
 */

import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { createPublicClient, createWalletClient, http, isAddress, type Abi } from "viem";

import { confirmTransaction, TransactionCancelled } from "../lib/confirm.js";
import { getAccount } from "../lib/wallet.js";
import { ensureAuthenticated } from "../integrations/omnihub/auth.js";
import { resolveBridgeChainContext } from "./lifi/resolveBridgeChainContext.js";
import { getCollectionDetails } from "./getCollectionDetails.js";
import type { CollectionMedia } from "../integrations/omnihub/types.js";

const require = createRequire(import.meta.url);
const NFT_ABI: Abi = require("../resources/OmniHub_NFT_ABI.json");

export interface CollectionOnchainMetadata {
  contractURI: string;
  baseURI: string;
  imageURI: string;
  jsonFormat: boolean;
}

export interface RecoverCollectionMetadataInput {
  chain: string;
  address: string;
  /** When omitted, metadata is re-fetched from the OmniHub backend. */
  metadata?: CollectionOnchainMetadata;
}

export interface RecoverCollectionMetadataResult {
  chain: string;
  chainAlias: string;
  chainId: number;
  address: string;
  metadata: CollectionOnchainMetadata;
  transactionHash: string;
}

/**
 * Single source of truth for backend-media → on-chain-metadata mapping
 * (shared with `executeCollectionDeploy` so they cannot drift apart).
 *
 * Verified against on-chain contracts:
 * - `contractURI ← media[name="contract_uri"].raw` (JSON collection metadata)
 * - `baseURI    ← ""` (backend never supplies this; leave empty)
 * - `imageURI   ← media[name="collection_jpg"].raw`, falling back to
 *   `media[name="collection_cover"].raw`
 * - `jsonFormat ← true` (matches the value set at deploy time)
 */
export function extractOnchainMetadataFromMedia(
  media: CollectionMedia[],
): CollectionOnchainMetadata {
  const find = (name: string) => media.find((m) => m.collectionName === name)?.raw ?? "";
  return {
    contractURI: find("contract_uri"),
    baseURI: "",
    imageURI: find("collection_jpg") || find("collection_cover"),
    jsonFormat: true,
  };
}

export async function recoverCollectionMetadata(
  input: RecoverCollectionMetadataInput,
): Promise<RecoverCollectionMetadataResult> {
  if (!input.chain?.trim()) throw new Error("Target chain is required.");
  if (!input.address?.trim() || !isAddress(input.address.trim())) {
    throw new Error(`"${input.address}" is not a valid EVM contract address.`);
  }
  const address = input.address.trim() as `0x${string}`;

  /** Owner-only on-chain write — auth is required even though we're not POSTing to OmniHub. */
  await ensureAuthenticated();

  const chainCtx = await resolveBridgeChainContext(input.chain);
  if (chainCtx.chainType !== "omnihub-evm") {
    throw new Error(
      `Metadata recovery is only available for OmniHub-supported networks. ` +
        `"${chainCtx.name}" is not in the OmniHub registry.`,
    );
  }
  const rpcUrl = chainCtx.rpcUrl!;
  const chainAlias = chainCtx.omnihubAlias!;

  let metadata: CollectionOnchainMetadata;
  if (input.metadata) {
    metadata = input.metadata;
  } else {
    const details = await getCollectionDetails(chainAlias, address);
    metadata = extractOnchainMetadataFromMedia(details.media);
    if (!metadata.contractURI && !metadata.imageURI) {
      throw new Error(
        `Backend has no metadata media for ${address} on ${chainAlias}. ` +
          `Ensure /api/skill/collection registered this collection before retrying.`,
      );
    }
  }

  await confirmTransaction(
    {
      Action: "Collection metadata recovery (setMetadata)",
      Chain: `${chainCtx.name} (id=${chainCtx.lifiChainId})`,
      Collection: address,
      contractURI: metadata.contractURI || "(empty)",
      baseURI: metadata.baseURI || "(empty)",
      imageURI: metadata.imageURI || "(empty)",
      jsonFormat: metadata.jsonFormat ? "true" : "false",
    },
    metadata.contractURI === "" && metadata.imageURI === ""
      ? ["Backend returned empty metadata fields — verify the collection was registered first."]
      : [],
  );

  const account = getAccount();
  const walletClient = createWalletClient({ account, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  const txHash = await walletClient.writeContract({
    account,
    address,
    abi: NFT_ABI,
    functionName: "setMetadata",
    args: [
      {
        contractURI: metadata.contractURI,
        baseURI: metadata.baseURI,
        imageURI: metadata.imageURI,
        jsonFormat: metadata.jsonFormat,
      },
    ],
    chain: undefined,
  });

  await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
    pollingInterval: 2_000,
  });

  return {
    chain: chainCtx.name,
    chainAlias,
    chainId: chainCtx.lifiChainId,
    address,
    metadata,
    transactionHash: txHash,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chain = process.env.OMNIHUB_CHAIN?.trim() ?? "";
  const address = process.env.OMNIHUB_ADDRESS?.trim() ?? "";
  if (!chain || !address) {
    console.error(
      "Usage: OMNIHUB_CHAIN=base OMNIHUB_ADDRESS=0xabc... " +
        "npm run tool -- collection:recover-metadata",
    );
    process.exit(1);
  }
  try {
    const result = await recoverCollectionMetadata({ chain, address });
    console.log(`\nMetadata recovery complete`);
    console.log(`  chain:      ${result.chain} (id=${result.chainId})`);
    console.log(`  collection: ${result.address}`);
    console.log(`  tx:         ${result.transactionHash}`);
  } catch (err) {
    if (err instanceof TransactionCancelled) {
      console.log(`\nMetadata recovery cancelled.`);
      process.exit(0);
    }
    throw err;
  }
}
