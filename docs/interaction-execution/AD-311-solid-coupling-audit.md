# AD-311 Solid coupling audit

## Scope and method

This is a historical, read-only snapshot of the non-TSX inventory taken below
`excel/solid-excel/src-vnext` at the time of the AD-311 audit. The paired
[TSX coupling ledger](AD-311-solid-coupling-audit-tsx.md) records every TSX
import declaration separately; both files together satisfy AD-311.

Commands (run from the repository root):

```sh
rg -n --glob '*.{ts,tsx}' "^import(?:\\s+type)? .* from 'solid-js'" excel/solid-excel/src-vnext
```

Snapshot result: 24 `.ts` files had 25 `solid-js` import declarations; 99 `.tsx` files
have 111 declarations, all recorded in the paired ledger. The `.ts` inventory
below records its 25 declarations. `adapter/worker-runtime-ts.ts` contains a
comment mentioning `solid-js`, but has no import and is deliberately excluded.

Classification rule:

- **Downshiftable (DS):** the Solid reference is a type-only pull reader or a
  presentation type that can be mechanically represented by a framework-neutral
  function type (`type Reader<T> = () => T`) or structural CSS type. No Solid
  scheduling, owner, context, or JSX node is required by its behavior.
- **Framework-specific (FS):** the current behavior relies on Solid lifecycle,
  scheduling, signals/memos, JSX nodes, or `@einfach/solid` provider hooks.
  Its `Accessor` inputs may use the shared `Reader<T>` later, but the listed
  hook/effect must remain an adapter concern until a headless lifecycle
  contract exists (AD-313).

## Downshiftable files (8)

| Path and Solid locations                                                                 | Direct dependencies                                                          | Mechanical destination                                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `context-menu/context-menu-focus.ts:1,15-16` — `Accessor` inputs only                    | UI-core menu intent/state/reason types                                       | Replace with `Reader`; move the imperative DOM controller unchanged.             |
| `feedback/types.ts:1,28` — `Accessor` property only                                      | None                                                                         | Keep feedback union framework-neutral; type `feedback` as `Reader<…>`.           |
| `format-cells/format-cells-panel-types.ts:1,5` — `Accessor` property only                | UI-core `FormatCellsDraft`                                                   | Move the panel input contract with `Reader`.                                     |
| `overlay/types.ts:1,13,17,19,27` — `Accessor` properties only                            | None                                                                         | Move overlay DOM input/output contracts; replace all reader fields.              |
| `sheet-tabs/sheet-tab-controller.ts:2,40-41` — `Accessor` inputs only                    | `@einfach/core` `Store`; UI-core sheet-tab atoms/types; local focus registry | Move the full event controller unchanged after changing its two readers.         |
| `toolbar/ToolbarActionDeps.ts:1,15,20-21` — `Accessor` properties only                   | UI-core command/projection types; provider store return type                 | Make readers and store type explicit in the shared command dependency contract.  |
| `toolbar/anchored-menu-style.ts:1,38,53` — `JSX.CSSProperties` return/variable type only | None                                                                         | Move pure viewport geometry; replace with a structural CSS-properties type.      |
| `toolbar/useToolbarPainterCommands.ts:7,13` — `Accessor` parameter only                  | UI-core painter atoms/types; `ToolbarActionDeps`                             | Move click/double-click command controller after the shared dependency contract. |

## Framework-specific files (16)

| Path and Solid locations                                     | Coupling and direct dependencies                                                                                        | Boundary to retain                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `comments/use-comment-thread-interaction.ts:1,13,26,36`      | `Accessor`, `createEffect`, `onCleanup`; UI-core comment session, shared overlay hook, comment DOM positioning          | Solid effect owns resize/scroll listener lifetime.                                                     |
| `feedback/use-atom-feedback-presentation.ts:3,19,24`         | `createMemo`/`Accessor`; `@einfach/core`, `@einfach/solid` `useAtomValue`, feedback contract                            | Atom-to-Solid subscription and memo stay in the Solid adapter.                                         |
| `filter-sort/filter-dropdown-focus.ts:1,4-7,21,44,58,68`     | `Accessor`, three effects, cleanup; browser DOM                                                                         | Solid scheduling owns open/session transitions and Escape listener cleanup.                            |
| `find-replace/dialog-interactions.ts:1,5,18,37,46`           | Stateful `createEffect`, cleanup; browser DOM                                                                           | Solid effect previous-value semantics and listener lifetime.                                           |
| `find-replace/dialog-interactions.ts:2`                      | `Accessor`; browser DOM dialog state                                                                                    | The dialog's reactive input is consumed by the Solid-owned effect.                                     |
| `format-cells/format-cells-dialog-focus.ts:1,18-19,26-27,61` | `Accessor`, `createEffect(on(...))`, cleanup; browser DOM                                                               | Solid `on` transition/lifecycle behavior.                                                              |
| `go-to/go-to-dialog-controller.ts:1-2,43-53,56,71`           | `createEffect`, `createMemo`, `@einfach/solid`; UI-core Go To atoms, i18n, provider hooks, dialog interaction, locators | Solid provider subscriptions and memoized renderer accessors.                                          |
| `grid/grid-dom-adapter.ts:1,12-15,29-32`                     | `createSignal`/`Accessor`; browser DOM refs                                                                             | Solid signals make DOM anchors render-reactive; each framework needs its own mutable/reactive adapter. |
| `grid/grid-lifecycle.ts:1,27,63`                             | `onMount`/`onCleanup`; UI-core grid atoms, projection atom, grid runtime/view APIs                                      | Component mount/unmount is necessarily framework-owned.                                                |
| `grid/grid-projection-controller.ts:10,224,231`              | `createEffect`/`untrack`; UI-core projection/viewport atoms, provider transport, grid geometry/runtime/view APIs        | Geometry facts are subscribed through Solid dependency tracking.                                       |
| `overlay/use-overlay-interaction.ts:1,71,76,87,104`          | `createEffect`, `untrack`, cleanup; local overlay contracts/focus helpers                                               | Effect owns focus, capture listener, and restore lifetime.                                             |
| `provider/types.ts:3,21`                                     | `JSX.Element`; `@einfach/core` Store and UI-core backend ports                                                          | Provider children are framework render nodes.                                                          |
| `sort/useSortConfirmation.ts:1-2,32,49`                      | `Accessor` plus `@einfach/solid` `useAtomValue`; UI-core sort atoms, provider, sort-confirmation state                  | Store/provider subscription hook remains Solid-specific.                                               |
| `toolbar/LayoutFormatMenuInteraction.ts:1,34,59`             | `createEffect` and cleanup; browser DOM                                                                                 | Open-menu listener lifecycle is Solid effect ownership.                                                |
| `toolbar/types.ts:1,25`                                      | `JSX.Element`; UI-core toolbar command types                                                                            | Icon render-node contract must be per-framework.                                                       |
| `toolbar/useToolbarRuntime.ts:1-2,46-59,61,66`               | `createEffect`, `onMount`, `@einfach/solid`; UI-core toolbar atoms, provider, local command/surface controllers         | Solid provider subscriptions and mounted backend readiness.                                            |
| `toolbar/useToolbarSurfaceState.ts:1,16,32-35,63`            | `Accessor`, `createSignal`, `createEffect`; UI-core toolbar atoms, provider, toolbar option types                       | Signal-backed DOM anchors are a Solid renderer state adapter.                                          |

## Non-overlapping AD-312 follow-up leaves

The proposed leaves deliberately partition the eight DS files. They do not
move any of the 16 FS files or create a competing lifecycle abstraction before
AD-313 decides one.

1. **AD-312a — Reader and presentation contracts.** Deliver a framework-neutral
   `Reader<T>` plus CSS-properties type, then migrate exactly
   `feedback/types.ts`, `format-cells/format-cells-panel-types.ts`,
   `overlay/types.ts`, and `toolbar/ToolbarActionDeps.ts`. Completion: these
   contracts have no `solid-js` import and their Solid callers typecheck through
   an adapter alias.
2. **AD-312b — Imperative menu and sheet-tab controllers.** Move exactly
   `context-menu/context-menu-focus.ts` and `sheet-tabs/sheet-tab-controller.ts`
   to the shared interaction layer, consuming AD-312a readers. Completion:
   controller event behavior and UI-core command dispatch remain covered by
   portable DOM tests; Solid only passes callbacks/elements.
3. **AD-312c — Toolbar pure helpers.** Move exactly
   `toolbar/anchored-menu-style.ts` and `toolbar/useToolbarPainterCommands.ts`,
   consuming AD-312a `ToolbarActionDeps`. Completion: style geometry and
   single/double-click painter behavior have framework-neutral tests and no
   `solid-js` import.

## Decisions still required

1. Choose the owner package for the shared interaction layer: extending
   `@einfach/spreadsheet-ui-core` couples it to DOM types; a small new package
   keeps UI-core headless but adds package/build work.
2. Decide whether DOM controllers belong in the first React/Vue MVP from
   AD-301. If not, AD-312b can be deferred without blocking the pure contracts
   and toolbar helpers.
3. AD-313 must define ownership/disposal before attempting to share any FS
   effect-based controller; this audit recommends no speculative extraction of
   `createEffect`/`onCleanup` code.
