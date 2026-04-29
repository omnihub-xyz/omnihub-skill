/**
 * Approval must remain a separate transaction from bridge execution. The
 * caller is responsible for obtaining user consent before invoking this —
 * `rpcUrl` MUST be the source chain's RPC.
 */

import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, http } from "viem";

import { getAccount } from "../../lib/wallet.js";
import type { LifiPreparedApproval } from "../../integrations/lifi/types.js";

export interface ApprovalResult {
  token: string;
  spender: string;
  amount: string;
  transactionHash: string;
}

export async function executeApproval(
  prepared: LifiPreparedApproval,
  rpcUrl: string,
): Promise<ApprovalResult> {
  if (!rpcUrl) {
    throw new Error(
      "rpcUrl is required for approval execution — provide the source chain RPC endpoint",
    );
  }

  const account = getAccount();
  const transport = http(rpcUrl);

  const walletClient = createWalletClient({ account, transport });
  const publicClient = createPublicClient({ transport });

  const txHash = await walletClient.sendTransaction({
    account,
    chain: undefined,
    to: prepared.transactionRequest.to as `0x${string}`,
    data: prepared.transactionRequest.data as `0x${string}`,
    value: BigInt(prepared.transactionRequest.value),
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    token: prepared.token,
    spender: prepared.spender,
    amount: prepared.amount,
    transactionHash: txHash,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.error(
    "executeApproval is not a standalone script. " +
      "It requires a prepared approval from prepareApproval().",
  );
  process.exit(1);
}
