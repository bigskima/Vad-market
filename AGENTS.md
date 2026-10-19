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
