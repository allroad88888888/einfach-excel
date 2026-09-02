---
name: react-excel
description: Implement or refactor the React Excel product in this repository using @einfach/react atom hooks and the spreadsheet-ui-core/view boundary. Use for React provider wiring, selection, projection, editing, pointer interaction, or React state ownership under excel/react-excel. Do not use for Solid/Vue adapters, pure visual styling, or Rust engine internals.
---

# React Excel

Keep `excel/react-excel` a view implementation over `excel/spreadsheet-ui-core`, not a second
spreadsheet state core.

## Architecture boundary

```text
Rust/WASM Engine
      ↕ backend protocol
spreadsheet-ui-core
      ↕ Einfach atoms
@einfach/react
      ↕ React hooks
react-excel views
```

- Rust owns authoritative workbook data, calculation, transactions, and mutation results.
- `spreadsheet-ui-core` owns spreadsheet atoms, cross-atom state transitions, backend calls,
  request correlation, retries, and projection invalidation.
- `react-excel` owns rendering, React effects, DOM events, focus, pointer capture, measurements,
  scrolling, refs, and application startup presentation.
- Do not introduce a plugin runtime, lifecycle framework, command bus, or general event bus for
  existing features. Einfach atoms are the state and command surface.
- The application bootstrap may create, await, and dispose the Rust Worker backend. Workbook views
  must not call backend read or mutation methods directly.

## Use the React atom package

Use `@einfach/react` rather than rebuilding its bindings locally.

```tsx
import { Provider as AtomProvider } from '@einfach/react'

const core = createSpreadsheetUi({ backend })

return <AtomProvider store={core.store}>{children}</AtomProvider>
```

- Always pass the workbook store to `AtomProvider`; do not rely on its global default store.
- Keep provider isolation tests so two workbook instances cannot share state accidentally.
- Keep `@einfach/react` compatible with the installed `@einfach/core` version. Do not import React
  atom hooks from `@einfach/solid` or another framework package.
- Do not maintain a local `useSyncExternalStore` adapter such as `useStoreValue`.

### Reads

Read an atom directly with `useAtomValue`:

```tsx
const selection = useAtomValue(selectionSnapshotAtom)
const editing = useAtomValue(editingSessionAtom)
```

Do not create `{ getSnapshot, subscribe }` objects or manually call `store.getter/store.sub` from
production React hooks.

### Writes

Get a stable setter with `useSetAtom`:

```tsx
const setDraft = useSetAtom(editingDraftAtom)
const cancelEditing = useSetAtom(cancelEditingAtom)
```

Do not wrap `store.setter(atom, input)` in a local `useCallback`. `useSetAtom` already provides the
React binding and stable function identity.

Prefer separate `useAtomValue` and `useSetAtom` calls. Use `useAtom` only when the same component
genuinely needs both the value and setter; do not subscribe a write-only control unnecessarily.

## Put semantic actions in command atoms

When an action reads multiple atoms, writes multiple atoms, validates spreadsheet state, calls the
backend, or defines ordering, put it in `spreadsheet-ui-core` as a command atom:

```ts
export const startCellEditingAtom = atom(
  null,
  (get, set, input: StartCellEditingInput): boolean => {
    const projection = get(projectionSnapshotAtom)
    const cell = findProjectedCell(projection, input.cell)
    if (cell === undefined) return false

    set(startEditingAtom, {
      sheetId: input.sheetId,
      cell: input.cell,
      draft: cell.formula ?? cell.displayValue,
      source: 'cell',
    })
    return true
  },
)
```

React then only dispatches it:

```tsx
const startEditing = useSetAtom(startCellEditingAtom)
startEditing({ sheetId, cell })
```

Rules:

- Do not declare spreadsheet atoms inside `excel/react-excel/src`.
- A source atom stores canonical UI-core state.
- A derived atom computes a view of existing atom state.
- A command atom uses `atom(null, (get, set, input) => ...)` for semantic transitions.
- A single primitive write can use its existing writable atom directly; do not add a command atom
  that merely renames one setter.
- Keep commands framework-neutral: no React events, DOM nodes, refs, or hooks in UI-core.

### Async commands

Async command atoms must settle ordinary business failures as explicit outcomes instead of rejected
Promises. Einfach store setters schedule internal Promise finalization; an unhandled rejected branch
can escape even when a caller later observes the original Promise.

Prefer:

```ts
type LoadOutcome =
  | { status: 'ready' }
  | { status: 'superseded' }
  | { status: 'failed'; error: string }
```

Reserve thrown errors for programmer errors or impossible invariant violations. Publish user-facing
backend failures into the domain's error/lifecycle atom.

## Decide whether `useCallback` belongs

`useCallback` is not a spreadsheet command mechanism.

Remove it when the callback only:

- calls `store.setter`;
- reads `store.getter`;
- groups spreadsheet state transitions;
- injects backend, projection refresh, history, or retry behavior into UI-core.

It may remain when the callback genuinely owns React or DOM behavior:

- focusing an element through a ref;
- pointer capture and release;
- mapping a React event to a cell coordinate;
- a stable callback required by a React effect or memoized child;
- scrolling or measuring the current rendered viewport.

Even in those cases, keep spreadsheet semantics in command atoms. The DOM callback should normalize
the event and dispatch one typed atom command.

## Local React state

`excel/react-excel/src` must have zero `useState` and `useReducer` calls. Render-affecting local
facts belong in focused `spreadsheet-ui-core` atoms even when only the React product currently reads
them. This includes application loading/error/ready presentation, viewport metrics, and the visible
scroll window. Reuse existing viewport atoms and commands instead of declaring a parallel window
atom.

`useRef` is limited to non-render identity that React or the DOM requires: element refs, focus,
pointer identity/capture, and in-flight event guards such as blur suppression. It must not hide
business or render state. External resources such as the Rust Worker backend stay in the owning
effect closure; their rendered lifecycle and backend binding live in UI-core atoms.

Do not copy selection, editing sessions, projection results, workbook facts, history, validation, or
feature lifecycle into React state.

## Refactoring existing features

When converting an existing React feature:

1. Identify every atom read, atom write, direct backend call, and React-local state value.
2. Replace manual subscriptions with `useAtomValue` and setter wrappers with `useSetAtom`.
3. Move multi-atom or backend behavior into a focused UI-core command atom.
4. Keep only DOM/view adaptation in React.
5. Delete obsolete bridge hooks instead of retaining compatibility wrappers with no product caller.
6. Preserve current user behavior; do not add Ribbon, history, clipboard, or other features during a
   boundary refactor.

If the active work belongs to `.tasks/react-excel-core-view-boundary`, follow its current leaf and do
not start the next leaf before the required review and user checkpoint.

## File and verification rules

- Ordinary files must stay at or below 300 physical lines and have one responsibility.
- Do not create `utils.ts`, generic `hooks/`, or internal barrel files.
- Keep tests next to the behavior boundary: UI-core command tests for state/transport semantics;
  React tests for rendering, DOM interaction, focus, and visible results.
- Test multiple Providers when changing store/provider wiring.
- Test single-dispatch behavior when changing editing or pointer commands.

Run the relevant checks after changes:

```bash
pnpm --filter @einfach/spreadsheet-ui-core build
pnpm --filter @einfach/react-excel typecheck
pnpm --filter @einfach/react-excel test
pnpm --filter @einfach/react-excel build
pnpm check:cycles
git diff --check
```

Also run scoped ESLint and `wc -l` on every new or substantially changed file. Before handoff, scan
`excel/react-excel/src` for new `atom(` declarations and workbook code for direct backend calls.
