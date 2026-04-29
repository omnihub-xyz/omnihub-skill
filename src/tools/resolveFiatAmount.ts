/**
 * Converts a USD amount to a token amount for use as `LIFI_FROM_AMOUNT`.
 *
 * Price source priority: stablecoin shortcut ($1.00 for known pegged tokens)
 * → LI.FI `priceUSD` → Coinbase spot. The LI.FI quote remains the source of
 * truth for execution; this is only an input-conversion helper.
 */

import { fileURLToPath } from "node:url";

import { resolveBridgeChainContext } from "./lifi/resolveBridgeChainContext.js";
import { resolveTokenBySymbol } from "./lifi/getTokens.js";

/** Tokens whose market price is treated as exactly $1.00 with no lookup. */
const STABLECOINS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "FRAX",
  "BUSD",
  "LUSD",
  "TUSD",
  "USDP",
  "CRVUSD",
  "USDS",
]);

async function fetchCoinbasePrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${symbol.toUpperCase()}-USD/spot`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { amount?: string } };
    const price = parseFloat(json.data?.amount ?? "");
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export interface FiatAmountResult {
  /** Human-readable token amount; pass as `LIFI_FROM_AMOUNT`. */
  tokenAmount: string;
  token: string;
  usdAmount: number;
  priceUSD: number;
  priceSource: "lifi" | "coinbase" | "stablecoin";
}

export async function resolveFiatAmount(
  chainInput: string,
  tokenInput: string,
  usdAmount: number,
): Promise<FiatAmountResult> {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    throw new Error(`USD amount must be a positive number: ${usdAmount}`);
  }

  if (STABLECOINS.has(tokenInput.toUpperCase())) {
    return {
      tokenAmount: usdAmount.toFixed(8).replace(/\.?0+$/, ""),
      token: tokenInput.toUpperCase(),
      usdAmount,
      priceUSD: 1.0,
      priceSource: "stablecoin",
    };
  }

  const chainCtx = await resolveBridgeChainContext(chainInput);

  const lifiToken = await resolveTokenBySymbol(tokenInput, chainCtx.lifiChainId);
  const lifiPrice = lifiToken?.priceUSD ? parseFloat(lifiToken.priceUSD) : NaN;

  if (Number.isFinite(lifiPrice) && lifiPrice > 0) {
    return {
      tokenAmount: (usdAmount / lifiPrice).toFixed(8).replace(/\.?0+$/, ""),
      token: lifiToken!.symbol,
      usdAmount,
      priceUSD: lifiPrice,
      priceSource: "lifi",
    };
  }

  const coinbasePrice = await fetchCoinbasePrice(tokenInput);
  if (coinbasePrice !== null) {
    return {
      tokenAmount: (usdAmount / coinbasePrice).toFixed(8).replace(/\.?0+$/, ""),
      token: lifiToken?.symbol ?? tokenInput.toUpperCase(),
      usdAmount,
      priceUSD: coinbasePrice,
      priceSource: "coinbase",
    };
  }

  throw new Error(
    `Could not determine a USD price for "${tokenInput}" on ${chainCtx.name}. ` +
      "LI.FI token data has no price for this token and the Coinbase price API returned no result. " +
      "Specify the amount directly in token units instead (e.g. '0.0001 ETH').",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chain = process.env.FIAT_CHAIN?.trim() ?? "";
  const token = process.env.FIAT_TOKEN?.trim() ?? "";
  const usdStr = process.env.FIAT_USD_AMOUNT?.trim() ?? "";
  const usdAmount = parseFloat(usdStr);

  if (!chain || !token || !usdStr || !Number.isFinite(usdAmount)) {
    console.error(
      "Usage: FIAT_CHAIN=base FIAT_TOKEN=ETH FIAT_USD_AMOUNT=0.30 npm run tool -- fiat-to-token",
    );
    process.exit(1);
  }

  const result = await resolveFiatAmount(chain, token, usdAmount);
  console.log(`USD input:    $${result.usdAmount}`);
  console.log(`Token:        ${result.token}`);
  console.log(`Price source: ${result.priceSource} ($${result.priceUSD} per ${result.token})`);
  console.log(`Token amount: ${result.tokenAmount} ${result.token}`);
}
