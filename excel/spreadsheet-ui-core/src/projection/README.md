# projection

Owns bounded display projection contracts for the current visible window or an
explicit user range.

Projection data is display data only. It may include display text, lightweight
format keys, formula source for visible cells, and cell-level errors. It must
not become a workbook fact store, formula cache, dependency graph, or sparse
snapshot.

## State Decision Template

- Source atoms: decided by the projection agent; expected to be one bounded
  current-window request/result atom or equivalent.
- Derived atoms: visible cell lookup and request freshness only.
  - `activeCellFactAtom` (`active-cell-fact.ts`): the active cell's facts
    from the current visible-window result. When the active cell is outside
    it, the one cell retained just before the snapshot last replaced its
    result stands in, but only for the same sheet, cell and revision: a pure
    scroll keeps the formula bar, format state and single-cell commands, and
    any revision change or view reset drops it.
  - `activeCellFormatAtom`: active cell's cell-level format, read off
    `activeCellFactAtom`; `{}` when the facts are unknown or the cell has no
    format overrides. Every "open Format Cells for the active selection" entry
    point must seed its dialog draft from this atom — an unseeded draft
    defaults to `'general'` and a no-op save wipes the real format.
- Commands: create/validate projection requests and call backend ports.
- Scale bound: current window plus the one retained active cell.
- Backend reads: visible-window display projection only.
- Per-cell/per-row/per-col atom risk: no offscreen cell cache or workbook snapshot
  beyond the single retained active cell.
- Tests: `test/projection*.test.ts`.
