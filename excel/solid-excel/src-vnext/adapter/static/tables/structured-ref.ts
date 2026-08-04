// 一句话：结构化引用（Table[...]）到单元格区域的解析。

import type {
  EvalOrigin,
  StructuredRefResolution,
  StructuredRefResolver,
} from '../../static-formula-eval'
import type { StaticBackendState, StaticTableEntry } from '../state'

// === Excel Table registry (design-excel-table.md §4-§5, parity #32) =========
//
// The static backend is an in-memory reference engine, so it owns the Table
// registry directly (workbook-level, name-unique, structural-follow) and
// resolves structured references at eval time. Cross-layer parity with the
// engine `TableEntry` / `TableError` keeps the two backends interchangeable
// behind the same UI-core command + capability contract.
//
// Structured-reference SUPPORT LEVEL (honest boundary — no faked values):
//   - Resolved (as function args, e.g. `=SUM(Table1[Q1])`): `Table1[Col]`,
//     `Table1[[ColA]:[ColB]]`, `Table1[#All|#Data|#Headers|#Totals]`,
//     `Table1[#This Row]`, `Table1[@Col]`, `Table1[@]`, and the table-less
//     `[Col]` / `[@Col]` / `[@]` forms written inside the Table's own cells
//     (the containing Table is resolved from the anchoring cell).
//   - Resolved in VALUE context too when the reference is 1×1 — so
//     `=[@Price]*[@Qty]` works. A wider range in value context needs spill,
//     which the static engine does not model → `#ERROR!`.
//   - Unknown table → `#NAME?`; unknown column / missing header-or-totals band
//     / empty data region → `#REF!`; a this-row form whose anchor sits outside
//     the data body, or a table-less form outside any Table → `#VALUE!`.
//   - A bare `Table1` (no brackets) is NOT a structured reference in either
//     engine: both formula parsers read an A1-shaped token as a cell reference
//     even past `XFD`, so it evaluates as an empty off-grid cell (`=SUM(Table1)`
//     → 0). Pinned against WASM in
//     vnext-table-totals-static-wasm-parity.test.ts.
//   - NOT supported (fall to `#ERROR!`, never a faked value): combined
//     qualifiers `[[#Data],[Col]]` (the engine grammar defers them too) and
//     cross-sheet Table refs (the static evaluator reads a single sheet).
//     See TODO(einfach-static-structured-refs).
//
//     TODO(einfach-static-unsupported-ref-axis): both hosts refuse these forms,
//     but on different axes — the engine's parser rejects them at WRITE time
//     (`setCellInput` throws "formula could not be parsed or installed"),
//     while this backend accepts the write and reports `#ERROR!` at EVAL time.
//     Neither invents a value, so no wrong number can reach a user; aligning
//     them means adding a write-path rejection here, which changes the mutation
//     contract (callers must handle a thrown/rejected input) rather than the
//     evaluator, so it is deliberately deferred. Both behaviours are pinned by
//     the "unsupported structured-reference forms" test in
//     vnext-table-totals-static-wasm-parity.test.ts, so the boundary cannot
//     drift silently. Combined qualifiers should stay deferred on BOTH sides
//     until the engine grammar grows them (keeping one host ahead of the other
//     is what creates dialects).

/** Horizontal band of a structured reference — mirrors the engine `TableArea`. */
type StructuredArea = 'all' | 'data' | 'headers' | 'totals' | 'thisRow'

/**
 * Parsed `Table[inner]` body: which band, and which column span (`null` = the
 * Table's whole width). Shaped as the engine's `(area, columns)` pair so the
 * resolution order below can be compared line-for-line with `resolve_table_ref`.
 */
interface StructuredInnerSpec {
  readonly area: StructuredArea
  readonly columns: { readonly from: string; readonly to: string } | null
}

/** Column span covering a single name. */
function oneColumn(name: string): StructuredInnerSpec['columns'] {
  return { from: name, to: name }
}

/** Parse the inner text of a `Table[inner]` reference, or `null` when unsupported. */
function parseStructuredInner(inner: string): StructuredInnerSpec | null {
  const trimmed = inner.trim()
  // Empty `[]` is deferred by the engine grammar too (design §3.2).
  if (trimmed === '') return null
  if (trimmed.startsWith('#')) {
    switch (trimmed.toUpperCase().replace(/\s+/g, ' ')) {
      case '#ALL':
        return { area: 'all', columns: null }
      case '#DATA':
        return { area: 'data', columns: null }
      case '#HEADERS':
        return { area: 'headers', columns: null }
      case '#TOTALS':
        return { area: 'totals', columns: null }
      case '#THIS ROW':
        return { area: 'thisRow', columns: null }
      default:
        return null
    }
  }
  // `[@]` (whole current row), `[@Col]`, `[@[Col]]`.
  if (trimmed.startsWith('@')) {
    const rest = trimmed.slice(1).trim()
    if (rest === '') return { area: 'thisRow', columns: null }
    const bracketed = /^\[([^[\]]*)\]$/.exec(rest)
    if (bracketed) {
      const col = bracketed[1].trim()
      return col === '' ? null : { area: 'thisRow', columns: oneColumn(col) }
    }
    if (rest.includes('[') || rest.includes(']') || rest.includes(',')) return null
    return { area: 'thisRow', columns: oneColumn(rest) }
  }
  // Combined qualifiers (`[[#Data],[Col]]`) are deferred by the engine
  // grammar as well (design §3.2) — kept unsupported so both engines agree.
  if (trimmed.includes(',')) return null
  if (trimmed.includes('[')) {
    const multi = /^\[([^[\]]*)\]\s*:\s*\[([^[\]]*)\]$/.exec(trimmed)
    if (multi) {
      return { area: 'data', columns: { from: multi[1].trim(), to: multi[2].trim() } }
    }
    const single = /^\[([^[\]]*)\]$/.exec(trimmed)
    if (single) {
      const col = single[1].trim()
      return col === '' ? null : { area: 'data', columns: oneColumn(col) }
    }
    return null
  }
  // Bare, unqualified column: the whole DATA column (engine parity — the
  // engine's `parse_bare_colref` yields `TableArea::Data`, not this-row).
  return { area: 'data', columns: oneColumn(trimmed) }
}

/**
 * The Table anchored to `sheetId` whose range contains `origin` — how a
 * table-less `[Col]` / `[@Col]` finds its Table (engine
 * `lookup_table_containing`).
 */
function tableContaining(
  state: StaticBackendState,
  sheetId: string,
  origin: EvalOrigin,
): StaticTableEntry | undefined {
  for (const entry of state.tablesByKey.values()) {
    if (entry.sheetId !== sheetId) continue
    const { range } = entry
    if (
      origin.row >= range.rowStart &&
      origin.row <= range.rowEnd &&
      origin.col >= range.colStart &&
      origin.col <= range.colEnd
    ) {
      return entry
    }
  }
  return undefined
}

function resolveStructuredRefForTable(
  state: StaticBackendState,
  sheetId: string,
  tableName: string | null,
  inner: string,
  origin: EvalOrigin | null,
): StructuredRefResolution {
  const refError = (code: string): StructuredRefResolution => ({ kind: 'error', code })

  let entry: StaticTableEntry | undefined
  if (tableName) {
    entry = state.tablesByKey.get(tableName.toUpperCase())
    // Unknown NAMED table → `#NAME?` (engine `InvalidName`).
    if (!entry) return refError('#NAME?')
    // The static evaluator reads a single sheet, so a cross-sheet Table ref is
    // an honest "not supported here" (→ `#ERROR!`), not a wrong value.
    // TODO(einfach-static-structured-refs): needs a multi-sheet cell lookup.
    if (entry.sheetId !== sheetId) return null
  } else {
    // Table-less `[Col]` / `[@Col]`: resolve from the anchoring cell. Outside
    // any Table (or with no anchor at all) → `#VALUE!`, engine parity.
    if (!origin) return refError('#VALUE!')
    entry = tableContaining(state, sheetId, origin)
    if (!entry) return refError('#VALUE!')
  }

  const spec = parseStructuredInner(inner)
  if (!spec) return null

  const { range } = entry
  const dataStart = range.rowStart + (entry.hasHeaders ? 1 : 0)
  const dataEnd = range.rowEnd - (entry.hasTotals ? 1 : 0)

  // Rows first, then columns — the engine's order, so the surfaced error code
  // matches when a reference is bad on both axes at once.
  let rowStart: number
  let rowEnd: number
  switch (spec.area) {
    case 'all':
      rowStart = range.rowStart
      rowEnd = range.rowEnd
      break
    case 'headers':
      if (!entry.hasHeaders) return refError('#REF!')
      rowStart = range.rowStart
      rowEnd = range.rowStart
      break
    case 'totals':
      if (!entry.hasTotals) return refError('#REF!')
      rowStart = range.rowEnd
      rowEnd = range.rowEnd
      break
    case 'data':
      // Zero data rows → `#REF!` (design §4.1 known divergence from Excel's
      // "keep one empty data row").
      if (dataEnd < dataStart) return refError('#REF!')
      rowStart = dataStart
      rowEnd = dataEnd
      break
    case 'thisRow': {
      if (!origin || dataEnd < dataStart || origin.row < dataStart || origin.row > dataEnd) {
        // Current row outside the data body → `#VALUE!` (design §5.3 point 2).
        return refError('#VALUE!')
      }
      rowStart = origin.row
      rowEnd = origin.row
      break
    }
  }

  if (!spec.columns) {
    return {
      kind: 'range',
      ref: { rowStart, rowEnd, colStart: range.colStart, colEnd: range.colEnd },
    }
  }
  const fromIdx = entry.columns.findIndex(
    (c) => c.toLowerCase() === spec.columns!.from.toLowerCase(),
  )
  const toIdx = entry.columns.findIndex((c) => c.toLowerCase() === spec.columns!.to.toLowerCase())
  if (fromIdx < 0 || toIdx < 0) return refError('#REF!')
  return {
    kind: 'range',
    ref: {
      rowStart,
      rowEnd,
      colStart: range.colStart + Math.min(fromIdx, toIdx),
      colEnd: range.colStart + Math.max(fromIdx, toIdx),
    },
  }
}

export function makeStructuredRefResolver(
  state: StaticBackendState,
  sheetId: string,
): StructuredRefResolver {
  return (tableName, inner, origin) =>
    resolveStructuredRefForTable(state, sheetId, tableName, inner, origin)
}
