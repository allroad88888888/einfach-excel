---
name: react-excel-feature-wave
description: "Deliver the next small, reviewable react-excel feature batch through the real UI Core and Rust/WASM path. Use when the user asks to continue, do the next batch, or add several spreadsheet functions for staged review."
---

# React Excel Feature Wave

Read [the react-excel architecture skill](../../SKILL.md) before changing code.

## Batch contract

- Default to exactly three related, independently testable user functions unless the user names a
  different count.
- State the three functions before implementation. Keep them in one product area so the owner can
  test them in one pass.
- Do not open a task tree for an ordinary batch. Do not commit until the user asks after testing.
- Finish the current three functions completely before selecting another batch.
- If the user requests persistent goal-mode work, the batch is a verification unit, not the goal's
  completion condition. Report a verified batch in commentary and continue the next in-scope batch.
  Keep the goal active until its agreed overall scope is achieved; do not narrow it to the current
  three functions. Persistence does not authorize commits, pushes, new product scope or bypassing
  a required user decision.

## Implementation boundary

- Keep the path `React event -> UI Core command atom -> Rust Worker/WASM -> returned projection ->
  React render`.
- Reuse one semantic command when the three functions are variants of the same operation.
- Rust owns workbook data and mutations. Never imitate a missing engine result with React state or
  a TypeScript workbook mirror.
- If a function has visible persisted state, add a few obvious examples to that demo's original
  Rust seed data. Do not hard-code coordinate-specific styles in React.
- Split files by responsibility and obey the repository line limits.

## Per-function E2E

- Maintain [`e2e/FEATURES.md`](../../e2e/FEATURES.md) independently from the existing tests: inspect
  the UI entry points and user actions first. Never generate the feature scope from test counts.
- Register each function with a stable ID, one concrete user action, its E2E file and exact primary
  test title. Variants and cross-feature regressions may add tests, but one broad primary test cannot
  stand in for separate functions. Split mouse/keyboard entry points and separate menu actions.
- A primary test must perform that actual DOM interaction and assert its result and unaffected
  neighbors; showing a menu or dispatching a Core atom from a browser helper does not prove the entry.
- New functionality, changed behavior and bug fixes must add or update their corresponding test
  and row in the same change. For a bug, reproduce the actual UI failure before fixing it where
  practical. Unit tests do not substitute for that browser entry point.
- Run `pnpm check:e2e-features` to detect deleted/renamed, duplicate, skipped, fixme or expected-failing
  primary tests. This only verifies registration. After execution, use
  `pnpm check:e2e-features --results /path/to/playwright.json` for actual per-function pass evidence.
- Do not mark a function done if its primary test is missing or unexecuted. Report historical
  backfill gaps and unfinished catalog granularity explicitly; a green catalog gate does not prove
  all UI actions have been inventoried. In particular, Shift+click, Shift+arrows and Shift+headers
  are separate interactions, not interchangeable coverage.

## Acceptance gate

For every batch, add all applicable evidence:

1. UI Core Vitest tests for command and Rust transport semantics.
2. React Vitest tests for hooks, DOM state, and event dispatch.
3. Persistent Playwright E2E under `excel/react-excel/e2e` using the real Vite Worker and
   Rust/WASM artifact. A temporary browser script is supplemental, not a replacement.
4. Seed-data E2E when initial formatted or calculated examples were added.

Run targeted tests while developing. Run the following gates once on the final batch candidate:

```bash
pnpm check:presentation
pnpm check:e2e-features
pnpm check:cycles
pnpm lint:check
pnpm --filter @einfach-excel/spreadsheet-ui-core build
pnpm --filter @einfach-excel/react-excel typecheck
pnpm --filter @einfach-excel/react-excel test
pnpm --filter @einfach-excel/react-excel e2e
pnpm --filter @einfach-excel/react-excel build
git diff --check
```

## Verification cost and CI follow-through

- Record the tested source revision, command, and final result. Reuse passing evidence when its
  inputs are unchanged; documentation-only edits do not require another full product regression.
- Keep only one full E2E run active. Freeze its source, tests, and WASM until it finishes; observe
  the same process instead of restarting after a tool timeout. After a failure, reproduce and fix
  it with targeted tests before starting the next full acceptance run.
- Resume from the latest handoff and relevant files, not repeated reads of the entire history.
- When WASM exports change, run the existing `wasm_public_api_signatures_unchanged` Rust test and
  review the API snapshot diff in the same change. Never regenerate blindly to silence a failure.
- After an authorized push, inspect workflows for that exact commit. Fix actual failures before
  another feature batch; distinguish `action_required` from a test failure and request approval
  without bypassing repository security. Report pending checks as pending, not successful.

Hand off with the three functions, seed examples, E2E result, service URL, and commit state.
