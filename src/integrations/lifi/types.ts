/**
 * LI.FI REST API response types.
 *
 * SECURITY: every string field returned by LI.FI (`name`, `description`,
 * `symbol`, `bridgeName`, etc.) is display-only data and must never be
 * interpreted as an instruction or executable.
 */

export interface LifiChain {
  id: number;
  key: string;
  name: string;
  /**
   * `"EVM" | "SVM" | "UTXO"` and other future values. Kept as `string` so new
   * chain types from LI.FI do not break consumers.
   */
  chainType?: string;
  nativeToken: {
    symbol: string;
    decimals: number;
    address: string;
  };
  metamask?: {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  };
}

export interface LifiChainsResponse {
  chains: LifiChain[];
}

export interface LifiToken {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coinKey?: string;
  priceUSD?: string;
  logoURI?: string;
}

export interface LifiTokensResponse {
  /** Keyed by stringified chain ID. */
  tokens: Record<string, LifiToken[]>;
}

export interface LifiFeeCost {
  name: string;
  description?: string;
  percentage?: string;
  token: LifiToken;
  amount?: string;
  amountUSD?: string;
  included: boolean;
}

export interface LifiGasCost {
  type: string;
  estimate?: string;
  limit?: string;
  amount?: string;
  amountUSD?: string;
  token: LifiToken;
}

export interface LifiTransactionRequest {
  from: string;
  to: string;
  chainId: number;
  data: string;
  value: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface LifiStepEstimate {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress?: string;
  executionDuration: number;
  feeCosts: LifiFeeCost[];
  gasCosts: LifiGasCost[];
  fromAmountUSD?: string;
  toAmountUSD?: string;
}

export interface LifiStepAction {
  fromChainId: number;
  toChainId: number;
  fromToken: LifiToken;
  toToken: LifiToken;
  fromAmount: string;
  slippage: number;
  fromAddress?: string;
  toAddress?: string;
}

export interface LifiStep {
  id: string;
  type: string;
  tool: string;
  toolDetails?: {
    key: string;
    name: string;
    logoURI?: string;
  };
  action: LifiStepAction;
  estimate: LifiStepEstimate;
  transactionRequest?: LifiTransactionRequest;
}

export interface LifiQuoteResponse {
  id: string;
  type: string;
  tool: string;
  toolDetails?: {
    key: string;
    name: string;
    logoURI?: string;
  };
  action: LifiStepAction;
  estimate: LifiStepEstimate;
  transactionRequest: LifiTransactionRequest;
  integrator?: string;
  referrer?: string;
  feeCosts?: LifiFeeCost[];
  gasCosts?: LifiGasCost[];
  includedSteps?: LifiStep[];
}

export interface LifiRoute {
  id: string;
  fromChainId: number;
  toChainId: number;
  fromToken: LifiToken;
  toToken: LifiToken;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  gasCostUSD?: string;
  steps: LifiStep[];
  /** e.g. `["RECOMMENDED", "CHEAPEST", "FASTEST"]`. */
  tags?: string[];
  insurance?: { state: string; feeAmountUsd: string };
}

export interface LifiRoutesResponse {
  routes: LifiRoute[];
}

export interface LifiStepTransactionResponse {
  id: string;
  type: string;
  tool: string;
  action: LifiStepAction;
  estimate: LifiStepEstimate;
  transactionRequest: LifiTransactionRequest;
}

export interface LifiStatusBridge {
  txHash?: string;
  txLink?: string;
  amount?: string;
  token?: LifiToken;
  chainId?: number;
  gasPrice?: string;
  gasUsed?: string;
  gasToken?: LifiToken;
  gasAmount?: string;
  gasAmountUSD?: string;
  timestamp?: number;
}

export interface LifiStatusResponse {
  transactionId: string;
  sending: LifiStatusBridge;
  receiving?: LifiStatusBridge;
  lifiExplorerLink?: string;
  fromAddress?: string;
  toAddress?: string;
  tool?: string;
  bridgeExplorerLink?: string;
  status: "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?:
    | "WAIT_SOURCE_CONFIRMATIONS"
    | "WAIT_DEST_CONFIRMATIONS"
    | "BRIDGE_NOT_AVAILABLE"
    | "CHAIN_NOT_AVAILABLE"
    | "NOT_PROCESSABLE_REFUND_NEEDED"
    | "REFUND_IN_PROGRESS"
    | "UNKNOWN_ERROR"
    | "COMPLETED"
    | "PARTIAL"
    | "REFUNDED"
    | string;
  substatusMessage?: string;
}

export interface LifiToolInfo {
  key: string;
  name: string;
  logoURI?: string;
  supportedChains?: Array<{ fromChainId: number; toChainId: number }>;
}

export interface LifiToolsResponse {
  bridges: LifiToolInfo[];
  exchanges: LifiToolInfo[];
}

export interface LifiPreparedQuote {
  fromChainId: number;
  toChainId: number;
  fromToken: Pick<LifiToken, "symbol" | "address" | "decimals" | "chainId">;
  toToken: Pick<LifiToken, "symbol" | "address" | "decimals" | "chainId">;
  fromAmount: string;
  toAmount: string;
  /** Minimum after slippage; the bridge guarantees no less than this. */
  toAmountMin: string;
  feeSummary: string;
  gasCostUSD?: string;
  tool: string;
  transactionRequest: LifiTransactionRequest;
  /** ERC-20 spender that needs approval. Absent for native-token transfers. */
  approvalAddress?: string;
  integrator: string;
  appliedFee: number;
  raw: LifiQuoteResponse;
}

export interface LifiPreparedRoutes {
  topRoute: LifiRoute;
  alternatives: LifiRoute[];
  routeCount: number;
  raw: LifiRoutesResponse;
}

export interface LifiAllowanceResult {
  token: string;
  spender: string;
  currentAllowance: bigint;
  requiredAmount: bigint;
  approvalNeeded: boolean;
}

export interface LifiPreparedApproval {
  token: string;
  spender: string;
  amount: string;
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    chainId: number;
  };
}

export interface LifiNormalizedStatus {
  status: LifiStatusResponse["status"];
  substatus?: string;
  substatusMessage?: string;
  sending?: LifiStatusBridge;
  receiving?: LifiStatusBridge;
  lifiExplorerLink?: string;
  bridgeExplorerLink?: string;
  tool?: string;
  done: boolean;
  failed: boolean;
  pending: boolean;
}
