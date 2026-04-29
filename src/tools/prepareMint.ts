import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  zeroAddress,
  type Abi,
  type Address,
} from "viem";

import { requireChain, resolveRpcForChain } from "../integrations/omnihub/chains.js";
import { nativeSymbolForEvmChain } from "./lifi/resolveBridgeChainContext.js";

const require = createRequire(import.meta.url);
const OmniHub_NFT_ABI: Abi = require("../resources/OmniHub_NFT_ABI.json");

const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

interface PhaseStruct {
  title: string;
  from: bigint;
  to: bigint;
  price: bigint;
  maxPerAddress: bigint;
  merkleRoot: string;
}

export interface MintSummary {
  chain: string;
  chainId: number;
  /** Native token symbol for the resolved chain (e.g. ETH, MATIC, BNB). */
  nativeSymbol: string;
  rpcUrl: string;
  contractAddress: string;
  collectionName: string | null;
  quantity: number;
  phaseId: number;
  mintFeeWei: string;
  mintFeeEth: string;
  pricePerMint: string | null;
  maxPerAddress: number | null;
  publicMintValid: boolean;
  validationWarnings: string[];
  calldata: string;
}

export interface MintInput {
  chain: string;
  address: string;
  quantity?: number;
}

/**
 * Validates phase 0 of an OmniHub collection before assembling the mint tx.
 * Sets `publicMintValid=false` (with reasons in `validationWarnings`) if any
 * of these invariants fails — `executeMint` MUST refuse to send when invalid:
 * - Phase 0 must exist and be readable.
 * - `merkleRoot` must be zero (no allowlist phases via this tool).
 * - Current time must lie inside `[phase.from, phase.to]` when those bounds
 *   are set on-chain.
 * - Quantity must not exceed `maxPerAddress` when set on-chain.
 *
 * Falls back to `OMNIHUB_CHAIN`/`OMNIHUB_ADDRESS`/`OMNIHUB_QUANTITY` only when
 * called with no `input` (direct CLI use).
 */
export async function prepareMint(input?: MintInput): Promise<MintSummary> {
  const chainInput = input?.chain ?? process.env.OMNIHUB_CHAIN?.trim();
  const addressInput = input?.address ?? process.env.OMNIHUB_ADDRESS?.trim();
  const quantity =
    input?.quantity ??
    (process.env.OMNIHUB_QUANTITY?.trim() ? parseInt(process.env.OMNIHUB_QUANTITY.trim(), 10) : 1);

  if (!chainInput) throw new Error("chain is required");
  if (!addressInput) throw new Error("address is required");
  if (!isAddress(addressInput)) throw new Error("address must be a valid 0x EVM address");
  if (isNaN(quantity) || quantity < 1) throw new Error("quantity must be a positive integer");

  const chain = await requireChain(chainInput);
  const contractAddress = addressInput as Address;
  const warnings: string[] = [];

  const rpcUrl = await resolveRpcForChain(chain);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  let collectionName: string | null = null;
  try {
    collectionName = (await publicClient.readContract({
      address: contractAddress,
      abi: OmniHub_NFT_ABI,
      functionName: "name",
    })) as string;
  } catch {
    /** `name()` is optional on the NFT contract; absence is not an error. */
  }

  /** `getPhase(0)` throws `INVALID_PHASE` if the collection has no phase 0. */
  let phase: PhaseStruct | null = null;
  let publicMintValid = true;

  try {
    phase = (await publicClient.readContract({
      address: contractAddress,
      abi: OmniHub_NFT_ABI,
      functionName: "getPhase",
      args: [0n],
    })) as PhaseStruct;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(
      `Phase 0 could not be read (${msg.split("\n")[0]}). Phase 0 may not exist on this collection.`,
    );
    publicMintValid = false;
  }

  if (phase) {
    /** Non-zero merkle root means an allowlist phase, which this tool refuses to mint. */
    if (phase.merkleRoot !== ZERO_BYTES32) {
      warnings.push(
        `Phase 0 has a non-zero merkle root (${phase.merkleRoot.slice(0, 10)}...). ` +
          `This is an allowlist phase. Public mint v2 supports public phases only.`,
      );
      publicMintValid = false;
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (phase.from > 0n && now < phase.from) {
      warnings.push(
        `Mint phase has not started yet (starts ${new Date(Number(phase.from) * 1000).toISOString()}).`,
      );
      publicMintValid = false;
    }
    if (phase.to > 0n && now > phase.to) {
      warnings.push(
        `Mint phase has ended (ended ${new Date(Number(phase.to) * 1000).toISOString()}).`,
      );
      publicMintValid = false;
    }

    if (phase.maxPerAddress > 0n && BigInt(quantity) > phase.maxPerAddress) {
      warnings.push(
        `Requested quantity (${quantity}) exceeds maxPerAddress (${phase.maxPerAddress}) for phase 0.`,
      );
      publicMintValid = false;
    }
  }

  let mintFeeWei = 0n;
  try {
    mintFeeWei = (await publicClient.readContract({
      address: contractAddress,
      abi: OmniHub_NFT_ABI,
      functionName: "calculateMintFee",
      args: [0n, BigInt(quantity)],
    })) as bigint;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Could not calculate mint fee: ${msg.split("\n")[0]}`);
  }

  /** `mint(phaseId=0, quantity, referral=zero, merkleProof=[])`. */
  const calldata = encodeFunctionData({
    abi: OmniHub_NFT_ABI,
    functionName: "mint",
    args: [0n, BigInt(quantity), zeroAddress, [] as readonly `0x${string}`[]],
  });

  const pricePerMint = phase && phase.price > 0n ? formatEther(phase.price) : null;
  const maxPerAddress = phase && phase.maxPerAddress > 0n ? Number(phase.maxPerAddress) : null;

  return {
    chain: chain.alias,
    chainId: chain.id,
    nativeSymbol: nativeSymbolForEvmChain(chain.id),
    rpcUrl,
    contractAddress,
    collectionName,
    quantity,
    phaseId: 0,
    mintFeeWei: mintFeeWei.toString(),
    mintFeeEth: formatEther(mintFeeWei),
    pricePerMint,
    maxPerAddress,
    publicMintValid,
    validationWarnings: warnings,
    calldata,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await prepareMint();

  console.log(`\nMint summary`);
  console.log(`  chain:      ${result.chain} (id=${result.chainId})`);
  console.log(`  rpc:        ${result.rpcUrl}`);
  console.log(`  contract:   ${result.contractAddress}`);
  if (result.collectionName) console.log(`  collection: ${result.collectionName}`);
  console.log(`  phaseId:    ${result.phaseId}`);
  console.log(`  quantity:   ${result.quantity}`);
  console.log(
    `  mint fee:   ${result.mintFeeEth} ${result.nativeSymbol} (${result.mintFeeWei} wei)`,
  );
  if (result.pricePerMint)
    console.log(`  price/mint: ${result.pricePerMint} ${result.nativeSymbol}`);
  if (result.maxPerAddress !== null) console.log(`  maxPerAddr: ${result.maxPerAddress}`);
  console.log(`  valid:      ${result.publicMintValid}`);

  if (result.validationWarnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of result.validationWarnings) console.log(`    - ${w}`);
  }

  if (result.publicMintValid) {
    console.log(`\n  calldata: ${result.calldata}`);
    console.log(`\nRun mint:execute to send the transaction.`);
  }
}
