# Spreadsheet grid

The Solid grid is an adapter over `@einfach/spreadsheet-ui-core`. `SpreadsheetGrid.tsx`
is the composition root: it creates one local runtime, hydrates persisted viewport
metadata through UI-core commands, and installs the focused controllers below.

## Module boundaries

- `grid-view-state.ts`, `grid-layout.ts`, and `grid-projection-controller.ts` derive
  the visible window, geometry, and sparse projection transport.
- `grid-selection.ts`, `grid-pointer-selection.ts`, `grid-fill-*`,
  `grid-editing-controller.ts`, `grid-edit-navigation.ts`, `grid-clipboard.ts`,
  `grid-format-controller.ts`, and `grid-keyboard-controller.ts` translate user
  input into UI-core commands.
- `grid-outline-state.ts`, `grid-resize-controller.ts`,
  `grid-auto-fit-controller.ts`, `grid-context-menu.ts`, and
  `grid-overlay-controller.ts` each own one visual interaction concern.
- `grid-lifecycle.ts` owns subscriptions, DOM sizing, and cleanup.
- `SpreadsheetGridView.tsx`, `SpreadsheetGridTable.tsx`,
  `SpreadsheetGridDataRow.tsx`, `SpreadsheetGridCell.tsx`,
  `SpreadsheetGridCellEditor.tsx`, and `SpreadsheetGridOutline.tsx` are the
  corresponding render-only layers.
- `axis-geometry.ts`, `cell-format.ts`, `grid-auto-fit.ts`, `scroll-anchor.ts`,
  and `grid-constants.ts` are pure helpers; `grid-runtime.ts` is the local
  controller wiring abstraction.

## Atom classification

- Source atoms: none. The grid creates no UI state authority and does not keep a
  duplicate cell, selection, viewport, or format cache.
- Derived reads: viewport metrics, sparse projection, selection, editing,
  freeze/hidden/outline, filter, presence, and spill projections are all read from
  UI-core atoms.
- Commands: pointer, keyboard, clipboard, editing, formatting, resize, outline,
  projection, and persisted viewport hydration writes are dispatched with the
  relevant UI-core command atom. The adapter never calls a direct persisted-view
  backend read.

The runtime has component-local closures only. It deliberately has no per-cell,
per-row, or per-column atom family; virtual rendering stays bounded by the visible
window and the UI-core sparse projection.

## Anchored scrolling (issue #5)

UI-core's `viewportMetricsAtom.scrollTop/scrollLeft` are **logical** offsets into
the full sheet; only this adapter knows physical DOM scroll positions. The DOM
surface spans `min(整表, 5×视口)` per axis, so the table never lays out a
multi-million-pixel span. The mapping invariant is
`anchorPx + element.scrollTop === metrics.scrollTop` (per axis):

- `scroll-anchor.ts` is the pure math: surface span, guard bands (one viewport
  each — sized to absorb the largest momentum per-frame delta), and proportional
  placement, so the thumb roughly indicates whole-sheet position.
- The rendered/projected window covers the **whole surface**, not the visible
  slice (`grid-view-state.ts`): while scrolling inside the surface the window —
  and therefore the table DOM, the projection RPCs, and `bumpRender` — stays
  untouched; scrolling is plain native compositing. The full pipeline runs only
  when the window actually changes (re-anchor, jump, resize). The selection
  overlay needs no bump either: its canvas subscribes to `viewportMetricsAtom`
  itself and repaints from live DOM rects.
- `grid-projection-controller.ts` owns the wiring. Re-anchoring runs
  synchronously inside the scroll event (deferring lets the browser clamp large
  deltas at the surface edge and lose them), updates
  `runtime.rowAnchorPx/colAnchorPx`, bumps render so the spacers move in the
  same frame, then rewrites the element offset — content never visually jumps.
  Anchors snap to row/column boundaries, so the window starts exactly at the
  surface origin and the spacers stay at zero during in-surface scrolling.
- `grid-layout.ts` positions the rendered window inside the surface: spacers are
  anchor-relative and bounded by the surface span.
- A frozen axis keeps its full span (its window stays pinned to origin), which
  zeroes the anchor math back to the legacy identity mapping — same code path.
- Guard bands deactivate at the true sheet start/end, so the scrollbar really
  reaches its extremes.

## Verification

Grid behavior is covered by `test/vnext-grid*.test.tsx`, `test/vnext-outline.test.tsx`,
and the dependent copy, spill, filter/sort, mutation-gateway, and worker UI suites.
The anchored-scroll axis math is pinned by `test/scroll-anchor.test.ts`.
