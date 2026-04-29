# Disclaimer

Read this document carefully before installing, configuring, or using the OmniHub Skill. By using this software you accept the terms set out below.

## A. Nature of the project

The OmniHub Skill is an open-source developer tool and Agent Skill that an AI coding assistant can load to interact with OmniHub and LI.FI through natural-language requests. The skill is provided **"as is"** and **"as available"**, without warranty of any kind, express or implied — including but not limited to warranties of safety, correctness, fitness for any particular purpose, uptime, or reliability. The skill is not a custodial service, not a managed wallet, and not a financial product.

## B. No professional advice

Nothing produced by this skill — including chain suggestions, route quotes, mint suggestions, faucet routing, bridge or swap proposals, gas estimates, collection deployment proposals, summaries, warnings, or any other agent output — constitutes legal, financial, investment, tax, accounting, compliance, regulatory, or any other form of professional advice. Every suggestion the skill surfaces must be independently reviewed by the user before any on-chain action is approved or executed.

## C. User responsibility

The user is solely responsible for:

- Reviewing every transaction summary in full — chain, contract address, token symbol, decimals, amount, fees, approvals, route — before approving or executing it.
- Verifying collection contract addresses, recipient addresses, factory addresses, and any other on-chain target the skill resolves on the user's behalf.
- Confirming that the action about to be broadcast is the action the user actually intends.
- Confirming that the wallet address derived from the configured `PRIVATE_KEY` is the correct one for the intended action.
- Compliance with all applicable laws, regulations, sanctions regimes, and platform terms of service in every jurisdiction the user operates in.

If a transaction summary does not match the user's intent, the user must cancel and not proceed.

## D. Real transaction risk

The skill can trigger real on-chain actions using the configured `PRIVATE_KEY`, including:

- Public mints on OmniHub collections
- Faucet claims and OmniHub Faucet Pass NFT mints
- New collection deployments through the OmniHub factory
- On-chain metadata updates via `setMetadata(...)`
- Same-chain token swaps via LI.FI
- Cross-chain EVM-to-EVM bridges via LI.FI
- ERC-20 approval transactions issued in support of the above

Real funds are spent on every signed transaction. Transactions may fail, revert, time out, get stuck in the mempool, be mis-routed, settle with unfavourable slippage, or behave unexpectedly because of network conditions, contract behaviour, or third-party failures. Once a transaction is broadcast, it cannot be recalled. The skill provides no guarantee of execution success, settlement time, slippage, finality, or recoverability.

## E. Third-party dependency risk

The skill depends on multiple third-party systems that are outside the maintainers' control, including:

- The OmniHub API and the `/api/chains` registry
- OmniHub backend endpoints used by the skill, including `/api/skill/signature-message`, `/api/skill/signature-verify`, `/api/skill/collection`, and `/api/skill/faucet`
- LI.FI's quote, routing, and status APIs
- Public RPC endpoints listed in the OmniHub chain registry
- The underlying blockchain networks and their validators
- The host AI agent platform (for example Claude Code) and the sandbox it provides

These services may be unavailable, return incorrect or stale data, change behaviour without notice, or fail in ways that cause the skill to behave unexpectedly. Maintainers are not responsible for third-party failures, third-party data quality, or the consequences of relying on third-party output.

## F. AI / agent risk

The skill is operated by an AI coding assistant. Agent-generated output — including parsed user intent, resolved chain aliases, selected routes, generated transaction parameters, and natural-language summaries — may be incomplete, incorrect, or unsuitable for the user's actual situation. The agent may misread an instruction, mis-resolve a chain alias, route through an unintended path, omit a relevant warning, or produce a transaction that does not match what the user expected. Using an AI coding agent does not remove the user's responsibility to verify every action before approval. The skill and its output must not be relied upon as guaranteed, authoritative, audited, or risk-free.

## G. Prohibited use

The skill must not be used for, or to facilitate, any of the following:

- Unlawful activity in any applicable jurisdiction.
- Fraud, phishing, scams, deception, or impersonation of another person, project, or brand.
- Malicious or unauthorized exploitation of any contract, protocol, infrastructure, or person.
- Presenting AI-generated output as guaranteed, audited, or risk-free to a third party.
- Handling funds, assets, wallets, private keys, or credentials belonging to another person without that person's explicit, informed, and revocable authorization.
- Any activity that violates the terms of service of OmniHub, LI.FI, the host AI platform, the underlying RPC providers, or any other third-party dependency the skill relies on.

## H. Limitation of liability

To the maximum extent permitted by applicable law, the authors, maintainers, and contributors of this skill are not liable for any losses, damages, claims, costs, or expenses — including but not limited to lost funds, failed transactions, reverted transactions, mis-routed transactions, slippage, MEV, backend failures, RPC failures, chain reorganizations, third-party service failures, agent misinterpretation, wallet operation mistakes, key compromise, or unauthorized access — arising from, related to, or in connection with any use, misuse, or inability to use this skill.

This limitation applies regardless of the legal theory of liability — whether contract, tort, statute, strict liability, or otherwise — and regardless of whether the maintainers were advised of the possibility of such loss.

Some jurisdictions do not allow certain limitations of liability; in those jurisdictions the limitations above apply only to the extent permitted by local law, and nothing in this disclaimer is intended to exclude liability that cannot lawfully be excluded.

## Acceptance

If you do not agree to these terms, do not install, configure, or use this skill. Continued installation, configuration, or use of the skill constitutes acceptance of this disclaimer in the form in which it is published at the time of that use.
