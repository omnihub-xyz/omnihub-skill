/**
 * Conversational bridge orchestrator implementing prepare → confirm → execute.
 *
 * Hard invariants:
 * - Token decimals come from resolved token / chain metadata; never guessed.
 * - Approval is for the exact required amount — unlimited approval is opt-in only.
 * - Source-chain RPC comes from `BridgeChainContext`, never directly from env.
 * - EVM operations (allowance, approval, sendTransaction) MUST NOT run for
 *   non-EVM source chains; LI.FI may classify them as `SVM`/`UTXO`/etc.
 */

import { createPublicClient, formatEther, formatUnits, http, isAddress } from "viem";

import { confirmTransaction, TransactionCancelled } from "../../lib/confirm.js";
import { getAccount } from "../../lib/wallet.js";
import {
  resolveBridgeChainPair,
  isEvmContext,
  isNonEvmContext,
  type BridgeChainContext,
} from "./resolveBridgeChainContext.js";
import { resolveTokenBySymbol, resolveTokenByAddress, NATIVE_TOKEN_ADDRESS } from "./getTokens.js";
import { prepareQuote } from "./prepareQuote.js";
import { prepareRoutes } from "./prepareRoutes.js";
import { checkAllowance } from "./checkAllowance.js";
import { prepareApproval } from "./prepareApproval.js";
import { executeApproval } from "./executeApproval.js";
import { executeBridge } from "./executeBridge.js";
import { getBridgeStatus } from "./getStatus.js";
import type { LifiPreparedQuote, LifiRoute } from "../../integrations/lifi/types.js";

export { TransactionCancelled };

export interface BridgeFlowInput {
  fromChain: string | number;
  toChain: string | number;
  fromToken: string;
  toToken: string;
  /** Human-readable amount (e.g. `"1.5"`) — NOT wei. Converted internally. */
  fromAmount: string;
  /** Defaults to `fromAddress`. */
  toAddress?: string;
  order?: "RECOMMENDED" | "FASTEST" | "CHEAPEST" | "SAFEST";
  bridges?: string[];
  denyBridges?: string[];
  compareRoutes?: boolean;
  /** Required for `generic-evm` source chains. Never needed for `omnihub-evm`. */
  evmRpcOverride?: string;
  skipOmnihubLookup?: boolean;
}

export interface BridgeFlowResult {
  approvalHash?: string;
  bridgeHash: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
}

/** Future extensibility stubs for OmniHub mainnet funding trigger. */
export type AfterBridgeCallback = (bridgeResult: BridgeFlowResult) => Promise<void>;

export async function suggestBridgeForFunding(
  _targetChainId: number,
  _requiredAmountWei: bigint,
  _requiredTokenSymbol: string,
): Promise<{ suggested: false }> {
  return { suggested: false };
}

export async function prepareBridgeForTargetAction(
  _bridgeInput: BridgeFlowInput,
  _afterBridgeCallback: AfterBridgeCallback,
): Promise<void> {
  throw new Error("prepareBridgeForTargetAction is not yet implemented");
}

export async function continueOriginalActionAfterFunding(
  callback: AfterBridgeCallback,
  bridgeResult: BridgeFlowResult,
): Promise<void> {
  await callback(bridgeResult);
}

interface ResolvedToken {
  address: string;
  decimals: number;
  symbol: string;
}

async function resolveFromToken(
  input: string,
  lifiChainId: number,
  nativeSymbol: string,
): Promise<ResolvedToken> {
  if (input.toUpperCase() === nativeSymbol.toUpperCase()) {
    return { address: NATIVE_TOKEN_ADDRESS, decimals: 18, symbol: nativeSymbol };
  }

  if (isAddress(input)) {
    if (input.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
      return { address: NATIVE_TOKEN_ADDRESS, decimals: 18, symbol: nativeSymbol };
    }
    const token = await resolveTokenByAddress(input, lifiChainId);
    if (!token) {
      throw new Error(
        `The token at address ${input} was not found on this network. ` +
          "Please verify the contract address is correct and that the token is supported on this chain.",
      );
    }
    return { address: token.address, decimals: token.decimals, symbol: token.symbol };
  }

  const token = await resolveTokenBySymbol(input, lifiChainId);
  if (!token) {
    throw new Error(
      `Could not find token "${input}" on this network. ` +
        "Please use the exact token symbol (e.g. USDC, WETH) or provide the contract address.",
    );
  }
  return { address: token.address, decimals: token.decimals, symbol: token.symbol };
}

async function resolveToTokenAddress(
  input: string,
  lifiChainId: number,
  nativeSymbol: string,
): Promise<string> {
  if (input.toUpperCase() === nativeSymbol.toUpperCase()) return NATIVE_TOKEN_ADDRESS;
  if (isAddress(input)) return input;

  const token = await resolveTokenBySymbol(input, lifiChainId);
  if (!token) {
    throw new Error(
      `Could not find token "${input}" on the destination network. ` +
        "Please use the exact token symbol (e.g. USDC, WETH) or provide the contract address.",
    );
  }
  return token.address;
}

/** String arithmetic to avoid float precision loss when converting to wei. */
function toWei(humanAmount: string, decimals: number): bigint {
  const [intPart = "0", fracPart = ""] = humanAmount.split(".");
  const fracPadded = fracPart.padEnd(decimals, "0").slice(0, decimals);
  const raw = BigInt(intPart) * BigInt(10 ** decimals) + BigInt(fracPadded || "0");
  if (raw === 0n) {
    throw new Error(`fromAmount "${humanAmount}" resolves to 0 — check the value.`);
  }
  return raw;
}

async function runApprovalIfNeeded(
  fromTokenAddress: string,
  fromAddress: string,
  approvalAddress: string,
  fromAmountWei: bigint,
  fromTokenSymbol: string,
  fromChainId: number,
  rpcUrl: string,
): Promise<string | undefined> {
  const allowanceResult = await checkAllowance(
    fromTokenAddress,
    fromAddress,
    approvalAddress,
    fromAmountWei,
    rpcUrl,
  );

  if (!allowanceResult.approvalNeeded) return undefined;

  const amountFormatted = fromAmountWei.toString();

  await confirmTransaction(
    {
      Action: "ERC20 Token Approval",
      Token: `${fromTokenSymbol} (${fromTokenAddress})`,
      Spender: approvalAddress,
      Amount: amountFormatted,
      "Chain ID": String(fromChainId),
    },
    [
      "This approval is required before the bridge transaction.",
      "It does not send funds — it allows the bridge contract to spend your tokens.",
      "The approved amount matches exactly what will be bridged.",
    ],
  );

  const preparedApproval = await prepareApproval({
    tokenAddress: fromTokenAddress,
    spenderAddress: approvalAddress,
    amount: fromAmountWei,
    chainId: fromChainId,
  });

  const approvalResult = await executeApproval(preparedApproval, rpcUrl);
  console.log(`\nApproval confirmed: ${approvalResult.transactionHash}`);
  return approvalResult.transactionHash;
}

export async function runBridgeFlow(input: BridgeFlowInput): Promise<BridgeFlowResult> {
  const account = getAccount();
  const fromAddress = account.address;

  const { from: fromCtx, to: toCtx } = await resolveBridgeChainPair(
    input.fromChain,
    input.toChain,
    {
      evmRpcOverride: input.evmRpcOverride,
      skipOmnihubLookup: input.skipOmnihubLookup,
    },
  );

  if (isNonEvmContext(fromCtx)) {
    throw new Error(
      `"${fromCtx.name}" is not yet supported for bridge execution. ` +
        "This route involves a non-EVM network (e.g. Solana, Bitcoin), which requires " +
        "a separate signing path that is not yet available. " +
        "Route discovery via LI.FI is possible, but transaction execution is not supported.",
    );
  }

  /** Always present for EVM contexts — enforced by `resolveBridgeChainContext`. */
  const sourceRpcUrl = fromCtx.rpcUrl!;

  const fromToken = await resolveFromToken(
    input.fromToken,
    fromCtx.lifiChainId,
    fromCtx.nativeSymbol,
  );

  const toTokenAddress = await resolveToTokenAddress(
    input.toToken,
    toCtx.lifiChainId,
    toCtx.nativeSymbol,
  );

  const fromAmountWei = toWei(input.fromAmount, fromToken.decimals);
  const fromAmountWeiStr = fromAmountWei.toString();

  let quote: LifiPreparedQuote;
  let selectedRoute: LifiRoute | undefined;

  if (input.compareRoutes) {
    const routes = await prepareRoutes({
      fromChainId: fromCtx.lifiChainId,
      toChainId: toCtx.lifiChainId,
      fromTokenAddress: fromToken.address,
      toTokenAddress,
      fromAmount: fromAmountWeiStr,
      fromAddress,
      toAddress: input.toAddress,
      options: {
        order: input.order,
        allowBridges: input.bridges,
        denyBridges: input.denyBridges,
      },
    });

    selectedRoute = routes.topRoute;
    const step = selectedRoute.steps[0];

    quote = {
      fromChainId: fromCtx.lifiChainId,
      toChainId: toCtx.lifiChainId,
      fromToken: {
        symbol: selectedRoute.fromToken.symbol,
        address: selectedRoute.fromToken.address,
        decimals: selectedRoute.fromToken.decimals,
        chainId: selectedRoute.fromToken.chainId,
      },
      toToken: {
        symbol: selectedRoute.toToken.symbol,
        address: selectedRoute.toToken.address,
        decimals: selectedRoute.toToken.decimals,
        chainId: selectedRoute.toToken.chainId,
      },
      fromAmount: selectedRoute.fromAmount,
      toAmount: selectedRoute.toAmount,
      toAmountMin: selectedRoute.toAmountMin,
      feeSummary:
        (step?.estimate?.feeCosts ?? []).length > 0
          ? step.estimate.feeCosts
              .map((fc) => `${fc.name}: ${fc.amountUSD ? `$${fc.amountUSD}` : (fc.amount ?? "?")}`)
              .join("; ")
          : "see route details",
      gasCostUSD: selectedRoute.gasCostUSD,
      tool: step?.toolDetails?.name ?? step?.tool ?? "unknown",
      transactionRequest: step?.transactionRequest ?? {
        from: fromAddress,
        to: "",
        chainId: fromCtx.lifiChainId,
        data: "0x",
        value: "0",
      },
      approvalAddress: step?.estimate?.approvalAddress,
      integrator: "OmniHub-Skill",
      appliedFee: 0.01,
      raw: {} as never,
    };
  } else {
    quote = await prepareQuote({
      fromChain: fromCtx.lifiChainId,
      toChain: toCtx.lifiChainId,
      fromToken: fromToken.address,
      toToken: toTokenAddress,
      fromAmount: fromAmountWeiStr,
      fromAddress,
      toAddress: input.toAddress,
      order: input.order,
      bridges: input.bridges,
      denyBridges: input.denyBridges,
    });
  }

  /**
   * Preflight balance check for native-token bridges. Runs after the quote
   * so the real `gasLimit`/`gasPrice` from `transactionRequest` are known —
   * fails early with a readable error instead of an EVM-level revert.
   */
  if (isEvmContext(fromCtx) && fromToken.address === NATIVE_TOKEN_ADDRESS) {
    const publicClient = createPublicClient({ transport: http(sourceRpcUrl) });
    const balance = await publicClient.getBalance({ address: fromAddress as `0x${string}` });

    const valueWei = BigInt(quote.transactionRequest?.value ?? "0");
    const gasLimit = BigInt(quote.transactionRequest?.gasLimit ?? "0");
    const gasPrice = BigInt(
      quote.transactionRequest?.maxFeePerGas ?? quote.transactionRequest?.gasPrice ?? "0",
    );
    const estimatedGasCost = gasLimit > 0n && gasPrice > 0n ? gasLimit * gasPrice : 0n;
    const totalNeeded = valueWei + estimatedGasCost;

    if (totalNeeded > 0n && balance < totalNeeded) {
      const sym = fromCtx.nativeSymbol;
      throw new Error(
        `Your wallet does not have enough ${sym} on ${fromCtx.name} to cover this bridge and the estimated gas cost. ` +
          `Balance: ${formatEther(balance)} ${sym}, ` +
          `needed: approximately ${formatEther(totalNeeded)} ${sym}. ` +
          `Please add funds to your wallet on ${fromCtx.name} before retrying.`,
      );
    }
  }

  const fromDecimals = quote.fromToken.decimals;
  const toDecimals = quote.toToken.decimals;
  const sendFormatted = `${formatUnits(BigInt(quote.fromAmount), fromDecimals)} ${quote.fromToken.symbol}`;
  const receiveFormatted = `${formatUnits(BigInt(quote.toAmount), toDecimals)} ${quote.toToken.symbol}`;
  const minFormatted = `${formatUnits(BigInt(quote.toAmountMin), toDecimals)} ${quote.toToken.symbol}`;

  let approvalHash: string | undefined;
  const needsApprovalCheck =
    isEvmContext(fromCtx) && fromToken.address !== NATIVE_TOKEN_ADDRESS && !!quote.approvalAddress;

  if (needsApprovalCheck && quote.approvalAddress) {
    approvalHash = await runApprovalIfNeeded(
      fromToken.address,
      fromAddress,
      quote.approvalAddress,
      fromAmountWei,
      quote.fromToken.symbol,
      fromCtx.lifiChainId,
      sourceRpcUrl,
    );
  }

  /** Internal routing details (OmniHub vs LI.FI registry) MUST stay out of the user-facing summary. */
  const approvalStatus =
    fromToken.address === NATIVE_TOKEN_ADDRESS
      ? "Not required (native token)"
      : approvalHash !== undefined
        ? `Completed (${approvalHash.slice(0, 10)}...)`
        : "Not required (sufficient allowance)";

  const warnings: string[] = [];
  if (quote.toAmountMin !== quote.toAmount) {
    warnings.push(`Minimum receive may be lower due to slippage: ${minFormatted}`);
  }

  await confirmTransaction(
    {
      "From chain": fromCtx.name,
      "To chain": toCtx.name,
      Send: sendFormatted,
      Receive: receiveFormatted,
      "Min receive": minFormatted,
      Bridge: quote.tool,
      "Gas (USD)": quote.gasCostUSD ? `$${quote.gasCostUSD}` : "unknown",
      "Bridge fee": quote.feeSummary,
      "Protocol fee": `${quote.appliedFee * 100}%`,
      Approval: approvalStatus,
    },
    warnings,
  );

  if (selectedRoute) {
    const { prepareStepTransaction } = await import("./prepareStepTransaction.js");
    const step = selectedRoute.steps[0];
    if (!step) throw new Error("Selected route has no steps");
    const stepTx = await prepareStepTransaction(step);
    quote = { ...quote, transactionRequest: stepTx.transactionRequest };
  }

  const bridgeResult = await executeBridge(quote.transactionRequest, sourceRpcUrl);

  return {
    approvalHash,
    bridgeHash: bridgeResult.transactionHash,
    fromChainId: fromCtx.lifiChainId,
    toChainId: toCtx.lifiChainId,
    fromToken: quote.fromToken.symbol,
    toToken: quote.toToken.symbol,
    fromAmount: sendFormatted,
    toAmount: receiveFormatted,
  };
}

export async function checkBridgeStatus(txHash: string, fromChainId: number, toChainId: number) {
  return getBridgeStatus({ txHash, fromChain: fromChainId, toChain: toChainId });
}
