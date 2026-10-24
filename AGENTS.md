# UI/UX Implementation Agent Instructions

## Mission
Implement user-approved UI/UX designs in the existing VAD Market application. This is an existing product, not a greenfield rebuild. Treat the approved MagicPath canvas/design as the visual source of truth and the repository as the source of truth for application behavior, routing, data, permissions, and architecture.

## Design workspace
- MagicPath project: https://www.magicpath.ai/files/462554795299987456
- Repository: https://github.com/bigskima/Vad-market
- Work only on the user-approved design or explicitly requested scope. If the design is ambiguous or materially conflicts with existing product behavior, ask before making assumptions.

## Required workflow
1. Inspect the current branch, recent commits, open pull requests, relevant components, routes, theme tokens, package scripts, and existing tests before editing.
2. Confirm the intended base branch with the user/task context. Never assume `main` is the correct base if active work is in a feature branch or pull request.
3. Create/use a dedicated feature branch. Do not commit directly to `main` or another protected/shared working branch.
4. Read the existing implementation and reusable components first. Follow the project's current Expo/React Native and web patterns; do not replace the stack or create a disconnected prototype.
5. Implement the approved design in the real application, preserving behavior, accessibility, responsive layouts, navigation, loading/empty/error/success states, and existing integration points.
6. Reuse existing design tokens/components where practical. Avoid arbitrary new dependencies. Keep dark, light, and system themes working wherever the app supports them.
7. Keep business rules and user-facing configuration database/backend-driven. Do not hardcode prices, fees, currencies, service areas, market data, feature flags, permissions, or policy values that are meant to be configurable.
8. Protect financial and market behavior: do not mix demo/test balances, orders, ledgers, or markets with live NGN/USDC data. Do not change wallet, settlement, oracle, auth, RLS, or database behavior as a side effect of a visual refactor. If such a change is necessary, explain it and isolate it.
9. Do not apply migrations to production, change secrets, trigger APK/AAB builds, merge a PR, or deploy production unless the user explicitly authorizes that specific action.
10. Validate with the most relevant available commands. The root scripts include `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build:web`. Check the workspace scripts and required Node version (>=22) first. Report commands that could not run; never claim an unrun check passed.
11. Review the final diff for regressions, dead code, accidental unrelated changes, accessibility, theme consistency, and mobile/web layout issues.
12. Open a pull request to the intended active base branch with a clear summary, screenshots/preview when available, validation results, risks, and any remaining work. Leave it unmerged for user review.

## Design acceptance criteria
- Match the approved visual reference in hierarchy, spacing, typography, color, surface treatment, interaction, and responsive behavior.
- Implement real controls and existing data flows; do not leave static mock data or nonfunctional buttons in production UI.
- Include relevant loading, empty, error, disabled, and success states.
- Preserve existing routes, permissions, analytics/events, and accessibility labels unless the task explicitly changes them.
- Keep changes focused on the approved scope; list any discovered adjacent issues instead of silently expanding scope.

## Completion report
Report: base branch and feature branch; changed files; user-visible changes; tests/builds actually run and their results; preview/PR links; known limitations; and anything awaiting user approval.

---

# Arc Studio Implementation — VAD Market Phase 2

## Implementation plan
Saved at: arc-studio-plans/PLAN.md

## Arc Testnet configuration (verified 2026-10-24 from https://docs.arc.io/arc/references/connect-to-arc.md)
| Field | Value |
|---|---|
| Chain ID | 5042002 |
| RPC | https://rpc.testnet.arc.io |
| Explorer | https://explorer.testnet.arc.io |
| USDC address | 0x3600000000000000000000000000000000000000 |
| USDC ERC-20 decimals | 6 |
| USDC native (gas) decimals | 18 |
| Finality | Sub-second (confirmation_target = 1) |
| maxFeePerGas floor | 20 Gwei |
| Toolchain | arc-forge (Arc Foundry fork — NOT standard forge) |

## Arc Mainnet configuration (verified 2026-10-24)
| Field | Value |
|---|---|
| Chain ID | 5042 |
| RPC | https://rpc.mainnet.arc.io |
| Explorer | https://explorer.arc.io |
| USDC address | 0x3600000000000000000000000000000000000000 |

## Ephemeral testnet keypairs (TESTNET ONLY — no real value)
| Role | Address |
|---|---|
| Deployer / Admin | 0x52dAe9a2ae632Df8b4f5db1C7D2FE1A9e45992D2 |
| Quote Signer | 0x1394c9c507f5640953EB03bBf5DFA8d11F7f634b |
| Settlement Signer | 0xe732881D5b561EA8B70A5B5e65c4ace10c757F3a |
| Resolver | 0xE98598caE77D7D6e73470f77D509E155B0C780Cd |
| Treasury | 0x9a85eCc03742F34b184528AC7150A66D2B8cD161 |

Private keys are in contracts/evm/deploy/testnet-keys.md (NEVER commit actual private key values; that file documents the process and addresses only).
Create a local .env.testnet (gitignored) with the private keys before deploying.

## VadSettlementV1 deployment
- Status: NOT YET DEPLOYED (Phase 2 Step 3 — awaiting arc-forge install + faucet funding)
- Deploy script: contracts/evm/script/DeployVadSettlementV1.s.sol
- Install arc-forge: contracts/evm/deploy/install-arc-foundry.sh
- Deploy instructions: contracts/evm/deploy/testnet-keys.md
- Contract address: TBD — update this record after deploy

## Migrations applied / pending
| Migration | Status | Notes |
|---|---|---|
| 20261024100000_arc_testnet_config_correction.sql | PENDING | Corrects RPC and explorer URLs |
| 20261024110000_arc_testnet_activation.sql | PENDING | Apply after deploy; replace contract address placeholder |

## CRITICAL: arc-forge required
Standard `forge` cannot reproduce Arc-specific behavior (USDC native gas, EIP-7708 Transfer events, blocklist enforcement).
Use `arc-forge` for all deployment and fork testing. Install via contracts/evm/deploy/install-arc-foundry.sh.

## Key Arc EVM differences to remember
- USDC is the native gas token (same balance, two views: native=18 decimals, ERC-20=6 decimals)
- VadSettlementV1 uses ERC-20 transferFrom/transfer → always 6 decimal amounts ✓
- Sub-second finality → confirmation_target = 1 in DB ✓
- 20 Gwei maxFeePerGas floor → gas estimation must use at least this value
- No WETH wrapper needed — USDC ERC-20 interface is built in at 0x3600...0000
