/**
 * Native tokens (zero address) skip the allowance check entirely. `rpcUrl`
 * MUST be the source chain's RPC — never assume a global default.
 */

import { createPublicClient, http, isAddress } from "viem";

import { NATIVE_TOKEN_ADDRESS } from "./getTokens.js";
import type { LifiAllowanceResult } from "../../integrations/lifi/types.js";

export type { LifiAllowanceResult };

const erc20AllowanceAbi = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function checkAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  requiredAmount: bigint,
  rpcUrl: string,
): Promise<LifiAllowanceResult> {
  if (!isAddress(tokenAddress)) {
    throw new Error(`tokenAddress is not a valid EVM address: ${tokenAddress}`);
  }
  if (!isAddress(ownerAddress)) {
    throw new Error(`ownerAddress is not a valid EVM address: ${ownerAddress}`);
  }
  if (!isAddress(spenderAddress)) {
    throw new Error(`spenderAddress is not a valid EVM address: ${spenderAddress}`);
  }
  if (!rpcUrl) {
    throw new Error(
      "rpcUrl is required for allowance check — provide the source chain RPC endpoint",
    );
  }

  if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
    return {
      token: tokenAddress,
      spender: spenderAddress,
      currentAllowance: BigInt(0),
      requiredAmount,
      approvalNeeded: false,
    };
  }

  const client = createPublicClient({ transport: http(rpcUrl) });

  const currentAllowance = await client.readContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20AllowanceAbi,
    functionName: "allowance",
    args: [ownerAddress as `0x${string}`, spenderAddress as `0x${string}`],
  });

  return {
    token: tokenAddress,
    spender: spenderAddress,
    currentAllowance,
    requiredAmount,
    approvalNeeded: currentAllowance < requiredAmount,
  };
}
