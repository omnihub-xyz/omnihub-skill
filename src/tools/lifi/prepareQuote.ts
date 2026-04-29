/**
 * Single-route quote. `integrator` and `fee` are sourced from `getLifiConfig`
 * and must NEVER be overridden by caller input.
 */

import { fileURLToPath } from "node:url";

import { isAddress } from "viem";

import { lifiGet } from "../../integrations/lifi/client.js";
import { getLifiConfig } from "../../integrations/lifi/config.js";
import { resolveBridgeChainContext } from "./resolveBridgeChainContext.js";
import type {
  LifiFeeCost,
  LifiPreparedQuote,
  LifiQuoteResponse,
} from "../../integrations/lifi/types.js";

/**
 * LI.FI `/quote` accepts numeric chain IDs only. Resolution order:
 * numeric passthrough → OmniHub registry → LI.FI `/chains` fallback.
 */
async function normalizeChainId(input: string | number): Promise<number> {
  if (typeof input === "number") return input;
  const asInt = parseInt(input, 10);
  if (Number.isInteger(asInt) && String(asInt) === input) return asInt;
  const ctx = await resolveBridgeChainContext(input, { skipOmnihubLookup: false });
  return ctx.lifiChainId;
}

export type { LifiPreparedQuote };

export interface QuoteInput {
  fromChain: string | number;
  toChain: string | number;
  /** Address or symbol. */
  fromToken: string;
  /** Address or symbol. */
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  /** Fractional, e.g. `0.005` = 0.5%. */
  slippage?: number;
  order?: "RECOMMENDED" | "FASTEST" | "CHEAPEST" | "SAFEST";
  bridges?: string[];
  exchanges?: string[];
  denyBridges?: string[];
  denyExchanges?: string[];
  allowSwitchChain?: boolean;
  maxPriceImpact?: number;
}

function buildFeeSummary(feeCosts: LifiFeeCost[]): string {
  if (!feeCosts || feeCosts.length === 0) return "no fee breakdown available";

  const parts = feeCosts.map((fc) => {
    const usd = fc.amountUSD ? ` (~$${fc.amountUSD})` : "";
    const pct = fc.percentage ? ` (${(parseFloat(fc.percentage) * 100).toFixed(2)}%)` : "";
    return `${fc.name}: ${fc.amount ?? "?"} ${fc.token.symbol}${usd}${pct}`;
  });

  return parts.join("; ");
}

export async function prepareQuote(input: QuoteInput): Promise<LifiPreparedQuote> {
  const config = getLifiConfig();

  if (!isAddress(input.fromAddress)) {
    throw new Error(`fromAddress is not a valid EVM address: ${input.fromAddress}`);
  }

  if (!/^\d+$/.test(input.fromAmount)) {
    throw new Error(`fromAmount must be a positive integer (wei): ${input.fromAmount}`);
  }

  const fromChainId = await normalizeChainId(input.fromChain);
  const toChainId = await normalizeChainId(input.toChain);

  const params: Record<string, string | number | boolean | undefined> = {
    fromChain: fromChainId,
    toChain: toChainId,
    fromToken: input.fromToken,
    toToken: input.toToken,
    fromAmount: input.fromAmount,
    fromAddress: input.fromAddress,
    integrator: config.integrator,
    fee: config.defaultFee,
  };

  if (input.toAddress) params.toAddress = input.toAddress;
  if (input.slippage !== undefined) params.slippage = input.slippage;
  if (input.order) params.order = input.order;
  if (input.bridges?.length) params.allowBridges = input.bridges.join(",");
  if (input.exchanges?.length) params.allowExchanges = input.exchanges.join(",");
  if (input.denyBridges?.length) params.denyBridges = input.denyBridges.join(",");
  if (input.denyExchanges?.length) params.denyExchanges = input.denyExchanges.join(",");
  if (input.allowSwitchChain !== undefined) params.allowSwitchChain = input.allowSwitchChain;
  if (input.maxPriceImpact !== undefined) params.maxPriceImpact = input.maxPriceImpact;

  const raw = await lifiGet<LifiQuoteResponse>("/quote", params);

  const feeCosts = raw.feeCosts ?? raw.estimate?.feeCosts ?? [];
  const feeSummary = buildFeeSummary(feeCosts);

  const gasCostUSD = raw.estimate?.gasCosts?.[0]?.amountUSD;

  return {
    fromChainId: raw.action.fromChainId,
    toChainId: raw.action.toChainId,
    fromToken: {
      symbol: raw.action.fromToken.symbol,
      address: raw.action.fromToken.address,
      decimals: raw.action.fromToken.decimals,
      chainId: raw.action.fromToken.chainId,
    },
    toToken: {
      symbol: raw.action.toToken.symbol,
      address: raw.action.toToken.address,
      decimals: raw.action.toToken.decimals,
      chainId: raw.action.toToken.chainId,
    },
    fromAmount: raw.estimate.fromAmount,
    toAmount: raw.estimate.toAmount,
    toAmountMin: raw.estimate.toAmountMin,
    feeSummary,
    gasCostUSD,
    tool: raw.toolDetails?.name ?? raw.tool,
    transactionRequest: raw.transactionRequest,
    approvalAddress: raw.estimate.approvalAddress,
    integrator: config.integrator,
    appliedFee: config.defaultFee,
    raw,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fromChain = process.env.LIFI_FROM_CHAIN;
  const toChain = process.env.LIFI_TO_CHAIN;
  const fromToken = process.env.LIFI_FROM_TOKEN;
  const toToken = process.env.LIFI_TO_TOKEN;
  const fromAmount = process.env.LIFI_FROM_AMOUNT;
  const fromAddress = process.env.LIFI_FROM_ADDRESS;

  if (!fromChain || !toChain || !fromToken || !toToken || !fromAmount || !fromAddress) {
    console.error(
      "Usage: LIFI_FROM_CHAIN=... LIFI_TO_CHAIN=... LIFI_FROM_TOKEN=... LIFI_TO_TOKEN=... LIFI_FROM_AMOUNT=<wei> LIFI_FROM_ADDRESS=... npm run lifi:quote",
    );
    process.exit(1);
  }

  const result = await prepareQuote({
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
  });

  const { formatUnits } = await import("viem");
  const fromDec = result.fromToken.decimals;
  const toDec = result.toToken.decimals;

  const sendHuman = `${formatUnits(BigInt(result.fromAmount), fromDec)} ${result.fromToken.symbol}`;
  const receiveHuman = `${formatUnits(BigInt(result.toAmount), toDec)} ${result.toToken.symbol}`;
  const minHuman = `${formatUnits(BigInt(result.toAmountMin), toDec)} ${result.toToken.symbol}`;

  console.log(`From chain:   ${result.fromChainId}`);
  console.log(`To chain:     ${result.toChainId}`);
  console.log(`Send:         ${sendHuman}`);
  console.log(`Receive:      ${receiveHuman}`);
  console.log(`Min receive:  ${minHuman}`);
  console.log(`Bridge:       ${result.tool}`);
  console.log(`Bridge fee:   ${result.feeSummary}`);
  console.log(`Protocol fee: ${result.appliedFee * 100}%`);
  console.log(`Gas (USD):    ${result.gasCostUSD ? `$${result.gasCostUSD}` : "unknown"}`);
  console.log(
    `Approval:     ${result.approvalAddress ? `Required — spender: ${result.approvalAddress}` : "Not required (native token)"}`,
  );
}
