/**
 * LI.FI may return HTTP 200 with `status="NOT_FOUND"` while the transaction
 * is still being indexed — that case is treated as pending, not an error.
 */

import { fileURLToPath } from "node:url";

import { lifiGet } from "../../integrations/lifi/client.js";
import type { LifiNormalizedStatus, LifiStatusResponse } from "../../integrations/lifi/types.js";
import { resolveChain } from "../../integrations/omnihub/chains.js";

export type { LifiNormalizedStatus };

export interface StatusInput {
  txHash: string;
  fromChain?: string | number;
  toChain?: string | number;
  bridge?: string;
}

/** LI.FI `/status` requires numeric chain IDs; callers usually pass aliases. */
async function toNumericChainId(value: string | number): Promise<number> {
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && trimmed !== "") return asNumber;
  const chain = await resolveChain(trimmed);
  if (!chain) {
    throw new Error(
      `Could not resolve chain "${value}" to a numeric chain ID for LI.FI status lookup.`,
    );
  }
  return chain.id;
}

export async function getBridgeStatus(input: StatusInput): Promise<LifiNormalizedStatus> {
  const params: Record<string, string | number | undefined> = {
    txHash: input.txHash,
  };
  if (input.fromChain !== undefined) params.fromChain = await toNumericChainId(input.fromChain);
  if (input.toChain !== undefined) params.toChain = await toNumericChainId(input.toChain);
  if (input.bridge) params.bridge = input.bridge;

  const raw = await lifiGet<LifiStatusResponse>("/status", params);

  const done = raw.status === "DONE";
  const failed = raw.status === "FAILED" || raw.status === "INVALID";
  const pending = !done && !failed;

  return {
    status: raw.status,
    substatus: raw.substatus,
    substatusMessage: raw.substatusMessage,
    sending: raw.sending,
    receiving: raw.receiving,
    lifiExplorerLink: raw.lifiExplorerLink,
    bridgeExplorerLink: raw.bridgeExplorerLink,
    tool: raw.tool,
    done,
    failed,
    pending,
  };
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onPoll?: (status: LifiNormalizedStatus, elapsed: number) => void;
}

export async function pollBridgeStatus(
  input: StatusInput,
  options: PollOptions = {},
): Promise<LifiNormalizedStatus> {
  const intervalMs = options.intervalMs ?? 10_000;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const start = Date.now();

  while (true) {
    const status = await getBridgeStatus(input);
    const elapsed = Date.now() - start;

    if (options.onPoll) {
      options.onPoll(status, elapsed);
    }

    if (status.done || status.failed) {
      return status;
    }

    if (elapsed + intervalMs >= timeoutMs) {
      /** Return last known status on timeout — caller decides whether to escalate. */
      return status;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const txHash = process.env.LIFI_TX_HASH;
  const fromChain = process.env.LIFI_FROM_CHAIN;
  const toChain = process.env.LIFI_TO_CHAIN;
  const bridge = process.env.LIFI_BRIDGE;

  if (!txHash) {
    console.error(
      "Usage: LIFI_TX_HASH=0x... [LIFI_FROM_CHAIN=...] [LIFI_TO_CHAIN=...] [LIFI_BRIDGE=...] npm run lifi:status",
    );
    process.exit(1);
  }

  console.log(`Polling bridge status for ${txHash}...`);

  const result = await pollBridgeStatus(
    { txHash, fromChain, toChain, bridge },
    {
      onPoll: (s, elapsed) => {
        const sec = Math.floor(elapsed / 1000);
        console.log(`  [${sec}s] status=${s.status} substatus=${s.substatus ?? "none"}`);
      },
    },
  );

  console.log(`\nFinal status: ${result.status}`);
  if (result.substatus) console.log(`Substatus:    ${result.substatus}`);
  if (result.substatusMessage) console.log(`Message:      ${result.substatusMessage}`);
  if (result.lifiExplorerLink) console.log(`LI.FI:        ${result.lifiExplorerLink}`);
  if (result.bridgeExplorerLink) console.log(`Bridge:       ${result.bridgeExplorerLink}`);
  if (result.receiving?.txHash) console.log(`Dest tx:      ${result.receiving.txHash}`);
}
