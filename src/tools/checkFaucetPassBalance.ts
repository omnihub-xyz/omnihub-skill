/**
 * The Faucet Pass lives on Base; holding at least one is the gating
 * requirement for the OmniHub faucet on supported testnets.
 */

import { createPublicClient, http, type Abi, type Address } from "viem";
import { createRequire } from "node:module";

import { requireChain, resolveRpcForChain } from "../integrations/omnihub/chains.js";
import { getAccount } from "../lib/wallet.js";

const require = createRequire(import.meta.url);
const OmniHub_NFT_ABI: Abi = require("../resources/OmniHub_NFT_ABI.json");

export const FAUCET_PASS_CHAIN = "base";
export const FAUCET_PASS_CONTRACT: Address = "0x0672a9B9C0a4D3779AeF657665bb7d784231cBAF";
export const FAUCET_PASS_NAME = "OmniHub Faucet Pass";

export interface FaucetPassBalanceResult {
  holds: boolean;
  balance: bigint;
  walletAddress: string;
}

export async function checkFaucetPassBalance(): Promise<FaucetPassBalanceResult> {
  const account = getAccount();
  const chain = await requireChain(FAUCET_PASS_CHAIN);
  const rpcUrl = await resolveRpcForChain(chain);

  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  const balance = (await publicClient.readContract({
    address: FAUCET_PASS_CONTRACT,
    abi: OmniHub_NFT_ABI,
    functionName: "balanceOf",
    args: [account.address as Address],
  })) as bigint;

  return {
    holds: balance > 0n,
    balance,
    walletAddress: account.address,
  };
}

if (
  process.argv[1]?.endsWith("checkFaucetPassBalance.ts") ||
  process.argv[1]?.endsWith("checkFaucetPassBalance.js")
) {
  const result = await checkFaucetPassBalance();
  console.log(`Wallet:  ${result.walletAddress}`);
  console.log(`Balance: ${result.balance} OmniHub Faucet Pass`);
  console.log(`Holds:   ${result.holds ? "yes" : "no"}`);
}
