/**
 * Faucet Pass fallback for testnet actions that need funding.
 *
 * Two-prompt design — do NOT collapse these into one:
 *  - Prompt 1 is a product decision ("do you want to enter this flow?") and
 *    must always be shown to the user. `AUTO_CONFIRM_TRANSACTIONS` does NOT
 *    skip it — only the downstream tx prompt (Prompt 2 inside `executeMint`)
 *    honors auto-confirm.
 *  - `offerFaucetPassAndClaim` is the silent inline variant: every internal
 *    check runs without logs, so the user only sees the clean problem
 *    statement and the decision prompt.
 */

import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { ensureAuthenticated } from "../integrations/omnihub/auth.js";
import { TransactionCancelled } from "../lib/confirm.js";
import { checkFaucetAvailability } from "./checkFaucetAvailability.js";
import {
  checkFaucetPassBalance,
  FAUCET_PASS_CHAIN,
  FAUCET_PASS_CONTRACT,
} from "./checkFaucetPassBalance.js";
import { claimFaucet } from "./claimFaucet.js";
import { prepareMint } from "./prepareMint.js";
import { executeMint } from "./executeMint.js";

export interface FaucetPassFlowInput {
  targetChain: string;
}

export interface FaucetPassOfferResult {
  /** Faucet was claimed. Caller should resume the original action. */
  proceeded: boolean;
  /** User explicitly cancelled at Prompt 1 or Prompt 2. */
  declined: boolean;
  /** Human-readable reason if proceeded=false and declined=false. */
  message?: string;
}

/**
 * Prompt 1 helper. NOT a transaction confirmation: do NOT route this through
 * `confirmTransaction` and do NOT skip it for `AUTO_CONFIRM_TRANSACTIONS=true`.
 */
async function askProductDecision(question: string): Promise<boolean> {
  console.log(`\n${question}`);
  console.log(`  1. Yes`);
  console.log(`  2. No`);

  if (!process.stdin.isTTY) {
    console.log(`\nThis step requires interactive confirmation to continue.`);
    return false;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let answer: string;
  try {
    answer = await rl.question(`\nEnter choice (1 or 2): `);
  } finally {
    rl.close();
  }

  return answer.trim() === "1";
}

/**
 * Silent inline Faucet Pass fallback. Every check before Prompt 1 must remain
 * log-free — adding diagnostic output here regresses the intended UX.
 */
export async function offerFaucetPassAndClaim(params: {
  targetChain: string;
  targetChainName: string;
}): Promise<FaucetPassOfferResult> {
  const { targetChain, targetChainName } = params;

  const passBalance = await checkFaucetPassBalance();

  if (passBalance.holds) {
    const claim = await claimFaucet(targetChain);
    if (claim.success) {
      console.log(`\nFaucet tokens claimed on ${targetChainName}. Resuming your mint...`);
      return { proceeded: true, declined: false };
    }
    console.log(`\nFaucet claim failed: ${claim.message}`);
    return { proceeded: false, declined: false, message: claim.message };
  }

  /** Pass mint cost is read live; never hardcoded — the contract owner can change it. */
  const passMintSummary = await prepareMint({
    chain: FAUCET_PASS_CHAIN,
    address: FAUCET_PASS_CONTRACT,
    quantity: 1,
  });

  if (!passMintSummary.publicMintValid) {
    const reason = passMintSummary.validationWarnings.join("; ");
    console.log(
      `\nUnable to obtain faucet tokens: OmniHub Faucet Pass is not currently available (${reason}).`,
    );
    return { proceeded: false, declined: false, message: reason };
  }

  /** PROMPT 1: first user-visible output in this flow — keep it clean. */
  console.log(
    `\nYou do not have enough test tokens on ${targetChainName} to complete this action.`,
  );
  console.log(
    `\nThis network supports the OmniHub faucet, but faucet access requires holding OmniHub Faucet Pass.`,
  );
  console.log(`The pass is minted on Base.`);
  console.log(`\nCurrent OmniHub Faucet Pass mint cost: ${passMintSummary.mintFeeEth} ETH.`);

  const proceed = await askProductDecision(
    `Would you like to mint OmniHub Faucet Pass and then claim faucet tokens on ${targetChainName}?`,
  );

  if (!proceed) {
    return { proceeded: false, declined: true };
  }

  console.log(`\nPlease review and confirm the transaction details for the pass mint below.`);

  /** PROMPT 2: standard tx confirmation, fired by executeMint via confirmTransaction. */
  try {
    const mintResult = await executeMint({
      chain: FAUCET_PASS_CHAIN,
      address: FAUCET_PASS_CONTRACT,
      quantity: 1,
    });
    console.log(`\nOmniHub Faucet Pass minted. (${mintResult.transactionHash})`);
  } catch (err) {
    if (err instanceof TransactionCancelled) {
      return { proceeded: false, declined: true };
    }
    throw err;
  }

  const claim = await claimFaucet(targetChain);
  if (claim.success) {
    console.log(`Faucet tokens claimed on ${targetChainName}. Resuming your mint...`);
    return { proceeded: true, declined: false };
  }

  console.log(`\nPass was minted but faucet claim failed: ${claim.message}`);
  return { proceeded: false, declined: false, message: claim.message };
}

/**
 * Standalone variant for direct requests ("get a faucet pass"). Logs status
 * lines that `offerFaucetPassAndClaim` deliberately suppresses.
 */
export async function runFaucetPassFlow(input: FaucetPassFlowInput): Promise<void> {
  const { targetChain } = input;

  const availability = await checkFaucetAvailability(targetChain);
  const availResult = Array.isArray(availability) ? availability[0] : availability;

  if (!availResult.available) {
    console.log(`\n${availResult.message}`);
    return;
  }

  await ensureAuthenticated();

  const passBalance = await checkFaucetPassBalance();

  if (passBalance.holds) {
    console.log(`\nOmniHub Faucet Pass detected.`);
    const claim = await claimFaucet(targetChain);
    if (claim.success) {
      console.log(`\n${claim.message}`);
      console.log(
        `\nOmniHub Faucet Pass already detected. Faucet claim completed on ${claim.chainName}. You can now continue.`,
      );
    } else {
      console.log(`\nFaucet claim failed: ${claim.message}`);
    }
    return;
  }

  const passMintSummary = await prepareMint({
    chain: FAUCET_PASS_CHAIN,
    address: FAUCET_PASS_CONTRACT,
    quantity: 1,
  });

  if (!passMintSummary.publicMintValid) {
    const reasons = passMintSummary.validationWarnings.join("; ");
    console.log(`\nOmniHub Faucet Pass is not currently mintable: ${reasons}`);
    return;
  }

  console.log(`\nYou do not currently hold an OmniHub Faucet Pass.`);
  console.log(
    `\nThe pass is minted on Base and unlocks faucet access on supported testnet networks.`,
  );
  console.log(`\nCurrent OmniHub Faucet Pass mint cost: ${passMintSummary.mintFeeEth} ETH.`);
  console.log(
    `After minting, faucet tokens will be claimed on ${availResult.chainName} automatically.`,
  );

  const proceed = await askProductDecision(
    `Would you like to mint OmniHub Faucet Pass and then claim faucet tokens on ${availResult.chainName}?`,
  );

  if (!proceed) {
    console.log(`\nCancelled. Nothing was sent.`);
    return;
  }

  console.log(`\nPlease review and confirm the transaction details for the pass mint below.`);

  try {
    const mintResult = await executeMint({
      chain: FAUCET_PASS_CHAIN,
      address: FAUCET_PASS_CONTRACT,
      quantity: 1,
    });
    console.log(`\nOmniHub Faucet Pass minted. (${mintResult.transactionHash})`);
  } catch (err) {
    if (err instanceof TransactionCancelled) {
      console.log(`\nTransaction cancelled. Nothing was sent.`);
      return;
    }
    throw err;
  }

  const claim = await claimFaucet(targetChain);
  if (claim.success) {
    console.log(`\n${claim.message}`);
    console.log(
      `\nOmniHub Faucet Pass minted successfully. Faucet claim completed on ${claim.chainName}. You can now continue minting NFTs or creating your collection.`,
    );
  } else {
    console.log(`\nPass was minted but faucet claim failed: ${claim.message}`);
  }
}

export async function faucetPassFlow(): Promise<void> {
  const targetChain = process.env.OMNIHUB_CHAIN?.trim();
  if (!targetChain) {
    throw new Error(
      "OMNIHUB_CHAIN is required. Example: OMNIHUB_CHAIN=robinhood-testnet npm run omnihub:faucet:pass-flow",
    );
  }
  await runFaucetPassFlow({ targetChain });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await faucetPassFlow();
}
