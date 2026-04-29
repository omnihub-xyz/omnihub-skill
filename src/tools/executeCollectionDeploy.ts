/**
 * Three-step deploy flow:
 *  1. `factory.create(CreateParams)` with `value = createFee()`
 *  2. POST `/api/skill/collection` so the backend registers the collection
 *  3. `setMetadata(...)` on the new contract using backend-supplied media
 *
 * Auth is required up front — never split or reorder these steps.
 *
 * Failure handling is reported via `backendSynced`/`metadataUpdated` flags so
 * a partial success can be safely retried via `recoverCollectionMetadata`
 * without redeploying.
 */

import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { createPublicClient, createWalletClient, http, parseEventLogs, type Abi } from "viem";

import { confirmTransaction, TransactionCancelled } from "../lib/confirm.js";
import { getAccount } from "../lib/wallet.js";
import { omnihubPost } from "../integrations/omnihub/client.js";
import { ensureAuthenticated, getSessionToken } from "../integrations/omnihub/auth.js";
import {
  prepareCollectionDeploy,
  DEFAULT_SUPPLY,
  DEFAULT_DESCRIPTION,
  type CollectionDeployInput,
} from "./prepareCollectionDeploy.js";
import { extractOnchainMetadataFromMedia } from "./recoverCollectionMetadata.js";

const require = createRequire(import.meta.url);
const DEPLOY_ABI: Abi = require("../resources/OmniHub_Deploy_ABI.json");
const NFT_ABI: Abi = require("../resources/OmniHub_NFT_ABI.json");

import type { CollectionMedia } from "../integrations/omnihub/types.js";

/**
 * The backend does NOT return `contractURI`/`baseURI`/`imageURI`/`jsonFormat`
 * as top-level fields — all metadata assets live in `media`, keyed by
 * `collectionName`. See `extractOnchainMetadataFromMedia` for the mapping.
 */
interface BackendCollectionResponse {
  id: number;
  chain: string;
  address: string;
  name: string;
  symbol: string;
  supply: string;
  media: CollectionMedia[];
  [key: string]: unknown;
}

export interface CollectionDeployResult {
  chain: string;
  chainAlias: string;
  chainId: number;
  contractAddress: string;
  deployTxHash: string;
  name: string;
  symbol: string;
  supply: number;
  nativeSymbol: string;
  createFeeNative: string;
  backendSynced: boolean;
  backendError?: string;
  metadataUpdated: boolean;
  metadataUpdateTxHash?: string;
  metadataError?: string;
  /**
   * Populated only when `backendSynced=true` and `metadataUpdated=false`.
   * Tells the agent how to retry the missed `setMetadata` step without
   * redeploying.
   */
  recoveryHint?: {
    tool: "collection:recover-metadata";
    chain: string;
    address: string;
  };
}

/** Mint price is always `0`; it is not user-configurable. */
export async function executeCollectionDeploy(
  input: CollectionDeployInput,
): Promise<CollectionDeployResult> {
  await ensureAuthenticated();

  const prepared = await prepareCollectionDeploy(input);

  await confirmTransaction(
    {
      Chain: `${prepared.chain} (id=${prepared.chainId})`,
      Name: prepared.name,
      Symbol: prepared.symbol,
      Supply: String(prepared.supply),
      "Mint price": `0 ${prepared.nativeSymbol}`,
      "Create fee": `${prepared.createFeeNative} ${prepared.nativeSymbol}`,
      Royalty: prepared.royaltyPercent,
      Transferable: prepared.createParams.transferable ? "Yes" : "No",
      Phase: prepared.createParams.phase.title,
      "Mint window": prepared.mintWindowDisplay,
      Description: prepared.description,
    },
    [],
  );

  const account = getAccount();

  const walletClient = createWalletClient({
    account,
    transport: http(prepared.rpcUrl),
  });

  const publicClient = createPublicClient({
    transport: http(prepared.rpcUrl),
  });

  /** Params come straight from `prepareCollectionDeploy` — never reconstruct here. */
  const txHash = await walletClient.writeContract({
    account,
    address: prepared.factoryAddress as `0x${string}`,
    abi: DEPLOY_ABI,
    functionName: "create",
    args: [prepared.createParams],
    value: prepared.createFeeWei,
    chain: undefined,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
    pollingInterval: 2_000,
  });

  let contractAddress: string | undefined;
  try {
    const logs = parseEventLogs({
      abi: DEPLOY_ABI,
      eventName: "Created",
      logs: receipt.logs,
    });
    const first = logs[0];
    if (first && "args" in first) {
      const args = first.args as { collection?: string };
      contractAddress = args.collection;
    }
  } catch {
    /** Best-effort: deploy hash is still returned even if event parsing fails. */
  }

  const deployedAddress = contractAddress ?? "(see tx receipt)";

  const baseResult = {
    chain: prepared.chain,
    chainAlias: prepared.chainAlias,
    chainId: prepared.chainId,
    contractAddress: deployedAddress,
    deployTxHash: txHash,
    name: prepared.name,
    symbol: prepared.symbol,
    supply: prepared.supply,
    nativeSymbol: prepared.nativeSymbol,
    createFeeNative: prepared.createFeeNative,
  };

  let backendMetadata: BackendCollectionResponse | undefined;
  try {
    const token = getSessionToken();
    backendMetadata = await omnihubPost<BackendCollectionResponse>(
      "/api/skill/collection",
      {
        chain: prepared.chainAlias,
        name: prepared.name,
        symbol: prepared.symbol,
        supply: String(prepared.supply),
        description: prepared.description,
        hash: txHash,
      },
      token ?? undefined,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...baseResult,
      backendSynced: false,
      backendError: msg,
      metadataUpdated: false,
    };
  }

  /** No extra confirmation: `setMetadata` is part of the deploy already approved by the user. */
  if (!contractAddress) {
    return {
      ...baseResult,
      backendSynced: true,
      metadataUpdated: false,
      metadataError: "Could not read collection address from Created event — skipping setMetadata.",
      /** Intentionally no recoveryHint — without the address there is nothing to retry against. */
    };
  }

  const onchainMeta = extractOnchainMetadataFromMedia(backendMetadata.media ?? []);

  let metadataUpdateTxHash: string | undefined;
  try {
    const metaTx = await walletClient.writeContract({
      account,
      address: contractAddress as `0x${string}`,
      abi: NFT_ABI,
      functionName: "setMetadata",
      args: [
        {
          contractURI: onchainMeta.contractURI,
          baseURI: onchainMeta.baseURI,
          imageURI: onchainMeta.imageURI,
          jsonFormat: onchainMeta.jsonFormat,
        },
      ],
      chain: undefined,
    });
    await publicClient.waitForTransactionReceipt({
      hash: metaTx,
      timeout: 120_000,
      pollingInterval: 2_000,
    });
    metadataUpdateTxHash = metaTx;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...baseResult,
      backendSynced: true,
      metadataUpdated: false,
      metadataError: msg,
      recoveryHint: {
        tool: "collection:recover-metadata",
        chain: prepared.chainAlias,
        address: contractAddress,
      },
    };
  }

  return {
    ...baseResult,
    backendSynced: true,
    metadataUpdated: true,
    metadataUpdateTxHash,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chain = process.env.DEPLOY_CHAIN?.trim() ?? "";
  const name = process.env.DEPLOY_NAME?.trim() ?? "";
  const symbol = process.env.DEPLOY_SYMBOL?.trim() ?? "";
  const supply = parseInt(process.env.DEPLOY_SUPPLY?.trim() || String(DEFAULT_SUPPLY), 10);
  const description = process.env.DEPLOY_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION;

  if (!chain || !name || !symbol) {
    console.error(
      'Usage: DEPLOY_CHAIN=base DEPLOY_NAME="Base Dogs" DEPLOY_SYMBOL=BDOG ' +
        "npm run tool -- collection:deploy",
    );
    process.exit(1);
  }

  try {
    const result = await executeCollectionDeploy({ chain, name, symbol, supply, description });

    console.log(`\nCollection deployed`);
    console.log(`  chain:     ${result.chain} (id=${result.chainId})`);
    console.log(`  name:      ${result.name} (${result.symbol})`);
    console.log(`  supply:    ${result.supply}`);
    console.log(`  contract:  ${result.contractAddress}`);
    console.log(`  deploy tx: ${result.deployTxHash}`);

    if (result.backendSynced) {
      console.log(`  backend:   synced`);
    } else {
      console.log(`  backend:   FAILED — ${result.backendError}`);
    }

    if (result.metadataUpdated) {
      console.log(`  metadata:  updated (tx: ${result.metadataUpdateTxHash})`);
    } else if (result.backendSynced) {
      console.log(`  metadata:  FAILED — ${result.metadataError}`);
      if (result.recoveryHint) {
        console.log(
          `  recovery:  OMNIHUB_CHAIN=${result.recoveryHint.chain} ` +
            `OMNIHUB_ADDRESS=${result.recoveryHint.address} ` +
            `npm run tool -- ${result.recoveryHint.tool}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof TransactionCancelled) {
      console.log(`\nDeployment cancelled.`);
      process.exit(0);
    }
    throw err;
  }
}
