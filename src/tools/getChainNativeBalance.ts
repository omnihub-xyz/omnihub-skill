/**
 * Canonical source for "bridge all native" and "swap all native" flows:
 * `rawBalance` (wei) feeds `LIFI_FROM_AMOUNT`, while `balance` is used for
 * display and gas-reserve arithmetic.
 */

import { fileURLToPath } from "node:url";

import { createPublicClient, formatEther, http } from "viem";

import { getAccount } from "../lib/wallet.js";
import { resolveBridgeChainContext } from "./lifi/resolveBridgeChainContext.js";

export interface ChainNativeBalanceResult {
  chain: string;
  chainId: number;
  symbol: string;
  rawBalance: string;
  balance: string;
  walletAddress: string;
}

export async function getChainNativeBalance(chainInput: string): Promise<ChainNativeBalanceResult> {
  const account = getAccount();
  const walletAddress = account.address;

  const chainCtx = await resolveBridgeChainContext(chainInput);

  if (chainCtx.chainType === "generic-non-evm") {
    throw new Error(`Balance reading is not supported for non-EVM chain "${chainCtx.name}".`);
  }
  if (!chainCtx.rpcUrl) {
    throw new Error(
      `Chain "${chainCtx.name}" is not in the OmniHub-supported set. ` +
        "Balance reading requires a chain in the OmniHub registry.",
    );
  }

  const client = createPublicClient({ transport: http(chainCtx.rpcUrl) });
  const raw = await client.getBalance({ address: walletAddress as `0x${string}` });

  return {
    chain: chainCtx.name,
    chainId: chainCtx.lifiChainId,
    symbol: chainCtx.nativeSymbol,
    rawBalance: raw.toString(),
    balance: formatEther(raw),
    walletAddress,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chain = process.env.CHAIN_BALANCE_CHAIN?.trim() ?? "";
  if (!chain) {
    console.error("Usage: CHAIN_BALANCE_CHAIN=optimism npm run tool -- chain-balance");
    process.exit(1);
  }
  const result = await getChainNativeBalance(chain);
  console.log(JSON.stringify(result, null, 2));
}
