import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, http, parseEther } from "viem";

import { confirmTransaction, TransactionCancelled } from "../lib/confirm.js";
import { getAccount } from "../lib/wallet.js";
import { prepareMint, type MintInput } from "./prepareMint.js";

/**
 * Refuses to send when `prepareMint` reports `publicMintValid=false` — the
 * validation gate from `prepareMint` is the only thing standing between the
 * user and a guaranteed-revert transaction, so do not bypass it.
 *
 * `AUTO_CONFIRM_TRANSACTIONS=true` skips the per-tx prompt; the validation
 * gate is unconditional regardless of that flag.
 */
export async function executeMint(input?: MintInput): Promise<{
  chain: string;
  contractAddress: string;
  quantity: number;
  transactionHash: string;
}> {
  const prepared = await prepareMint(input);

  if (!prepared.publicMintValid) {
    const reasons = prepared.validationWarnings.join("; ");
    throw new Error(`Mint blocked — validation failed: ${reasons}`);
  }

  const priceWei = prepared.pricePerMint
    ? parseEther(prepared.pricePerMint) * BigInt(prepared.quantity)
    : 0n;
  const protocolFeeEth = formatEther(BigInt(prepared.mintFeeWei) - priceWei);

  const nativeSymbol = prepared.nativeSymbol;

  await confirmTransaction(
    {
      Collection: prepared.collectionName ?? prepared.contractAddress,
      Chain: `${prepared.chain} (id=${prepared.chainId})`,
      RPC: prepared.rpcUrl,
      Quantity: String(prepared.quantity),
      "Price/mint": prepared.pricePerMint ? `${prepared.pricePerMint} ${nativeSymbol}` : "free",
      "Protocol fee": `${protocolFeeEth} ${nativeSymbol}`,
      "Total fee": `${prepared.mintFeeEth} ${nativeSymbol}`,
    },
    prepared.validationWarnings,
  );

  const account = getAccount();
  const client = createWalletClient({
    account,
    transport: http(prepared.rpcUrl),
  });

  const transactionHash = await client.sendTransaction({
    account,
    chain: undefined,
    to: prepared.contractAddress as `0x${string}`,
    data: prepared.calldata as `0x${string}`,
    value: BigInt(prepared.mintFeeWei),
  });

  return {
    chain: prepared.chain,
    contractAddress: prepared.contractAddress,
    quantity: prepared.quantity,
    transactionHash,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await executeMint();
    console.log(`\nMint submitted`);
    console.log(`  chain:    ${result.chain}`);
    console.log(`  contract: ${result.contractAddress}`);
    console.log(`  quantity: ${result.quantity}`);
    console.log(`  tx hash:  ${result.transactionHash}`);
  } catch (err) {
    if (err instanceof TransactionCancelled) {
      console.log(`\nTransaction cancelled.`);
      process.exit(0);
    }
    throw err;
  }
}
