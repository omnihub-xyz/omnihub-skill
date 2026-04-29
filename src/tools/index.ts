import { getAddress } from "./getAddress.js";
import { getTokenBalance } from "./getTokenBalance.js";
import { getChainNativeBalance } from "./getChainNativeBalance.js";
import {
  prepareCollectionDeploy,
  DEFAULT_SUPPLY,
  DEFAULT_DESCRIPTION,
} from "./prepareCollectionDeploy.js";
import { executeCollectionDeploy } from "./executeCollectionDeploy.js";
import { resolveFiatAmount } from "./resolveFiatAmount.js";
import { listExploreCollections } from "./listExploreCollections.js";
import { listDiscoverCollections } from "./listDiscoverCollections.js";
import { listEditionCollections } from "./listEditionCollections.js";
import { listDropCollections } from "./listDropCollections.js";
import { getCollectionDetails } from "./getCollectionDetails.js";
import { getCollectionHolders } from "./getCollectionHolders.js";
import { resolveTopCollectionForMint } from "./resolveTopCollectionForMint.js";
import { prepareMint } from "./prepareMint.js";
import { executeMint } from "./executeMint.js";
import {
  listSupportedChains,
  resolveChain,
  toDiscoverBucket,
} from "../integrations/omnihub/chains.js";
import { ensureAuthenticated } from "../integrations/omnihub/auth.js";
import { mintFlow } from "./mintFlow.js";
import { checkFaucetAvailability } from "./checkFaucetAvailability.js";
import { claimFaucet } from "./claimFaucet.js";
import { claimFaucetWithFallback } from "./claimFaucetWithFallback.js";
import { checkFaucetPassBalance } from "./checkFaucetPassBalance.js";
import { faucetPassFlow, runFaucetPassFlow } from "./faucetPassFlow.js";
import { selectBestTestnetForDeploy } from "./selectBestTestnetForDeploy.js";
import { recoverCollectionMetadata } from "./recoverCollectionMetadata.js";
import { listSupportedChainsTool } from "./listSupportedChains.js";

import { getLifiChains, resolveChain as resolveLifiChain } from "./lifi/getChains.js";
import { getLifiTokens } from "./lifi/getTokens.js";
import { getLifiTools } from "./lifi/getTools.js";
import { prepareQuote } from "./lifi/prepareQuote.js";
import { prepareRoutes } from "./lifi/prepareRoutes.js";
import { getBridgeStatus } from "./lifi/getStatus.js";
import { runBridgeFlow } from "./lifi/bridgeFlow.js";

export {
  getChainNativeBalance,
  prepareCollectionDeploy,
  executeCollectionDeploy,
  getAddress,
  getTokenBalance,
  resolveFiatAmount,
  listExploreCollections,
  listDiscoverCollections,
  listEditionCollections,
  listDropCollections,
  getCollectionDetails,
  getCollectionHolders,
  resolveTopCollectionForMint,
  prepareMint,
  executeMint,
  listSupportedChains,
  resolveChain,
  ensureAuthenticated,
  checkFaucetAvailability,
  claimFaucet,
  claimFaucetWithFallback,
  checkFaucetPassBalance,
  runFaucetPassFlow,
  selectBestTestnetForDeploy,
  recoverCollectionMetadata,
  listSupportedChainsTool,
  getLifiChains,
  resolveLifiChain,
  getLifiTokens,
  getLifiTools,
  prepareQuote,
  prepareRoutes,
  getBridgeStatus,
  runBridgeFlow,
};

export const tools = {
  "collection:prepare": async () => {
    const chain = process.env.DEPLOY_CHAIN?.trim() ?? "";
    const name = process.env.DEPLOY_NAME?.trim() ?? "";
    const symbol = process.env.DEPLOY_SYMBOL?.trim() ?? "";
    const supply = parseInt(process.env.DEPLOY_SUPPLY?.trim() || String(DEFAULT_SUPPLY), 10);
    const description = process.env.DEPLOY_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION;
    const factoryAddress = process.env.DEPLOY_FACTORY?.trim();
    if (!chain || !name || !symbol) {
      throw new Error("DEPLOY_CHAIN, DEPLOY_NAME, and DEPLOY_SYMBOL are required.");
    }
    return prepareCollectionDeploy({ chain, name, symbol, supply, description, factoryAddress });
  },
  "collection:recover-metadata": async () => {
    const chain = process.env.OMNIHUB_CHAIN?.trim() ?? "";
    const address = process.env.OMNIHUB_ADDRESS?.trim() ?? "";
    if (!chain || !address) {
      throw new Error(
        "OMNIHUB_CHAIN and OMNIHUB_ADDRESS are required. Example: " +
          "OMNIHUB_CHAIN=base OMNIHUB_ADDRESS=0xabc... npm run tool -- collection:recover-metadata",
      );
    }
    return recoverCollectionMetadata({ chain, address });
  },
  "collection:best-testnet": async () => {
    const overrideStr = process.env.DEPLOY_GAS_RESERVE_WEI?.trim();
    if (overrideStr) {
      return selectBestTestnetForDeploy({ gasReserveWei: BigInt(overrideStr) });
    }
    return selectBestTestnetForDeploy();
  },
  "collection:deploy": async () => {
    const chain = process.env.DEPLOY_CHAIN?.trim() ?? "";
    const name = process.env.DEPLOY_NAME?.trim() ?? "";
    const symbol = process.env.DEPLOY_SYMBOL?.trim() ?? "";
    const supply = parseInt(process.env.DEPLOY_SUPPLY?.trim() || String(DEFAULT_SUPPLY), 10);
    const description = process.env.DEPLOY_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION;
    const factoryAddress = process.env.DEPLOY_FACTORY?.trim();
    if (!chain || !name || !symbol) {
      throw new Error("DEPLOY_CHAIN, DEPLOY_NAME, and DEPLOY_SYMBOL are required.");
    }
    return executeCollectionDeploy({ chain, name, symbol, supply, description, factoryAddress });
  },
  "chain-balance": async () => {
    const chain = process.env.CHAIN_BALANCE_CHAIN?.trim() ?? "";
    if (!chain) {
      throw new Error(
        "CHAIN_BALANCE_CHAIN required. Example: CHAIN_BALANCE_CHAIN=optimism npm run tool -- chain-balance",
      );
    }
    return getChainNativeBalance(chain);
  },
  address: getAddress,
  "omnihub:chains": listSupportedChainsTool,
  "fiat-to-token": async () => {
    const chain = process.env.FIAT_CHAIN?.trim() ?? "";
    const token = process.env.FIAT_TOKEN?.trim() ?? "";
    const usdStr = process.env.FIAT_USD_AMOUNT?.trim() ?? "";
    const usdAmount = parseFloat(usdStr);
    if (!chain || !token || !usdStr || !Number.isFinite(usdAmount)) {
      throw new Error("FIAT_CHAIN, FIAT_TOKEN, and FIAT_USD_AMOUNT required");
    }
    return resolveFiatAmount(chain, token, usdAmount);
  },
  "token-balance": async () => {
    const chain = process.env.TOKEN_BALANCE_CHAIN?.trim() ?? "";
    const token = process.env.TOKEN_BALANCE_TOKEN?.trim() ?? "";
    if (!chain || !token) {
      throw new Error("TOKEN_BALANCE_CHAIN and TOKEN_BALANCE_TOKEN required");
    }
    return getTokenBalance(chain, token);
  },
  "omnihub:explore": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim();
    let chain = "all";
    if (chainInput && chainInput !== "all") {
      const resolved = await resolveChain(chainInput);
      chain = resolved?.alias ?? chainInput;
    }
    return listExploreCollections({ chain });
  },
  "omnihub:discover": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim();
    if (chainInput) {
      const resolved = await resolveChain(chainInput);
      return listDiscoverCollections(resolved?.alias);
    }
    return listDiscoverCollections();
  },
  "omnihub:editions": async () => {
    const input =
      process.env.OMNIHUB_CHAIN?.trim() ?? process.env.OMNIHUB_TYPE?.trim() ?? "mainnets";
    const bucket = await toDiscoverBucket(input);
    return listEditionCollections(bucket);
  },
  "omnihub:drops": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim();
    const typeInput = process.env.OMNIHUB_TYPE?.trim();
    if (chainInput && chainInput !== "mainnets" && chainInput !== "testnets") {
      const resolved = await resolveChain(chainInput);
      return listDropCollections(resolved?.alias ?? chainInput);
    }
    return listDropCollections(chainInput ?? typeInput ?? "mainnets");
  },
  "omnihub:collection": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim() ?? "";
    const address = process.env.OMNIHUB_ADDRESS?.trim() ?? "";
    if (!chainInput || !address) throw new Error("OMNIHUB_CHAIN and OMNIHUB_ADDRESS required");
    const resolved = await resolveChain(chainInput);
    if (!resolved)
      throw new Error(
        `Unsupported network: "${chainInput}". Run npm run omnihub:chains to see supported networks.`,
      );
    return getCollectionDetails(resolved.alias, address);
  },
  "omnihub:holders": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim() ?? "";
    const address = process.env.OMNIHUB_ADDRESS?.trim() ?? "";
    if (!chainInput || !address) throw new Error("OMNIHUB_CHAIN and OMNIHUB_ADDRESS required");
    const resolved = await resolveChain(chainInput);
    if (!resolved)
      throw new Error(
        `Unsupported network: "${chainInput}". Run npm run omnihub:chains to see supported networks.`,
      );
    return getCollectionHolders(resolved.alias, address);
  },
  "mint:resolve-top": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim();
    if (!chainInput) throw new Error("OMNIHUB_CHAIN required");
    return resolveTopCollectionForMint(chainInput);
  },
  "mint:prepare": prepareMint,
  "mint:execute": executeMint,
  "mint:flow": mintFlow,
  "omnihub:auth": ensureAuthenticated,
  "omnihub:faucet:check": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim();
    return checkFaucetAvailability(chainInput);
  },
  "omnihub:faucet": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim() ?? "";
    if (!chainInput)
      throw new Error(
        "OMNIHUB_CHAIN is required. Example: OMNIHUB_CHAIN=base-sepolia npm run omnihub:faucet",
      );
    return claimFaucet(chainInput);
  },
  "omnihub:faucet:fallback": async () => {
    const chainInput = process.env.OMNIHUB_CHAIN?.trim() ?? "";
    if (!chainInput) {
      throw new Error(
        "OMNIHUB_CHAIN is required. Example: OMNIHUB_CHAIN=iopn-testnet npm run tool -- omnihub:faucet:fallback",
      );
    }
    return claimFaucetWithFallback(chainInput);
  },
  "omnihub:faucet:pass-check": checkFaucetPassBalance,
  "omnihub:faucet:pass-flow": faucetPassFlow,
  "lifi:bridge": async () => {
    const fromChain = process.env.LIFI_FROM_CHAIN?.trim() ?? "";
    const toChain = process.env.LIFI_TO_CHAIN?.trim() ?? "";
    const fromToken = process.env.LIFI_FROM_TOKEN?.trim() ?? "ETH";
    const toToken = process.env.LIFI_TO_TOKEN?.trim() ?? "ETH";
    const fromAmount = process.env.LIFI_FROM_AMOUNT?.trim() ?? "";
    if (!fromChain || !toChain || !fromAmount) {
      throw new Error(
        "LIFI_FROM_CHAIN, LIFI_TO_CHAIN, LIFI_FROM_AMOUNT required. " +
          "Example: LIFI_FROM_CHAIN=base LIFI_TO_CHAIN=arbitrum-one LIFI_FROM_AMOUNT=0.0002 npm run lifi:bridge",
      );
    }
    return runBridgeFlow({ fromChain, toChain, fromToken, toToken, fromAmount });
  },
  "lifi:chains": () => getLifiChains(),
  "lifi:tokens": () => getLifiTokens(),
  "lifi:tools": () => getLifiTools(),
  "lifi:quote": async () => {
    const fromChain = process.env.LIFI_FROM_CHAIN ?? "";
    const toChain = process.env.LIFI_TO_CHAIN ?? "";
    const fromToken = process.env.LIFI_FROM_TOKEN ?? "";
    const toToken = process.env.LIFI_TO_TOKEN ?? "";
    const fromAmount = process.env.LIFI_FROM_AMOUNT ?? "";
    const fromAddress = process.env.LIFI_FROM_ADDRESS ?? "";
    if (!fromChain || !toChain || !fromToken || !toToken || !fromAmount || !fromAddress) {
      throw new Error(
        "LIFI_FROM_CHAIN, LIFI_TO_CHAIN, LIFI_FROM_TOKEN, LIFI_TO_TOKEN, LIFI_FROM_AMOUNT, LIFI_FROM_ADDRESS required",
      );
    }
    return prepareQuote({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress });
  },
  "lifi:routes": async () => {
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
      throw new Error(
        "LIFI_FROM_CHAIN_ID, LIFI_TO_CHAIN_ID, LIFI_FROM_TOKEN, LIFI_TO_TOKEN, LIFI_FROM_AMOUNT, LIFI_FROM_ADDRESS required",
      );
    }
    return prepareRoutes({
      fromChainId,
      toChainId,
      fromTokenAddress,
      toTokenAddress,
      fromAmount,
      fromAddress,
    });
  },
  "lifi:status": async () => {
    const txHash = process.env.LIFI_TX_HASH ?? "";
    if (!txHash) throw new Error("LIFI_TX_HASH required");
    return getBridgeStatus({
      txHash,
      fromChain: process.env.LIFI_FROM_CHAIN,
      toChain: process.env.LIFI_TO_CHAIN,
      bridge: process.env.LIFI_BRIDGE,
    });
  },
} as const;
