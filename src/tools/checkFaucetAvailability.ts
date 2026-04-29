/**
 * Read-only check: does the chain in `/api/chains` carry `faucet === true`?
 * Never attempts a claim; absence or `false` both mean unsupported.
 */
import { resolveChain, listSupportedChains } from "../integrations/omnihub/chains.js";

export interface FaucetAvailabilityResult {
  available: boolean;
  chain: string;
  chainName: string;
  message: string;
}

/** When `chainInput` is omitted, returns every chain with faucet support. */
export async function checkFaucetAvailability(
  chainInput?: string,
): Promise<FaucetAvailabilityResult | FaucetAvailabilityResult[]> {
  if (!chainInput) {
    const chains = await listSupportedChains();
    const supported = chains.filter((c) => c.faucet === true);

    if (supported.length === 0) {
      return {
        available: false,
        chain: "",
        chainName: "",
        message: "No chains with OmniHub faucet support found in /api/chains.",
      };
    }

    return supported.map((c) => ({
      available: true,
      chain: c.alias,
      chainName: c.name,
      message: `Faucet available on ${c.name} (${c.alias}).`,
    }));
  }

  const resolved = await resolveChain(chainInput);

  if (!resolved) {
    return {
      available: false,
      chain: chainInput,
      chainName: chainInput,
      message:
        `"${chainInput}" is not a recognised OmniHub network. ` +
        `Run "npm run omnihub:chains" to see supported networks.`,
    };
  }

  if (resolved.faucet !== true) {
    return {
      available: false,
      chain: resolved.alias,
      chainName: resolved.name,
      message:
        `The OmniHub faucet is not available on ${resolved.name} (${resolved.alias}). ` +
        `Faucet support is only offered on selected networks listed in /api/chains.`,
    };
  }

  return {
    available: true,
    chain: resolved.alias,
    chainName: resolved.name,
    message:
      `Faucet is available on ${resolved.name} (${resolved.alias}). ` +
      `You must be a holder of the required OmniHub collection and can claim once every 24 hours.`,
  };
}

if (
  process.argv[1]?.endsWith("checkFaucetAvailability.ts") ||
  process.argv[1]?.endsWith("checkFaucetAvailability.js")
) {
  const chainInput = process.env.OMNIHUB_CHAIN?.trim();
  checkFaucetAvailability(chainInput)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
