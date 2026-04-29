/**
 * Hard invariants:
 * - Approves the exact required amount by default. Unlimited approval
 *   (`maxUint256`) is an explicit opt-in via `_allowUnlimited` and MUST
 *   never be the default.
 * - Approval is a separate transaction the user confirms before the bridge.
 *   Never bundle the approval into the bridge execution.
 */

import { encodeFunctionData, isAddress, maxUint256 } from "viem";

import type { LifiPreparedApproval } from "../../integrations/lifi/types.js";
import { NATIVE_TOKEN_ADDRESS } from "./getTokens.js";

export type { LifiPreparedApproval };

const erc20ApproveAbi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface ApprovalInput {
  tokenAddress: string;
  spenderAddress: string;
  amount: bigint;
  chainId: number;
  /**
   * Internal opt-in to approve `maxUint256` instead of `amount`. Must NEVER
   * be exposed to or controlled by users — unlimited approval is a security
   * decision, not a UX toggle.
   */
  _allowUnlimited?: boolean;
}

export async function prepareApproval(input: ApprovalInput): Promise<LifiPreparedApproval> {
  if (!isAddress(input.tokenAddress)) {
    throw new Error(`tokenAddress is not a valid EVM address: ${input.tokenAddress}`);
  }
  if (!isAddress(input.spenderAddress)) {
    throw new Error(`spenderAddress is not a valid EVM address: ${input.spenderAddress}`);
  }

  if (input.tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
    throw new Error("Native tokens do not require an ERC20 approval transaction.");
  }

  if (input.amount <= 0n) {
    throw new Error("Approval amount must be greater than zero.");
  }

  const approveAmount = input._allowUnlimited === true ? maxUint256 : input.amount;

  const data = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [input.spenderAddress as `0x${string}`, approveAmount],
  });

  return {
    token: input.tokenAddress,
    spender: input.spenderAddress,
    amount: approveAmount.toString(),
    transactionRequest: {
      to: input.tokenAddress,
      data,
      value: "0",
      chainId: input.chainId,
    },
  };
}
