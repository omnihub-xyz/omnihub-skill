import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address } from "viem";

import { ensureAuthenticated } from "../integrations/omnihub/auth.js";
import { requireChain } from "../integrations/omnihub/chains.js";
import { getAccount } from "../lib/wallet.js";
import { TransactionCancelled } from "../lib/confirm.js";
import { executeMint } from "./executeMint.js";
import { prepareMint } from "./prepareMint.js";
import { resolveTopCollectionForMint } from "./resolveTopCollectionForMint.js";
import { offerFaucetPassAndClaim } from "./faucetPassFlow.js";

export interface MintFlowInput {
  chainInput: string;
  /** When omitted, the top trending collection on the chain is used. */
  address?: string;
  quantity?: number;
}

/**
 * Unified mint orchestrator. All step inputs are passed explicitly — process.env
 * is never used for internal routing between steps.
 *
 * On testnet+faucet chains, a silent balance pre-check runs before the mint:
 * if the wallet is short on native tokens, the Faucet Pass flow is offered
 * with no technical logs ahead of the user-facing decision prompt. This
 * silence is intentional UX — do not add diagnostic output before the prompt.
 */
export async function runMintFlow(input: MintFlowInput): Promise<void> {
  const { chainInput, address: explicitAddress, quantity = 1 } = input;

  await ensureAuthenticated();

  let chain: string;
  let address: string;

  if (explicitAddress) {
    const resolved = await requireChain(chainInput);
    chain = resolved.alias;
    address = explicitAddress;
    console.log(`\n  Collection   ${address}`);
    console.log(`  Chain        ${chain}`);
  } else {
    console.log(`\nResolving top trending collection on ${chainInput}...`);
    const top = await resolveTopCollectionForMint(chainInput);
    chain = top.chain;
    address = top.address;
    console.log(`\n  Collection   ${top.name ?? address}`);
    console.log(`  Address      ${address}`);
    console.log(`  Chain        ${chain}`);
  }

  /**
   * `prepareMint` runs here purely to fetch the mint fee and a working RPC
   * for the balance gate; `executeMint` will call it again. The duplication
   * keeps the gate self-contained and is cheap (chain registry is cached).
   */
  const chainData = await requireChain(chain);
  if (chainData.testnet && chainData.faucet) {
    const prepared = await prepareMint({ chain, address, quantity });

    if (prepared.publicMintValid) {
      const publicClient = createPublicClient({ transport: http(prepared.rpcUrl) });
      const account = getAccount();
      const balance = await publicClient.getBalance({ address: account.address as Address });

      if (balance < BigInt(prepared.mintFeeWei)) {
        const result = await offerFaucetPassAndClaim({
          targetChain: chain,
          targetChainName: chainData.name,
        });

        if (!result.proceeded) {
          if (result.declined) {
            console.log(`\nMint cancelled.`);
          } else {
            console.log(`\nCould not obtain faucet tokens. Mint cancelled.`);
          }
          return;
        }
      }
    }
  }

  try {
    const result = await executeMint({ chain, address, quantity });
    console.log(`\nMint submitted`);
    console.log(`  chain:    ${result.chain}`);
    console.log(`  contract: ${result.contractAddress}`);
    console.log(`  quantity: ${result.quantity}`);
    console.log(`  tx hash:  ${result.transactionHash}`);
  } catch (err) {
    if (err instanceof TransactionCancelled) {
      console.log(`\nTransaction cancelled. Nothing was sent.`);
      return;
    }
    throw err;
  }
}

export async function mintFlow(): Promise<void> {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();
  const address = process.env.OMNIHUB_ADDRESS?.trim() || undefined;
  const quantityStr = process.env.OMNIHUB_QUANTITY?.trim();

  if (!chainInput) throw new Error("OMNIHUB_CHAIN required");

  const quantity = quantityStr ? parseInt(quantityStr, 10) : 1;
  if (isNaN(quantity) || quantity < 1) {
    throw new Error("OMNIHUB_QUANTITY must be a positive integer");
  }

  await runMintFlow({ chainInput, address, quantity });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mintFlow();
}
