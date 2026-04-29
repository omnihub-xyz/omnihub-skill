import { fileURLToPath } from "node:url";

import { listSupportedChains as fetchSupportedChains } from "../integrations/omnihub/chains.js";

export interface SupportedChainEntry {
  alias: string;
  name: string;
  id: number;
  testnet: boolean;
  faucet: boolean;
}

export interface SupportedChainsResult {
  total: number;
  mainnets: number;
  testnets: number;
  chains: SupportedChainEntry[];
}

export async function listSupportedChainsTool(): Promise<SupportedChainsResult> {
  const chains = await fetchSupportedChains();

  const entries: SupportedChainEntry[] = chains.map((c) => ({
    alias: c.alias,
    name: c.name,
    id: c.id,
    testnet: c.testnet === true,
    faucet: c.faucet === true,
  }));

  return {
    total: entries.length,
    mainnets: entries.filter((c) => !c.testnet).length,
    testnets: entries.filter((c) => c.testnet).length,
    chains: entries,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await listSupportedChainsTool();

  console.log(
    `OmniHub supported chains  (${result.total} total — ${result.mainnets} mainnets, ${result.testnets} testnets)\n`,
  );

  const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));

  console.log(`  ${pad("alias", 24)} ${pad("name", 26)} ${pad("id", 8)} type     faucet`);
  console.log(`  ${"-".repeat(24)} ${"-".repeat(26)} ${"-".repeat(8)} -------- ------`);
  for (const c of result.chains) {
    console.log(
      `  ${pad(c.alias, 24)} ${pad(c.name, 26)} ${pad(String(c.id), 8)} ${pad(c.testnet ? "testnet" : "mainnet", 8)} ${c.faucet ? "yes" : "no"}`,
    );
  }
}
