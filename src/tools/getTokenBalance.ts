import { fileURLToPath } from "node:url";

import { createPublicClient, formatUnits, http } from "viem";

import { getAccount } from "../lib/wallet.js";
import { resolveBridgeChainContext } from "./lifi/resolveBridgeChainContext.js";
import {
  resolveTokenByAddress,
  resolveTokenBySymbol,
  NATIVE_TOKEN_ADDRESS,
} from "./lifi/getTokens.js";

export interface TokenBalanceResult {
  chain: string;
  chainId: number;
  token: string;
  tokenAddress: string;
  decimals: number;
  rawBalance: string;
  balance: string;
  walletAddress: string;
}

export async function getTokenBalance(
  chainInput: string,
  tokenInput: string,
): Promise<TokenBalanceResult> {
  const account = getAccount();
  const walletAddress = account.address;

  const chainCtx = await resolveBridgeChainContext(chainInput);

  if (chainCtx.chainType === "generic-non-evm") {
    throw new Error(`Balance reading is not supported for non-EVM chain "${chainCtx.name}".`);
  }
  if (!chainCtx.rpcUrl) {
    throw new Error(
      `Chain "${chainCtx.name}" is not in the OmniHub-supported set. ` +
        "Balance reading requires a chain in the OmniHub registry.",
    );
  }

  const client = createPublicClient({ transport: http(chainCtx.rpcUrl) });

  const isNative =
    tokenInput.toLowerCase() === "native" ||
    tokenInput.toUpperCase() === chainCtx.nativeSymbol.toUpperCase();

  if (isNative) {
    const raw = await client.getBalance({
      address: walletAddress as `0x${string}`,
    });
    return {
      chain: chainCtx.name,
      chainId: chainCtx.lifiChainId,
      token: chainCtx.nativeSymbol,
      tokenAddress: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      rawBalance: raw.toString(),
      balance: formatUnits(raw, 18),
      walletAddress,
    };
  }

  let tokenAddress: string;
  let decimals: number;
  let symbol: string;

  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(tokenInput);

  if (isAddress) {
    const token = await resolveTokenByAddress(tokenInput, chainCtx.lifiChainId);
    if (!token) {
      throw new Error(
        `Token at address ${tokenInput} was not found on ${chainCtx.name}. ` +
          "Verify the contract address is correct and that the token is supported on this chain.",
      );
    }
    tokenAddress = token.address;
    decimals = token.decimals;
    symbol = token.symbol;
  } else {
    const token = await resolveTokenBySymbol(tokenInput, chainCtx.lifiChainId);
    if (!token) {
      throw new Error(
        `Could not find token "${tokenInput}" on ${chainCtx.name}. ` +
          "Use the exact symbol (e.g. USDC, WETH) or the contract address.",
      );
    }
    tokenAddress = token.address;
    decimals = token.decimals;
    symbol = token.symbol;
  }

  const raw = (await client.readContract({
    address: tokenAddress as `0x${string}`,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ],
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`],
  })) as bigint;

  return {
    chain: chainCtx.name,
    chainId: chainCtx.lifiChainId,
    token: symbol,
    tokenAddress,
    decimals,
    rawBalance: raw.toString(),
    balance: formatUnits(raw, decimals),
    walletAddress,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chain = process.env.TOKEN_BALANCE_CHAIN?.trim() ?? "";
  const token = process.env.TOKEN_BALANCE_TOKEN?.trim() ?? "";
  if (!chain || !token) {
    console.error(
      "Usage: TOKEN_BALANCE_CHAIN=base TOKEN_BALANCE_TOKEN=USDC npm run tool -- token-balance",
    );
    process.exit(1);
  }
  const result = await getTokenBalance(chain, token);
  console.log(`Chain:   ${result.chain} (${result.chainId})`);
  console.log(`Token:   ${result.token} (${result.tokenAddress})`);
  console.log(`Balance: ${result.balance} ${result.token}`);
  console.log(`Wallet:  ${result.walletAddress}`);
}
