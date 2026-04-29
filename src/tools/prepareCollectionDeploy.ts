/**
 * Canonical builder for the factory `CreateParams` struct.
 *
 * Hard invariants this function enforces (do not relax without product sign-off):
 * - Mint price is ALWAYS `0` and is not user-configurable.
 * - Royalty defaults to 500 bps (5%) and `transferable` defaults to `true`.
 * - Metadata fields are placeholders — they are replaced by `setMetadata`
 *   only after the backend has registered the collection.
 * - Native token symbol is resolved from chain context, never hardcoded as ETH.
 */

import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { createPublicClient, formatEther, http, isAddress, type Abi } from "viem";

import { resolveChain } from "../integrations/omnihub/chains.js";
import { resolveBridgeChainContext } from "./lifi/resolveBridgeChainContext.js";

const require = createRequire(import.meta.url);
const DEPLOY_ABI: Abi = require("../resources/OmniHub_Deploy_ABI.json");

export const DEFAULT_DESCRIPTION = "This NFT collection was created with the OmniHub skill.";
export const DEFAULT_SUPPLY = 1000;
export const DEFAULT_ROYALTY_BPS = 500;
export const DEFAULT_PHASE_DURATION_SECS = 365 * 24 * 60 * 60;

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

export interface CollectionDeployInput {
  chain: string;
  name: string;
  symbol: string;
  supply?: number;
  description?: string;
  /** Skip factory lookup in the chain registry. Use only for testing. */
  factoryAddress?: string;
}

export interface CollectionPhase {
  title: string;
  from: bigint;
  to: bigint;
  price: bigint;
  maxPerAddress: bigint;
  merkleRoot: `0x${string}`;
}

export interface CollectionCreateParams {
  name: string;
  symbol: string;
  description: string;
  supply: bigint;
  /** Basis points; 500 = 5%. */
  royalty: bigint;
  transferable: boolean;
  phase: CollectionPhase;
  metadata: {
    contractURI: string;
    baseURI: string;
    imageURI: string;
    jsonFormat: boolean;
  };
}

export interface CollectionDeployPreparation {
  chain: string;
  chainAlias: string;
  chainId: number;
  nativeSymbol: string;
  rpcUrl: string;
  factoryAddress: string;
  name: string;
  symbol: string;
  supply: number;
  description: string;
  createFeeWei: bigint;
  createFeeNative: string;
  /** The struct fed to `executeCollectionDeploy`; do not reconstruct it elsewhere. */
  createParams: CollectionCreateParams;
  royaltyPercent: string;
  mintWindowDisplay: string;
}

export async function prepareCollectionDeploy(
  input: CollectionDeployInput,
): Promise<CollectionDeployPreparation> {
  if (!input.chain?.trim()) throw new Error("Target chain is required.");
  if (!input.name?.trim()) throw new Error("Collection name is required.");
  if (!input.symbol?.trim()) throw new Error("Token symbol is required.");

  const supply = input.supply ?? DEFAULT_SUPPLY;
  if (!Number.isInteger(supply) || supply <= 0) {
    throw new Error(`Supply must be a positive integer. Got: ${supply}`);
  }

  const description = input.description?.trim() || DEFAULT_DESCRIPTION;
  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();

  const chainCtx = await resolveBridgeChainContext(input.chain);

  if (chainCtx.chainType !== "omnihub-evm") {
    throw new Error(
      `Collection deployment is only available on OmniHub-supported networks. ` +
        `"${chainCtx.name}" is not in the OmniHub chain registry.`,
    );
  }

  const rpcUrl = chainCtx.rpcUrl!;
  const nativeSymbol = chainCtx.nativeSymbol;
  const chainAlias = chainCtx.omnihubAlias!;

  let factoryAddress: `0x${string}`;
  if (input.factoryAddress?.trim()) {
    factoryAddress = input.factoryAddress.trim() as `0x${string}`;
  } else {
    const omniChain = await resolveChain(chainAlias);
    const addr = omniChain?.factory;
    if (!addr || !isAddress(addr)) {
      throw new Error(
        `No factory address found for chain "${chainAlias}" in /api/chains. ` +
          "Collection deployment may not be supported on this network yet.",
      );
    }
    factoryAddress = addr as `0x${string}`;
  }

  const client = createPublicClient({ transport: http(rpcUrl) });

  const createFeeWei = (await client.readContract({
    address: factoryAddress,
    abi: DEPLOY_ABI,
    functionName: "createFee",
  })) as bigint;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const phase: CollectionPhase = {
    title: "Public Mint",
    from: now,
    to: now + BigInt(DEFAULT_PHASE_DURATION_SECS),
    price: 0n,
    maxPerAddress: 0n,
    merkleRoot: ZERO_BYTES32,
  };

  const createParams: CollectionCreateParams = {
    name,
    symbol,
    description,
    supply: BigInt(supply),
    royalty: BigInt(DEFAULT_ROYALTY_BPS),
    transferable: true,
    phase,
    metadata: {
      contractURI: "",
      baseURI: "",
      imageURI: "",
      jsonFormat: true,
    },
  };

  const royaltyPercent = `${DEFAULT_ROYALTY_BPS / 100}%`;
  const toDate = new Date(Number(phase.to) * 1000);
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mintWindowDisplay = `Now → ${MONTHS[toDate.getUTCMonth()]} ${toDate.getUTCDate()} ${toDate.getUTCFullYear()}`;

  return {
    chain: chainCtx.name,
    chainAlias,
    chainId: chainCtx.lifiChainId,
    nativeSymbol,
    rpcUrl,
    factoryAddress,
    name,
    symbol,
    supply,
    description,
    createFeeWei,
    createFeeNative: formatEther(createFeeWei),
    createParams,
    royaltyPercent,
    mintWindowDisplay,
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
        "npm run tool -- collection:prepare",
    );
    process.exit(1);
  }

  const result = await prepareCollectionDeploy({ chain, name, symbol, supply, description });

  console.log(
    JSON.stringify(
      {
        chain: result.chain,
        chainAlias: result.chainAlias,
        chainId: result.chainId,
        nativeSymbol: result.nativeSymbol,
        factoryAddress: result.factoryAddress,
        name: result.name,
        symbol: result.symbol,
        supply: result.supply,
        description: result.description,
        createFeeNative: result.createFeeNative,
        royalty: result.royaltyPercent,
        transferable: result.createParams.transferable,
        phase: result.createParams.phase.title,
        mintWindow: result.mintWindowDisplay,
      },
      null,
      2,
    ),
  );
}
