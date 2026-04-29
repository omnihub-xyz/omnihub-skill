/**
 * `POST /api/skill/faucet` quirks worth knowing for safe handling:
 * - Requires auth (Bearer token) and gates on holder status of the required
 *   OmniHub collection.
 * - Enforces a 24h cooldown via on-chain `claimedAt(...)`.
 * - Multiplies the drip by collection ownership tier:
 *     `>= 25 → x6`, `>= 10 → x4`, `>= 3 → x2`, otherwise `x1`.
 */

import { resolveChain } from "../integrations/omnihub/chains.js";
import { ensureAuthenticated, getSessionToken } from "../integrations/omnihub/auth.js";
import { omnihubPost } from "../integrations/omnihub/client.js";
import type { FaucetClaimResponse, FaucetErrorResponse } from "../integrations/omnihub/types.js";

export interface FaucetClaimResult {
  success: true;
  chain: string;
  chainName: string;
  transactionHash: string;
  message: string;
}

/**
 * Drives the network-fallback decision in `claimFaucetWithFallback`.
 * Only `"backend-down"` may trigger a hop to another testnet — `"user-error"`
 * means the next network would hit the same problem (e.g. not a collection
 * holder) and MUST stay on the original chain.
 */
export type FaucetFailureKind = "user-error" | "backend-down" | "unknown";

export interface FaucetClaimError {
  success: false;
  chain: string;
  chainName: string;
  message: string;
  failureKind: FaucetFailureKind;
}

export type FaucetResult = FaucetClaimResult | FaucetClaimError;

export async function claimFaucet(chainInput: string): Promise<FaucetResult> {
  const resolved = await resolveChain(chainInput);

  if (!resolved) {
    return {
      success: false,
      chain: chainInput,
      chainName: chainInput,
      message:
        `"${chainInput}" is not a recognised OmniHub network. ` +
        `Run "npm run omnihub:chains" to see supported networks.`,
      failureKind: "user-error",
    };
  }

  if (resolved.faucet !== true) {
    return {
      success: false,
      chain: resolved.alias,
      chainName: resolved.name,
      message:
        `The OmniHub faucet is not available on ${resolved.name} (${resolved.alias}). ` +
        `Faucet is only offered on selected networks. ` +
        `Run "npm run omnihub:faucet:check" to see supported chains.`,
      failureKind: "user-error",
    };
  }

  await ensureAuthenticated();
  const token = getSessionToken();
  if (!token) {
    return {
      success: false,
      chain: resolved.alias,
      chainName: resolved.name,
      message: "Authentication failed. Could not obtain a session token.",
      failureKind: "unknown",
    };
  }

  let responseData: FaucetClaimResponse | FaucetErrorResponse;
  try {
    responseData = await omnihubPost<FaucetClaimResponse | FaucetErrorResponse>(
      "/api/skill/faucet",
      { chain: resolved.alias },
      token,
    );
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    if (raw.includes("Chain is not supported")) {
      return {
        success: false,
        chain: resolved.alias,
        chainName: resolved.name,
        message: `Faucet is not supported on ${resolved.name} according to the OmniHub backend.`,
        failureKind: "user-error",
      };
    }
    if (raw.includes("not a holder")) {
      return {
        success: false,
        chain: resolved.alias,
        chainName: resolved.name,
        message:
          `You are not a holder of the required OmniHub collection. ` +
          `Hold at least one NFT from the required collection to use the faucet.`,
        failureKind: "user-error",
      };
    }
    if (raw.includes("faucet limit")) {
      return {
        success: false,
        chain: resolved.alias,
        chainName: resolved.name,
        message: `Faucet limit reached. You can claim again in 24 hours.`,
        failureKind: "user-error",
      };
    }

    /** Dispenser revert, "Transfer failed", 5xx, or RPC timeout → backend-down s
     -o fallback is allowed. */
    const looksBackendDown =
      raw.includes("server error 5") ||
      raw.includes("Transfer failed") ||
      raw.includes("transfer failed") ||
      raw.includes("execution reverted") ||
      raw.includes("timeout") ||
      raw.includes("ETIMEDOUT");
    return {
      success: false,
      chain: resolved.alias,
      chainName: resolved.name,
      message: `Faucet claim failed: ${raw}`,
      failureKind: looksBackendDown ? "backend-down" : "unknown",
    };
  }

  /** Structured backend errors arrive in the response body even on HTTP 200. */
  if ("message" in responseData) {
    const msg = (responseData as FaucetErrorResponse).message;

    if (msg === "Chain is not supported") {
      return {
        success: false,
        chain: resolved.alias,
        chainName: resolved.name,
        message: `Faucet is not supported on ${resolved.name} according to the OmniHub backend.`,
        failureKind: "user-error",
      };
    }
    if (msg === "You are not a holder of the required collection.") {
      return {
        success: false,
        chain: resolved.alias,
        chainName: resolved.name,
        message:
          `You are not a holder of the required OmniHub collection. ` +
          `Hold at least one NFT from the required collection to use the faucet.`,
        failureKind: "user-error",
      };
    }
    if (msg === "Your faucet limit has been reached. Try again tomorrow.") {
      return {
        success: false,
        chain: resolved.alias,
        chainName: resolved.name,
        message: `Faucet limit reached. You can claim again in 24 hours.`,
        failureKind: "user-error",
      };
    }
    const looksBackendDown =
      msg.includes("Transfer failed") ||
      msg.includes("transfer failed") ||
      msg.includes("execution reverted");
    return {
      success: false,
      chain: resolved.alias,
      chainName: resolved.name,
      message: `Faucet claim rejected: ${msg}`,
      failureKind: looksBackendDown ? "backend-down" : "unknown",
    };
  }

  const { hash } = responseData as FaucetClaimResponse;
  return {
    success: true,
    chain: resolved.alias,
    chainName: resolved.name,
    transactionHash: hash,
    message:
      `Faucet claimed successfully on ${resolved.name}.\n` +
      `Chain:  ${resolved.name} (${resolved.alias})\n` +
      `Tx:     ${hash}\n` +
      `Note:   Faucet claims are limited to once every 24 hours.`,
  };
}

if (process.argv[1]?.endsWith("claimFaucet.ts") || process.argv[1]?.endsWith("claimFaucet.js")) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();
  if (!chainInput) {
    console.error(
      "OMNIHUB_CHAIN is required. Example: OMNIHUB_CHAIN=base-sepolia npm run omnihub:faucet",
    );
    process.exit(1);
  }
  claimFaucet(chainInput)
    .then((result) => {
      console.log(result.message);
      if (result.success) {
        console.log("\nFull result:", JSON.stringify(result, null, 2));
      }
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
