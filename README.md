# OmniHub Skill

**Discover NFT collections, mint, claim faucet tokens, deploy new collections, and swap or bridge funds via LI.FI** across every EVM network OmniHub supports — Base, Optimism, Arbitrum, IOPN testnet, and more.

## Risk Notice

This skill can trigger **real on-chain transactions** using a real wallet, including mints, deploys, faucet claims, swaps, bridges, ERC-20 approvals, and metadata updates. It is provided as an open-source developer tool on an **"as is"** basis, with no warranty of safety, correctness, or availability. You are solely responsible for reviewing every transaction summary — chain, contract, amount, fees, approvals — before confirming. Test on a testnet first, and fund the configured wallet only with what you are willing to lose. See [`DISCLAIMER.md`](./DISCLAIMER.md) for the full risk and liability terms.

## What is this?

This is a Claude Code skill for the [OmniHub](https://omnihub.xyz) NFT platform. Once installed, your agent can talk to OmniHub in plain English to discover collections, run public mints (with automatic Faucet Pass fallback on testnets), claim faucet tokens, deploy new collections end-to-end, and execute LI.FI swaps and bridges — all from one conversation, with no script invocations or contract ABIs exposed to the user.

Under the hood the skill drives a small library of typed wallet tools built on [viem](https://viem.sh) and backed by OmniHub's `/api/chains` registry, so every supported network, RPC, factory address, and faucet flag is resolved at runtime rather than hardcoded.

## Installing the Skill


```bash
npx skills add omnihub-xyz/omnihub-skill -g -a claude-code -y
```
## Manual Installation
Clone the repository, install dependencies, and fill in your `.env`:
```bash
git clone https://github.com/omnihub-xyz/omnihub-skill.git ~/.claude/skills/omnihub-skill
cd omnihub-skill
npm install
cp .env.example .env          # then fill in PRIVATE_KEY
npm run tools:check           # optional — type-checks every tool
```

The skill definition lives at [`.claude/skills/omnihub-skill/SKILL.md`](.claude/skills/omnihub-skill/SKILL.md). Claude Code picks it up automatically when the project is opened.

## Prerequisites

### Required

- `PRIVATE_KEY` — the EOA the agent signs transactions with. Must start with `0x` followed by 64 hexadecimal characters.
- `AUTO_CONFIRM_TRANSACTIONS` — `true` to let the skill execute transactions as soon as the conversational summary has been shown, or `false` to always require explicit conversational confirmation before signing.
- Node.js >= 20 — for native `fetch`, ESM, and `AbortSignal.timeout`.
- npm — no separate build step, the project runs under `tsx`.

The `.env` file never contains RPC URLs, chain metadata, faucet toggles, or factory addresses. These come live from OmniHub's `/api/chains` on every run, so new networks appear automatically as OmniHub adds them.

Real on-chain flows (mint, deploy, swap, bridge, faucet claim) require the wallet to be funded on the relevant network. Discovery flows are read-only and do not require any balance.


## What's Included

### Skill Definition

[`SKILL.md`](.claude/skills/omnihub-skill/SKILL.md) — the main skill file that teaches the agent how to drive the OmniHub flows conversationally: chain resolution, mint orchestration, faucet and Faucet Pass fallback, end-to-end collection deployment with backend sync and on-chain metadata, and LI.FI swap and bridge execution.

### Wallet Tools

Canonical, registry-driven wallet tools in [`src/tools/`](src/tools/):

| Tool                                                                                        | Purpose                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `address`                                                                                   | Resolve the configured EOA address                                                          |
| `chain-balance`                                                                             | Read native balance for a given chain                                                       |
| `token-balance`                                                                             | Read ERC-20 balance for a given chain and token                                             |
| `fiat-to-token`                                                                             | Convert a USD amount to the equivalent token amount                                         |
| `omnihub:explore` / `omnihub:discover`                                                      | List explore/discover collections (optionally per chain)                                    |
| `omnihub:editions` / `omnihub:drops`                                                        | List drops or editions by mainnets/testnets bucket                                          |
| `omnihub:collection` / `omnihub:holders`                                                    | Open a single collection by address, or list its holders                                    |
| `omnihub:auth`                                                                              | OmniHub wallet-signature authentication (no gas)                                            |
| `omnihub:faucet:check` / `omnihub:faucet`                                                   | Inspect faucet state and claim test tokens                                                  |
| `omnihub:faucet:fallback`                                                                   | Claim with automatic next-testnet fallback on backend/dispenser failure                     |
| `omnihub:faucet:pass-check` / `omnihub:faucet:pass-flow`                                    | OmniHub Faucet Pass balance check and end-to-end mint-and-claim flow                        |
| `mint:prepare` / `mint:execute` / `mint:flow`                                               | Public mint with prepare → confirm → execute, or one-shot orchestrated flow                 |
| `mint:resolve-top`                                                                          | Resolve the top mintable collection on a given chain                                        |
| `collection:prepare` / `collection:deploy`                                                  | End-to-end collection deploy with `createFee()` lookup, backend sync, and on-chain metadata |
| `collection:best-testnet`                                                                   | Rank viable testnets for a deploy by margin                                                 |
| `collection:recover-metadata`                                                               | Retry `setMetadata` after a deploy succeeds but the metadata write fails                    |
| `lifi:bridge`                                                                               | Same-chain swap and EVM-to-EVM bridge via LI.FI (one canonical execution path)              |
| `lifi:chains` / `lifi:tokens` / `lifi:tools` / `lifi:quote` / `lifi:routes` / `lifi:status` | LI.FI dev tools (route inspection, quote, status)                                           |

Tools are registered by string key in [`src/tools/index.ts`](src/tools/index.ts). Adding a new tool is a three-step change within that same file: implement, export, and register.

### Reference Docs

- [`CLAUDE.md`](CLAUDE.md) — architecture, developer guardrails, and the skill-first UX contract
- [`src/integrations/omnihub/`](src/integrations/omnihub/) — chain registry, auth, API client
- [`src/integrations/lifi/`](src/integrations/lifi/) — LI.FI client and types
- [`src/resources/`](src/resources/) — factory and NFT ABIs

## Capabilities

### Discovery

Trending or new collections on a specific chain, drops or editions by bucket (mainnets / testnets), single-collection lookups by address, and holder lists. Chain names, aliases, and IDs are all accepted — "Base", `base`, and `8453` resolve to the same network.

### Mint

Mint one or more editions of a public collection. The skill always runs a prepare step first to confirm the mint is currently valid (phase open, supply available, wallet not over the per-address cap), then presents the full cost summary before signing.

### Faucet / Faucet Pass

Claim test tokens on any chain where `/api/chains` reports `faucet: true`. When a claim fails for a backend or dispenser reason (5xx, on-chain revert, dispenser transfer failure), the fallback path classifies the failure and proposes the next viable faucet-enabled testnet inline.

If a chain gates its faucet behind the **OmniHub Faucet Pass** (NFT on Base), the skill offers to mint the pass in the same conversation, then claims the faucet on the target chain automatically.

### Collection creation

Deploys a new NFT collection through OmniHub's factory, syncs it with the backend, and updates on-chain metadata — in one flow, from one instruction.

**Defaults:**

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| Mint price   | `0` (fixed — not user-configurable in this skill) |
| Supply       | `1000` (overridable)                              |
| Royalty      | `5%` (500 bps)                                    |
| Transferable | `true`                                            |
| Phase        | Public Mint                                       |
| Mint window  | Now → now + 365 days                              |
| Description  | Auto-filled if not provided                       |

**Not supported in this flow:**

- Paid mint setup — mint price is always `0` here. Custom pricing, if needed, must be configured manually after deployment.
- Custom phases (e.g. allowlist-only, tiered, time-gated).
- Allowlists / Merkle roots.
- Per-address caps beyond the defaults.

If you need any of the above, deploy the collection first through this skill and then configure it manually on OmniHub or directly on the contract.

**Runtime behavior:**

1. **Auth.** OmniHub authentication is required before anything is written. It's a wallet signature, not a transaction, and does not spend gas.
2. **Prepare.** The skill reads `createFee()` live from the factory on the chosen chain, assembles the full `CreateParams` struct, and shows a single-transaction summary.
3. **Deploy.** Calls `factory.create(CreateParams)` with `value = createFee()` and parses the `Created(address collection)` event from the receipt to learn the new contract address.
4. **Backend sync.** Posts `{ chain, name, symbol, supply, description, hash }` to `/api/skill/collection`. The backend provisions media assets and returns the metadata/media payload needed for the on-chain metadata update.
5. **Metadata update.** Builds the full on-chain metadata object — `contractURI`, `baseURI`, `imageURI`, `jsonFormat` — from the backend's `media` array (with `baseURI` left empty, matching the backend's contract) and calls `setMetadata(...)` on the new collection. **No second confirmation**: this write is part of the originally approved creation flow.

If step 4 or 5 fails, step 3 is not rolled back — the agent reports exactly which stage succeeded and offers the metadata recovery flow when applicable.

### Swap

Same-chain token swaps routed through LI.FI. The skill handles decimal conversion, checks allowance, and submits the swap only after the quote summary has been accepted. When an ERC-20 approval is required, it is confirmed in a separate, dedicated step before the swap transaction.

### Bridge

Cross-chain EVM-to-EVM bridging through LI.FI with live route selection. Native-token bridges skip approval entirely; ERC-20 bridges prompt for a dedicated approval confirmation before the bridge transaction.

## Canonical behavior rules

The skill operates through a fixed set of canonical interfaces (`collection:prepare`, `collection:deploy`, `mint:prepare`, `mint:execute`, `lifi:bridge`, `omnihub:*`, etc.). These are the only tools the agent calls.

- The agent never reads `package.json`, parses `.env`, or inspects source files at runtime to discover what it can do. Capabilities come from the skill definition and the tool registry.
- It never invents ad-hoc `tsx` one-liners, curls JSON-RPC by hand, or uses internal function names as commands.
- `AUTO_CONFIRM_TRANSACTIONS=true` means: show the transaction summary, print a one-line "executing now" marker, and proceed. No extra confirmation question is asked.
- Product-choice prompts are intentionally separate from transaction confirmations and stay manual regardless of `AUTO_CONFIRM_TRANSACTIONS`:
  - "You do not have enough test tokens on X. Mint Faucet Pass on Base and claim?" — always asked.
  - "Bridge from source chain A or B?" — always asked.
  - Only the downstream transaction confirmation (the mint itself, the bridge itself) honors auto-confirm.

## Testnet resilience

Testnet flows are designed to survive a single network going sideways.

- **Faucet fallback.** If a claim fails because the OmniHub backend or the on-chain dispenser is down (5xx, `Transfer failed`, execution reverted), the skill enumerates every other faucet-enabled testnet from `/api/chains` and surfaces the next one as an alternative. User-side failures (not a holder / 24h cooldown) do **not** trigger a hop — those would repeat on any network.
- **Best testnet for deploy.** The `collection:best-testnet` helper probes each testnet with a factory, reads the wallet balance and live `createFee()`, filters out RPCs returning implausible mock balances, and ranks viable candidates by margin. Useful when the user says "create it on a testnet" without naming one, or when the chosen testnet runs out of funds and a different one would succeed.
- **Never silent-swap.** When the user named a specific network, the skill will surface the alternative and ask before switching rather than redirecting without consent.

## Example Usage

Once installed, prompt your AI assistant:

```
show trending collections on Base
```

```
open collection 0xabc... on Optimism
```

```
mint 1 of this collection on Base
```

```
claim faucet on Push Testnet
```

```
swap all my ETH to USDC on Base
```

```
bridge 0.001 ETH from Base to Optimism
```

```
create a collection on a testnet with supply 500
```

The agent resolves chains, symbols, and amounts, then either proceeds directly or asks a single targeted question if something is missing.

## Supported Chains

This skill supports all chains currently available through OmniHub's chain registry — 70 networks at the time this section was generated, including 47 mainnets and 23 testnets. The skill resolves every chain's id, RPC, factory address, and faucet flag from `/api/chains` at runtime, so newly added networks become usable without any code change in this repo.

**Mainnets:** Ethereum, Base, Optimism, Arbitrum One, Polygon, BNB Smart Chain, Avalanche, Linea, Scroll, Blast, Mantle, Mode, Zora, Taiko, Shape, Unichain, Soneium, Ink, Lisk, Morph, World Chain, Berachain, Hyper EVM, Sei Network, Ronin, Kaia, Story, Monad, MegaETH, Citrea, Stable, 0G, Mitosis, Plume, Somnia, Mezo, Ape Chain, Hemi, Gravity, Lens, Bob, Katana, Rari, Camp, Botanix, Plasma, Gate Layer.

**Testnets:** Sepolia, OPN Testnet, Push Testnet, Stable Testnet, Arc Testnet, Pharos Atlantic Testnet, Neura Testnet, Giwa Testnet, IRYS Testnet, Fluent Testnet, ZenChain Testnet, Kii Testnet, Doma Testnet, Kite AI Testnet, RISE Testnet, Helios Testnet, X1 Testnet, Mawari Testnet, SANDchain Testnet, Robinhood Testnet, Tempo Testnet, SRW Testnet, LitVM LiteForge.

This list was generated from the OmniHub `/api/chains` registry at the time of this README update. It is a static snapshot — for the live set of supported chains and their faucet/RPC flags, query `/api/chains` directly or run a discovery tool against any chain alias above.


## Safety / limitations

- **Real funds.** Every write tool in this skill signs and broadcasts a real transaction from the configured `PRIVATE_KEY`. Test on a testnet first.
- **EVM only for execution.** LI.FI can _quote_ routes that touch non-EVM chains (Solana, Bitcoin, etc.), but this skill's execution path is EVM-only. Non-EVM source chains are rejected at the execute step with a clear message.
- **Paid mint setup is manual.** Mint price is fixed to `0` during creation in this skill. Anything else — paid mints, tiered pricing, allowlists — must be configured on the collection after the initial deploy.
- **Advanced phase configuration is manual.** The skill deploys a single 365-day public phase. Additional phases, per-address caps, and Merkle-root allowlists are out of scope for the initial creation flow.
- **Metadata recovery.** If on-chain `setMetadata` fails after a successful deploy + backend sync, the collection is still registered and usable — the skill offers a one-command recovery that refetches the backend's media and retries `setMetadata` without redeploying.

## Project structure

```
omnihub-skill/
├── .claude/skills/omnihub-skill/   # conversational skill definition
├── src/
│   ├── tools/                            # canonical wallet tools (registry-driven)
│   │   └── lifi/                         # LI.FI bridge/swap tools
│   ├── integrations/
│   │   ├── omnihub/                      # chain registry, auth, API client
│   │   └── lifi/                         # LI.FI client + types
│   ├── lib/                              # wallet, env, confirmation helpers
│   ├── resources/                        # ABIs (factory, NFT)
│   └── runTool.ts                        # entry point: `npm run tool -- <name>`
├── .env.example
├── package.json
└── tsconfig.json
```

Tools are registered by string key in `src/tools/index.ts`. Adding a new tool is a three-step change within that same file: implement, export, and register.


## Learn More

- [OmniHub](https://omnihub.xyz) — the NFT platform this skill targets
- [OmniHub API](https://api-v2.omnihub.xyz) — chain registry and collection data
- [viem](https://viem.sh) — TypeScript Ethereum client used by the wallet tools
- [LI.FI](https://li.fi) — cross-chain swap and bridge aggregator powering the swap and bridge flows
- [Claude Code](https://claude.com/claude-code) — the agent harness that loads this skill
