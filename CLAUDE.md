# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other contributors working with code in this repository.

## What this repository is

The OmniHub Skill is an open-source Agent Skill that lets a coding-agent host (Claude Code or any compatible runtime) drive the OmniHub NFT platform and LI.FI swap/bridge routing through natural-language requests. The repository is structured around reusable, prepare-then-execute wallet tools so the same building blocks can serve interactive skill use, headless scripts, and downstream forks.

When extending this repository, prefer changes that keep the prepare/execute pattern consistent, keep tool inputs declarative (env vars or typed arguments), and keep the skill definition in `.claude/skills/omnihub-skill/SKILL.md` as the single source of truth for user-facing behavior.

## Primary UX: Skill-first

The primary interface for this agent is conversational via Claude Code skills. The user types a natural language request in the Claude Code chat, and Claude handles the full flow directly — no npm commands, no terminal prompts, no file paths shown to the user.

```
User: "mint the top collection on OPN testnet"
→ Claude resolves the chain, finds the top collection, runs prepareMint,
  presents the transaction summary in the conversation, asks for confirmation,
  then executes with AUTO_CONFIRM_TRANSACTIONS=true after the user says yes.
```

The skill is defined in `.claude/skills/omnihub-skill/SKILL.md`. All user-facing behavior is documented there.

## Developer and Testing Commands

These scripts are for local development, debugging, and testing tool integrations. They are not the primary user path and should not be referenced in skill documentation or shown to users.

```bash
# Run a specific tool directly
npm run tool -- address                                   # canonical wallet address lookup
CHAIN_BALANCE_CHAIN=base npm run tool -- chain-balance    # canonical native balance lookup
TOKEN_BALANCE_CHAIN=base TOKEN_BALANCE_TOKEN=USDC npm run tool -- token-balance

# OmniHub collection tools (chain set via OMNIHUB_CHAIN env var)
OMNIHUB_CHAIN=base npm run omnihub:discover
OMNIHUB_CHAIN=iopn-testnet npm run tool -- mint:flow

# Build TypeScript to dist/
npm run build
```

All scripts use `tsx` for direct TypeScript execution. No build step is needed during development.

```bash
# Type-check all source files without emitting output
npm run tools:check
```

## Architecture

This is an **AI wallet agent** for blockchain operations built around a skill-first UX. The key layers are:

**Skills layer** (`.claude/skills/`) defines how Claude handles user requests conversationally. This is the primary entry point. Skills orchestrate tools, handle confirmations in the conversation, and drive the full user flow without exposing implementation details.

**Tools layer** (`src/tools/`) contains discrete async functions for each wallet operation, registered in `src/tools/index.ts` as a string keyed object. Adding a new tool means: implement it, export from `index.ts`, and document in the relevant skill. Tools are called by Claude via Bash (with env prefixes like `AUTO_CONFIRM_TRANSACTIONS=true` when Claude has already collected consent conversationally).

**Lib layer** (`src/lib/`) provides shared utilities:

- `wallet.ts` creates a viem account from the `PRIVATE_KEY` env var
- `env.ts` validates and exposes all environment variables with strict format checks. The private key must be `0x` plus 64 hex chars.

**Viem usage pattern:** read operations use `createPublicClient`, write operations use `createWalletClient`. BigInts from viem must be serialized manually, for example with `formatEther()` or custom JSON replacers, since `JSON.stringify` does not handle them natively.

## Developer guardrails

**Never create source files ad hoc during execution.**
If a tool or import is missing, stop and report the error clearly. Do not improvise replacement `.ts` files. Missing internal modules indicate a broken dependency that must be repaired at the source, not papered over.

- If `npm run tool -- <name>` fails on load (before the tool runs), the registry has a broken import. Audit `src/tools/index.ts` and its imports — do not create placeholder files.
- If a script in `package.json` references a missing file, update the script to point to the correct existing file, or remove the script. Do not create the missing file unless it is an intentional addition to the architecture.
- Run `npm run tools:check` after any import change to catch type errors before execution.
- The canonical source of truth for which tools exist is `src/tools/index.ts`. Any tool registered there must have a corresponding implementation file.

## Environment

Copy `.env.example` to `.env` and fill in:

- `PRIVATE_KEY` wallet private key in hex format with `0x` prefix
- `AUTO_CONFIRM_TRANSACTIONS` `true` (skill-managed consent) or `false` (interactive prompt)

RPC endpoints and chain metadata are sourced from OmniHub's `/api/chains` at runtime. The agent must not rely on `RPC_URL` (or any other per-chain RPC env var) for any supported flow.
