---
name: react-excel
description: "Implement or review the maintained React spreadsheet path: react-excel → spreadsheet-ui-core → Rust/WASM. Use for React workbook UI, UI-core atoms, editing, selection, projection, and boundary simplification. Other framework views are not React compatibility targets."
---

# React Excel

Keep the maintained path short:

```text
React DOM/event -> UI Core atom command -> Rust Worker/WASM -> UI Core atom result -> React render
```

## Ownership

- Rust owns workbook values, formulas, calculation, transactions, and mutation results.
- `spreadsheet-ui-core` owns framework-neutral UI state, derived state, and semantic command atoms.
- `react-excel` owns DOM rendering, events, focus, pointer capture, measurement, scrolling, and startup.
- The Worker transport owns only request/response correlation, error propagation, and disposal.

Do not make paused `solid-excel` or `excel-site`, or the separate `vue-excel` view, a compatibility
target for React work. Do not add a backend, adapter, bridge, port, lifecycle, retry, ticket, or ID
for a hypothetical future consumer.

## React rules

- Read atoms with `useAtomValue`; dispatch with `useSetAtom` from `@einfach/react`.
- Do not declare spreadsheet atoms in `excel/react-excel/src`.
- Do not use `useState` or `useReducer` for render-affecting spreadsheet state.
- Do not call `store.getter`, `store.setter`, or `store.sub` from React product code.
- Do not pass controller objects that bundle atom values and setters through props. The component
  that owns the interaction imports the public atom and hook directly.
- `useRef` is only for DOM elements or non-render identity. `useCallback` is only for genuine DOM or
  React identity needs, never as a spreadsheet command layer.

## Command rules

- One user action dispatches one public command atom.
- Put multi-atom transitions, validation, ordering, and Rust requests in a focused UI Core command
  atom: `atom(null, (get, set, input) => ...)`.
- Keep React events, DOM nodes, refs, and hooks out of UI Core.
- If Rust can return the mutation result and visible projection together, publish that result once.
  Do not add a second refresh, retry lifecycle, or optimistic workbook mirror.
- A lifecycle state is justified only when two states produce different user-visible behavior.
- A wrapper or abstraction is justified only by a current failure mode or a current second
  implementation. “Might be useful later” is not enough.

## Before editing

Write the shortest call chain and name the owner of every state. Reuse an existing command when it
already represents the action. If a proposed layer can be removed without changing behavior, remove
it before coding.

## Verification

Run:

```bash
pnpm check:presentation
pnpm --filter @einfach/spreadsheet-ui-core build
pnpm --filter @einfach/react-excel typecheck
pnpm --filter @einfach/react-excel test
pnpm --filter @einfach/react-excel build
git diff --check
```

UI Core tests verify state and Rust-command semantics. React tests verify rendered behavior, DOM,
focus, and event dispatch. Before handoff, list the final call chain and explain why each added layer
is necessary; delete any layer that cannot be justified in one plain sentence.
