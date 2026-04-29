/**
 * Chain resolution policy for LI.FI bridge flows.
 *
 * Resolution order: OmniHub `/api/chains` (RPC sourced from OmniHub) → LI.FI
 * `/chains` (fallback for chains outside OmniHub).
 *
 * Classification (drives execution path):
 * - `omnihub-evm`     — in OmniHub registry; EVM; RPC from OmniHub.
 * - `generic-evm`     — in LI.FI only; EVM; RPC from explicit override (no env fallback).
 * - `generic-non-evm` — in LI.FI; non-EVM (SVM, UTXO, …). No RPC. EVM-specific
 *   logic (allowance, approval, viem sendTransaction) MUST NOT run.
 */

import {
  resolveChain as resolveOmnihubChain,
  resolveRpcForChain,
  type OmniChain,
} from "../../integrations/omnihub/chains.js";
import { resolveChain as resolveLifiChain } from "./getChains.js";
import type { LifiChain } from "../../integrations/lifi/types.js";

export type BridgeChainType = "omnihub-evm" | "generic-evm" | "generic-non-evm";

export interface BridgeChainContext {
  lifiChainId: number;
  name: string;
  chainType: BridgeChainType;
  /**
   * Source-chain RPC. Present for EVM chains only — health-checked OmniHub
   * RPC for `omnihub-evm`, explicit `evmRpcOverride` for `generic-evm`,
   * absent for non-EVM. Never read for non-EVM operations.
   */
  rpcUrl?: string;
  /** Present only for `omnihub-evm`; use for OmniHub API calls. */
  omnihubAlias?: string;
  lifiKey?: string;
  nativeSymbol: string;
}

const NON_EVM_CHAIN_TYPES = new Set(["SVM", "UTXO", "MVM", "FUEL"]);

function isEvmChainType(chainType: string | undefined): boolean {
  /** Unknown → EVM as a conservative fallback (LI.FI may add new chain types). */
  if (!chainType) return true;
  return !NON_EVM_CHAIN_TYPES.has(chainType.toUpperCase());
}

async function tryOmnihubResolution(input: string | number): Promise<OmniChain | null> {
  try {
    return await resolveOmnihubChain(String(input));
  } catch {
    return null;
  }
}

async function tryLifiResolution(input: string | number): Promise<LifiChain | undefined> {
  return resolveLifiChain(input);
}

export interface ResolveBridgeChainOptions {
  /**
   * Required for `generic-evm` execution. There is NO env-based fallback —
   * the resolver throws if the chain falls into the generic-evm bucket and
   * this is omitted.
   */
  evmRpcOverride?: string;
  /** Skip the OmniHub registry and resolve via LI.FI directly. */
  skipOmnihubLookup?: boolean;
}

export async function resolveBridgeChainContext(
  input: string | number,
  options: ResolveBridgeChainOptions = {},
): Promise<BridgeChainContext> {
  if (!options.skipOmnihubLookup) {
    const omniChain = await tryOmnihubResolution(input);
    if (omniChain) {
      /** OmniHub registry lists only EVM chains — no chainType check needed. */
      const rpcUrl = await resolveRpcForChain(omniChain);
      return {
        lifiChainId: omniChain.id,
        name: omniChain.name,
        chainType: "omnihub-evm",
        rpcUrl,
        omnihubAlias: omniChain.alias,
        nativeSymbol: nativeSymbolForEvmChain(omniChain.id),
      };
    }
  }

  const lifiChain = await tryLifiResolution(input);
  if (!lifiChain) {
    throw new Error(
      `Could not resolve chain "${input}" in OmniHub registry or LI.FI chain list. ` +
        "Run `npm run lifi:chains` to see all LI.FI-supported chains, " +
        "or `npm run omnihub:chains` for OmniHub-supported chains.",
    );
  }

  const evmChain = isEvmChainType(lifiChain.chainType);

  if (!evmChain) {
    /** Non-EVM: no RPC. Callers MUST NOT invoke allowance/approval/sendTransaction. */
    return {
      lifiChainId: lifiChain.id,
      name: lifiChain.name,
      chainType: "generic-non-evm",
      lifiKey: lifiChain.key,
      nativeSymbol: lifiChain.nativeToken.symbol,
    };
  }

  /** No env fallback for generic-evm — `RPC_URL` is intentionally NOT consulted here. */
  const rpcUrl = options.evmRpcOverride;
  if (!rpcUrl) {
    throw new Error(
      `Chain "${lifiChain.name}" (id=${lifiChain.id}) is not in the OmniHub registry. ` +
        "Execution requires an explicit generic EVM RPC — " +
        "pass evmRpcOverride when calling resolveBridgeChainContext().",
    );
  }

  return {
    lifiChainId: lifiChain.id,
    name: lifiChain.name,
    chainType: "generic-evm",
    rpcUrl,
    lifiKey: lifiChain.key,
    nativeSymbol: lifiChain.nativeToken.symbol,
  };
}

export interface BridgeChainPair {
  from: BridgeChainContext;
  to: BridgeChainContext;
}

export async function resolveBridgeChainPair(
  fromInput: string | number,
  toInput: string | number,
  options: ResolveBridgeChainOptions = {},
): Promise<BridgeChainPair> {
  /** Sequential by project convention — never parallelize OmniHub/LI.FI lookups. */
  const from = await resolveBridgeChainContext(fromInput, options);
  const to = await resolveBridgeChainContext(toInput, options);
  return { from, to };
}

export function isEvmContext(ctx: BridgeChainContext): boolean {
  return ctx.chainType === "omnihub-evm" || ctx.chainType === "generic-evm";
}

export function isOmnihubContext(ctx: BridgeChainContext): boolean {
  return ctx.chainType === "omnihub-evm";
}

export function isNonEvmContext(ctx: BridgeChainContext): boolean {
  return ctx.chainType === "generic-non-evm";
}

/** Supplementary fallback when LI.FI does not provide `nativeToken.symbol`. */
export function nativeSymbolForEvmChain(chainId: number): string {
  const known: Record<number, string> = {
    1: "ETH",
    10: "ETH",
    56: "BNB",
    100: "xDAI",
    137: "MATIC",
    250: "FTM",
    8453: "ETH",
    42161: "ETH",
    43114: "AVAX",
    59144: "ETH",
    324: "ETH",
    1101: "ETH",
  };
  return known[chainId] ?? "ETH";
}
