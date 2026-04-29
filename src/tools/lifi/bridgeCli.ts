/**
 * Internal CLI backend for bridge execution. The conversational skill is the
 * user-facing entry point — this script is invoked silently after consent.
 *
 * Hard rule: this is the ONLY approved execution path. Never bypass it with
 * ad-hoc scripts, direct `executeBridge()` calls, or manual tsx invocations.
 *
 * `AUTO_CONFIRM_TRANSACTIONS=true` skips the per-tx prompt and MUST be set
 * when called from skill context (consent was collected conversationally).
 */

import { runBridgeFlow, TransactionCancelled } from "./bridgeFlow.js";

const fromChain = process.env.LIFI_FROM_CHAIN?.trim() ?? "";
const toChain = process.env.LIFI_TO_CHAIN?.trim() ?? "";
const fromToken = process.env.LIFI_FROM_TOKEN?.trim() ?? "ETH";
const toToken = process.env.LIFI_TO_TOKEN?.trim() ?? "ETH";
const fromAmount = process.env.LIFI_FROM_AMOUNT?.trim() ?? "";

if (!fromChain || !toChain || !fromAmount) {
  console.error(
    "Missing required env vars.\n" +
      "Usage: LIFI_FROM_CHAIN=base LIFI_TO_CHAIN=arbitrum-one LIFI_FROM_AMOUNT=0.0002 npm run lifi:bridge\n" +
      "Optional: LIFI_FROM_TOKEN=ETH LIFI_TO_TOKEN=ETH AUTO_CONFIRM_TRANSACTIONS=true",
  );
  process.exit(1);
}

try {
  const result = await runBridgeFlow({ fromChain, toChain, fromToken, toToken, fromAmount });

  console.log("\nBridge submitted successfully.");
  console.log(`Tx hash:    ${result.bridgeHash}`);
  console.log(`Sent:       ${result.fromAmount} (chain ${result.fromChainId})`);
  console.log(`Receiving:  ${result.toAmount} (chain ${result.toChainId})`);
  if (result.approvalHash) {
    console.log(`Approval:   ${result.approvalHash}`);
  }
} catch (err) {
  if (err instanceof TransactionCancelled) {
    console.log("Bridge cancelled. Nothing was sent.");
    process.exit(0);
  }
  throw err;
}
