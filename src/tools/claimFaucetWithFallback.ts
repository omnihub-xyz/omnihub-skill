/**
 * Faucet claim with a *suggested* fallback when the dispenser/backend is down.
 *
 * Hard invariant: this helper NEVER auto-switches networks. It returns a
 * candidate so the caller can prompt the user — claiming on a different
 * testnet without consent would surprise the user with funds on the wrong
 * chain. The classification in `FaucetFailureKind` decides whether a
 * fallback is even offered.
 */

import {
  listSupportedChains,
  resolveChain,
  type OmniChain,
} from "../integrations/omnihub/chains.js";
import { claimFaucet, type FaucetResult, type FaucetClaimError } from "./claimFaucet.js";

export interface FaucetFallbackCandidate {
  chain: string;
  chainName: string;
}

export type ClaimWithFallbackResult =
  | {
      outcome: "claimed";
      primary: FaucetResult;
    }
  | {
      outcome: "user-error";
      primary: FaucetClaimError;
      /** No fallback — the user-side issue would repeat on any other network. */
      fallback?: undefined;
    }
  | {
      outcome: "backend-down";
      primary: FaucetClaimError;
      fallback?: FaucetFallbackCandidate;
      alternatives: FaucetFallbackCandidate[];
      suggestionMessage: string;
    };

/** See file header — this NEVER switches networks; it only returns a suggestion. */
export async function claimFaucetWithFallback(
  preferredChain: string,
): Promise<ClaimWithFallbackResult> {
  const primary = await claimFaucet(preferredChain);

  if (primary.success) {
    return { outcome: "claimed", primary };
  }

  /** A different testnet would hit the same user-side problem; do not enumerate alternatives. */
  if (primary.failureKind === "user-error") {
    return { outcome: "user-error", primary };
  }

  const resolved = await resolveChain(preferredChain);
  const failedAlias = resolved?.alias ?? preferredChain.toLowerCase();

  const chains = await listSupportedChains();
  const alternatives: FaucetFallbackCandidate[] = chains
    .filter(
      (c: OmniChain) =>
        c.faucet === true && c.testnet === true && c.alias.toLowerCase() !== failedAlias,
    )
    .map((c) => ({ chain: c.alias, chainName: c.name }));

  const failedName = primary.chainName;
  const fallback = alternatives[0];
  const suggestionMessage = fallback
    ? `The faucet on ${failedName} is currently unavailable. ` +
      `I can try another supported testnet instead — ${fallback.chainName} is available.`
    : `The faucet on ${failedName} is currently unavailable, and no other ` +
      `faucet-enabled testnet is listed in /api/chains right now.`;

  return {
    outcome: "backend-down",
    primary,
    fallback,
    alternatives,
    suggestionMessage,
  };
}
