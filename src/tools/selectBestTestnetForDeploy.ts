/**
 * Picks the most viable testnet for collection creation by margin
 * (`balance − (createFee + gasReserve)`), descending.
 *
 * Hard invariant: read-only. NEVER send transactions or mutate state from
 * this module — it is the agent's safe pre-flight check.
 *
 * Default gas reserve (0.002 ETH-equivalent) covers `create + setMetadata`
 * on a typical testnet. Callers can override via options.
 */

import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { createPublicClient, formatEther, http, isAddress, type Abi } from "viem";

import { getAccount } from "../lib/wallet.js";
import {
  listSupportedChains,
  resolveRpcForChain,
  type OmniChain,
} from "../integrations/omnihub/chains.js";

const require = createRequire(import.meta.url);
const DEPLOY_ABI: Abi = require("../resources/OmniHub_Deploy_ABI.json");

export const DEFAULT_DEPLOY_GAS_RESERVE_WEI = 2_000_000_000_000_000n;

/**
 * Some testnet RPCs return a hardcoded "magic number" balance (e.g. Tempo's
 * `0x4242…`). 1M ETH-equivalent is far above any legitimate testnet faucet,
 * so anything higher is treated as a dead/mock RPC and the chain is dropped
 * from the ranking — otherwise it would always win.
 */
const MOCK_BALANCE_THRESHOLD_WEI = 1_000_000n * 10n ** 18n;

export interface TestnetDeployCandidate {
  chain: string;
  chainName: string;
  chainId: number;
  nativeSymbol: string;
  factoryAddress: string;
  balanceWei: bigint;
  balanceNative: string;
  createFeeWei: bigint;
  createFeeNative: string;
  gasReserveWei: bigint;
  viable: boolean;
  /** `balance − (createFee + gasReserve)`; negative when not viable. */
  marginWei: bigint;
  marginNative: string;
  error?: string;
}

export interface BestTestnetSelectionResult {
  walletAddress: string;
  gasReserveWei: string;
  /** Ordered by margin desc. Only viable candidates are ranked. */
  viable: TestnetDeployCandidate[];
  nonViable: TestnetDeployCandidate[];
  errors: TestnetDeployCandidate[];
  best: TestnetDeployCandidate | null;
  summary: string;
}

/** Catches every error so one bad RPC cannot fail the whole selection. */
async function evaluateCandidate(
  chain: OmniChain,
  walletAddress: `0x${string}`,
  gasReserveWei: bigint,
): Promise<TestnetDeployCandidate> {
  const partial: TestnetDeployCandidate = {
    chain: chain.alias,
    chainName: chain.name,
    chainId: chain.id,
    nativeSymbol: "",
    factoryAddress: chain.factory ?? "",
    balanceWei: 0n,
    balanceNative: "0",
    createFeeWei: 0n,
    createFeeNative: "0",
    gasReserveWei,
    viable: false,
    marginWei: 0n,
    marginNative: "0",
  };

  try {
    if (!chain.factory || !isAddress(chain.factory)) {
      throw new Error("No factory address in /api/chains");
    }
    const rpcUrl = await resolveRpcForChain(chain);
    const client = createPublicClient({ transport: http(rpcUrl) });

    const [balanceWei, createFeeWei] = await Promise.all([
      client.getBalance({ address: walletAddress }),
      client.readContract({
        address: chain.factory as `0x${string}`,
        abi: DEPLOY_ABI,
        functionName: "createFee",
      }) as Promise<bigint>,
    ]);

    if (balanceWei > MOCK_BALANCE_THRESHOLD_WEI) {
      throw new Error(
        `RPC reported implausible balance (${formatEther(balanceWei)} native) — ` +
          `treating chain as unreliable for deploy selection.`,
      );
    }

    const needed = createFeeWei + gasReserveWei;
    const marginWei = balanceWei - needed;
    return {
      ...partial,
      balanceWei,
      balanceNative: formatEther(balanceWei),
      createFeeWei,
      createFeeNative: formatEther(createFeeWei),
      viable: marginWei >= 0n,
      marginWei,
      marginNative: formatEther(marginWei < 0n ? -marginWei : marginWei),
    };
  } catch (err) {
    return {
      ...partial,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface SelectBestTestnetOptions {
  gasReserveWei?: bigint;
}

export async function selectBestTestnetForDeploy(
  options: SelectBestTestnetOptions = {},
): Promise<BestTestnetSelectionResult> {
  const account = getAccount();
  const walletAddress = account.address as `0x${string}`;
  const gasReserveWei = options.gasReserveWei ?? DEFAULT_DEPLOY_GAS_RESERVE_WEI;

  const chains = await listSupportedChains();
  const candidateChains = chains.filter(
    (c) => c.testnet === true && typeof c.factory === "string" && isAddress(c.factory),
  );

  const evaluations = await Promise.all(
    candidateChains.map((c) => evaluateCandidate(c, walletAddress, gasReserveWei)),
  );

  const errors = evaluations.filter((e) => e.error);
  const ok = evaluations.filter((e) => !e.error);
  const viable = ok
    .filter((e) => e.viable)
    .sort((a, b) => (a.marginWei > b.marginWei ? -1 : a.marginWei < b.marginWei ? 1 : 0));
  const nonViable = ok.filter((e) => !e.viable);

  const best = viable[0] ?? null;

  let summary: string;
  if (best) {
    summary =
      `${best.chainName} is the best available testnet for this deploy based on your ` +
      `current balance (${best.balanceNative} ${best.nativeSymbol || "native"}) ` +
      `and create fee (${best.createFeeNative}).`;
  } else if (nonViable.length > 0) {
    const closest = nonViable.slice().sort((a, b) => (a.marginWei > b.marginWei ? -1 : 1))[0];
    summary =
      `No testnet is currently viable for collection creation with the wallet's balance. ` +
      `Closest: ${closest.chainName} — balance ${closest.balanceNative} ` +
      `vs create fee ${closest.createFeeNative} + gas reserve.`;
  } else {
    summary = `No testnet candidates with a factory address were found in /api/chains.`;
  }

  return {
    walletAddress,
    gasReserveWei: gasReserveWei.toString(),
    viable,
    nonViable,
    errors,
    best,
    summary,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const overrideStr = process.env.DEPLOY_GAS_RESERVE_WEI?.trim();
  const opts: SelectBestTestnetOptions = {};
  if (overrideStr) {
    try {
      opts.gasReserveWei = BigInt(overrideStr);
    } catch {
      console.error(`Invalid DEPLOY_GAS_RESERVE_WEI: ${overrideStr}`);
      process.exit(1);
    }
  }

  const result = await selectBestTestnetForDeploy(opts);

  console.log(`\n${result.summary}\n`);
  if (result.viable.length > 0) {
    console.log(`Viable testnets (ranked by margin):`);
    for (const c of result.viable) {
      console.log(
        `  ${c.chainName.padEnd(22)}  balance=${c.balanceNative}  fee=${c.createFeeNative}  margin=${c.marginNative}`,
      );
    }
  }
  if (result.nonViable.length > 0) {
    console.log(`\nNot viable (insufficient balance):`);
    for (const c of result.nonViable) {
      console.log(
        `  ${c.chainName.padEnd(22)}  balance=${c.balanceNative}  fee=${c.createFeeNative}`,
      );
    }
  }
  if (result.errors.length > 0) {
    console.log(`\nSkipped (probe failed):`);
    for (const c of result.errors) {
      console.log(`  ${c.chainName.padEnd(22)}  ${c.error}`);
    }
  }
}
