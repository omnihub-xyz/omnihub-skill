/**
 * Hard invariants:
 * - Accepts ONLY a `transactionRequest` returned by `prepareQuote` or
 *   `prepareStepTransaction`. Never refetches a quote here — this preserves
 *   the prepare → confirm → execute separation.
 * - Caller must have already obtained user consent and executed any required
 *   ERC-20 approval. `rpcUrl` MUST be the source chain's RPC.
 */

import { fileURLToPath } from "node:url";

import { createWalletClient, http, isAddress, isHex } from "viem";

import { getAccount } from "../../lib/wallet.js";
import type { LifiTransactionRequest } from "../../integrations/lifi/types.js";

export interface BridgeResult {
  transactionHash: string;
  fromChainId: number;
  toChainId: number;
}

function validateTransactionRequest(tx: LifiTransactionRequest): void {
  if (!tx.to || !isAddress(tx.to)) {
    throw new Error("transactionRequest.to is not a valid EVM address");
  }
  if (!tx.from || !isAddress(tx.from)) {
    throw new Error("transactionRequest.from is not a valid EVM address");
  }
  if (!tx.data || !isHex(tx.data)) {
    throw new Error(
      "transactionRequest.data is missing or not valid hex. " +
        "The quote may have expired — re-run prepareQuote() first.",
    );
  }
  if (tx.value === undefined || tx.value === null) {
    throw new Error("transactionRequest.value is missing");
  }
}

export async function executeBridge(
  transactionRequest: LifiTransactionRequest,
  rpcUrl: string,
): Promise<BridgeResult> {
  if (!rpcUrl) {
    throw new Error(
      "rpcUrl is required for bridge execution — provide the source chain RPC endpoint",
    );
  }

  validateTransactionRequest(transactionRequest);

  const account = getAccount();

  if (transactionRequest.from.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `transactionRequest.from (${transactionRequest.from}) does not match ` +
        `the active wallet address (${account.address}). ` +
        `Re-run prepareQuote() with the correct fromAddress.`,
    );
  }

  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  const txHash = await walletClient.sendTransaction({
    account,
    chain: undefined,
    to: transactionRequest.to as `0x${string}`,
    data: transactionRequest.data as `0x${string}`,
    value: BigInt(transactionRequest.value ?? "0"),
    ...(transactionRequest.gasLimit ? { gas: BigInt(transactionRequest.gasLimit) } : {}),
  });

  return {
    transactionHash: txHash,
    fromChainId: transactionRequest.chainId,
    /** Not present in the tx request; callers attach it from the prepared quote/route. */
    toChainId: 0,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.error(
    "executeBridge is not a standalone script. " +
      "It requires a prepared transactionRequest from prepareQuote() or prepareStepTransaction().",
  );
  process.exit(1);
}
