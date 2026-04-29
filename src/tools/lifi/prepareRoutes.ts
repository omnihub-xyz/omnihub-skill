/**
 * Multi-route variant. `integrator` and `fee` are sourced from `getLifiConfig`
 * and must NEVER be overridden by caller input.
 */

import { fileURLToPath } from "node:url";

import { isAddress } from "viem";

import { lifiPost } from "../../integrations/lifi/client.js";
import { getLifiConfig } from "../../integrations/lifi/config.js";
import type { LifiPreparedRoutes, LifiRoutesResponse } from "../../integrations/lifi/types.js";

export type { LifiPreparedRoutes };

export interface RoutesInput {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  options?: {
    slippage?: number;
    order?: "RECOMMENDED" | "FASTEST" | "CHEAPEST" | "SAFEST";
    allowBridges?: string[];
    denyBridges?: string[];
    allowExchanges?: string[];
    denyExchanges?: string[];
    allowSwitchChain?: boolean;
    maxPriceImpact?: number;
  };
}

export async function prepareRoutes(input: RoutesInput): Promise<LifiPreparedRoutes> {
  const config = getLifiConfig();

  if (!isAddress(input.fromAddress)) {
    throw new Error(`fromAddress is not a valid EVM address: ${input.fromAddress}`);
  }

  if (!/^\d+$/.test(input.fromAmount)) {
    throw new Error(`fromAmount must be a positive integer (wei): ${input.fromAmount}`);
  }

  const body: Record<string, unknown> = {
    fromChainId: input.fromChainId,
    toChainId: input.toChainId,
    fromTokenAddress: input.fromTokenAddress,
    toTokenAddress: input.toTokenAddress,
    fromAmount: input.fromAmount,
    fromAddress: input.fromAddress,
    integrator: config.integrator,
    fee: config.defaultFee,
  };

  if (input.toAddress) body.toAddress = input.toAddress;

  if (input.options) {
    const opts = input.options;
    const routeOptions: Record<string, unknown> = {};

    if (opts.slippage !== undefined) routeOptions.slippage = opts.slippage;
    if (opts.order) routeOptions.order = opts.order;
    if (opts.allowBridges?.length) routeOptions.allowBridges = opts.allowBridges;
    if (opts.denyBridges?.length) routeOptions.denyBridges = opts.denyBridges;
    if (opts.allowExchanges?.length) routeOptions.allowExchanges = opts.allowExchanges;
    if (opts.denyExchanges?.length) routeOptions.denyExchanges = opts.denyExchanges;
    if (opts.allowSwitchChain !== undefined) routeOptions.allowSwitchChain = opts.allowSwitchChain;
    if (opts.maxPriceImpact !== undefined) routeOptions.maxPriceImpact = opts.maxPriceImpact;

    if (Object.keys(routeOptions).length > 0) {
      body.options = routeOptions;
    }
  }

  const raw = await lifiPost<LifiRoutesResponse>("/advanced/routes", body);

  if (!Array.isArray(raw.routes)) {
    throw new Error("LI.FI /advanced/routes returned an unexpected shape");
  }

  if (raw.routes.length === 0) {
    throw new Error(
      "LI.FI found no routes for this request. " +
        "The token pair or chain combination may not be bridgeable.",
    );
  }

  const [topRoute, ...alternatives] = raw.routes;

  return {
    topRoute,
    alternatives,
    routeCount: raw.routes.length,
    raw,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fromChainId = Number(process.env.LIFI_FROM_CHAIN_ID);
  const toChainId = Number(process.env.LIFI_TO_CHAIN_ID);
  const fromTokenAddress = process.env.LIFI_FROM_TOKEN ?? "";
  const toTokenAddress = process.env.LIFI_TO_TOKEN ?? "";
  const fromAmount = process.env.LIFI_FROM_AMOUNT ?? "";
  const fromAddress = process.env.LIFI_FROM_ADDRESS ?? "";

  if (
    !fromChainId ||
    !toChainId ||
    !fromTokenAddress ||
    !toTokenAddress ||
    !fromAmount ||
    !fromAddress
  ) {
    console.error(
      "Usage: LIFI_FROM_CHAIN_ID=1 LIFI_TO_CHAIN_ID=137 LIFI_FROM_TOKEN=0x... LIFI_TO_TOKEN=0x... LIFI_FROM_AMOUNT=... LIFI_FROM_ADDRESS=0x... npm run lifi:routes",
    );
    process.exit(1);
  }

  const result = await prepareRoutes({
    fromChainId,
    toChainId,
    fromTokenAddress,
    toTokenAddress,
    fromAmount,
    fromAddress,
  });

  console.log(`Routes found: ${result.routeCount}`);
  console.log(`\nTop route:`);
  const top = result.topRoute;
  console.log(`  Bridge:       ${top.steps[0]?.tool ?? "unknown"}`);
  console.log(`  Tags:         ${(top.tags ?? []).join(", ") || "none"}`);
  console.log(`  From amount:  ${top.fromAmount} wei`);
  console.log(`  To amount:    ${top.toAmount} wei (min: ${top.toAmountMin})`);
  console.log(`  Gas (USD):    ${top.gasCostUSD ?? "unknown"}`);

  for (let i = 0; i < result.alternatives.length; i++) {
    const alt = result.alternatives[i];
    console.log(`\nAlternative ${i + 1}:`);
    console.log(`  Bridge:       ${alt.steps[0]?.tool ?? "unknown"}`);
    console.log(`  Tags:         ${(alt.tags ?? []).join(", ") || "none"}`);
    console.log(`  To amount:    ${alt.toAmount} wei`);
  }
}
