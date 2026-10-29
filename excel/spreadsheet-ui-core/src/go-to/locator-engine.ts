import type {
  GoToCandidateCell,
  GoToLocator,
  GoToScanContext,
  GoToScanResult,
  GoToValueKindFilter,
} from './types'
import { GO_TO_SCAN_MAX_CELLS } from './types'
import { keyOf, packMatches, toCellSelection } from './match-packing'
import { scanCurrentRegion } from './region-scan'

/**
 * Apply a locator predicate over the host-supplied projection slice and
 * pack the matches into selection regions.
 *
 * **Sparse-projection contract.** `context.cells` mirrors the host's sparse
 * projection — blank cells are NOT included. The engine treats every coord
 * inside `context.searchRect` that is missing from `cells` as blank.
 *
 * **Coalescing.** Matching coords are coalesced row-by-row into rectangles
 * (a run of contiguous matched cols on the same row collapses to one
 * `RangeSelection`). After coalescing, if more than `GO_TO_REGION_CAP`
 * regions remain we truncate and set `truncated: true` so the dialog can
 * surface a warning. The renderer pays O(regions × viewport-cells) per paint
 * so the cap protects against degenerate inputs (e.g. checkerboard blanks).
 *
 * `precedents` / `dependents` short-circuit to an empty result — those
 * radios are disabled in the dialog but we accept the kinds defensively so
 * the union stays exhaustive.
 */
export function runGoToSpecialScan(locator: GoToLocator, context: GoToScanContext): GoToScanResult {
  if (locator.kind === 'precedents' || locator.kind === 'dependents') {
    return { regions: [], truncated: false, totalMatchCount: 0 }
  }

  if (locator.kind === 'last-cell') {
    return scanLastCell(context)
  }

  if (locator.kind === 'current-region') {
    return scanCurrentRegion(context)
  }

  if (locator.kind === 'blanks') {
    return scanBlanks(context)
  }

  if (locator.kind === 'visible-cells-only') {
    return scanVisibleCellsOnly(context)
  }

  if (locator.kind === 'row-differences' || locator.kind === 'column-differences') {
    return scanDifferences(locator.kind, context)
  }

  // Predicate-driven locators that walk the (sparse) cell list directly.
  const matches: { row: number; col: number }[] = []
  for (const cell of context.cells) {
    let matched = false
    switch (locator.kind) {
      case 'formulas':
        matched = cell.formula != null && matchValueKindFilter(cell, locator.valueKind)
        break
      case 'constants':
        matched =
          cell.formula == null &&
          cell.valueKind !== undefined &&
          cell.valueKind !== 'blank' &&
          matchValueKindFilter(cell, locator.valueKind)
        break
      case 'comments':
        matched = Boolean(cell.commentThreadId)
        break
      case 'conditional-format':
        matched = cell.conditionalFormat != null
        break
      case 'data-validation':
        matched = cell.validation != null
        break
      default:
        matched = false
    }
    if (matched) matches.push({ row: cell.row, col: cell.col })
  }

  return packMatches(context.sheetId, matches)
}

function matchValueKindFilter(cell: GoToCandidateCell, filter: GoToValueKindFilter): boolean {
  if (filter === null) return true
  const kind = cell.valueKind
  if (!kind) return false
  switch (filter) {
    case 'number':
      return kind === 'number'
    case 'text':
      return kind === 'string'
    case 'logical':
      return kind === 'boolean'
    case 'error':
      return kind === 'error'
  }
}

function cellsDiffer(a: GoToCandidateCell | null, b: GoToCandidateCell | null): boolean {
  // Both blank (no record present) → equal.
  if (a == null && b == null) return false
  if (a == null || b == null) return true
  if ((a.displayValue ?? '') !== (b.displayValue ?? '')) return true
  if ((a.formula ?? null) !== (b.formula ?? null)) return true
  return false
}

/**
 * Blanks: walk the search rect, emit every coord NOT in the projection's
 * occupied set. Coalesce horizontally into rectangles.
 */
function scanBlanks(context: GoToScanContext): GoToScanResult {
  const rect = context.searchRect
  if (!rect) {
    // No rect = nothing to scan. Host must supply one for the blanks locator.
    return { regions: [], truncated: false, totalMatchCount: 0 }
  }
  const occupied = new Set<string>()
  for (const cell of context.cells) {
    // A coord is "occupied" iff it is in the rect and has a non-blank value
    // (or a formula). Cells with `valueKind === 'blank'` in the projection
    // count as blank even when emitted (some adapters emit them); same with
    // an empty displayValue and no formula.
    const isBlank =
      (cell.valueKind ?? 'blank') === 'blank' &&
      (cell.displayValue ?? '') === '' &&
      cell.formula == null
    if (isBlank) continue
    if (cell.row < rect.rowStart || cell.row > rect.rowEnd) continue
    if (cell.col < rect.colStart || cell.col > rect.colEnd) continue
    occupied.add(keyOf(cell.row, cell.col))
  }

  const matches: { row: number; col: number }[] = []
  for (let r = rect.rowStart; r <= rect.rowEnd; r += 1) {
    for (let c = rect.colStart; c <= rect.colEnd; c += 1) {
      if (!occupied.has(keyOf(r, c))) {
        matches.push({ row: r, col: c })
      }
    }
  }
  return packMatches(context.sheetId, matches)
}

/**
 * Visible-cells-only: walk the search rect, emit every coord whose row is
 * not in `hiddenRows` and whose col is not in `hiddenCols`. Includes blanks
 * — Excel selects ALL visible cells in the source range, hidden ones drop
 * out. Visibility is a property of the hidden ROW/COLUMN state alone: the
 * old impl inferred it per cell from a source-row echo in the payload,
 * which was unreliable, and this version reads the backend's hidden-state
 * ports directly. Never reintroduce a payload-driven heuristic here.
 */
function scanVisibleCellsOnly(context: GoToScanContext): GoToScanResult {
  const rect = context.searchRect
  if (!rect) {
    return { regions: [], truncated: false, totalMatchCount: 0 }
  }
  const hiddenRows = new Set(context.hiddenRows ?? [])
  const hiddenCols = new Set(context.hiddenCols ?? [])
  const matches: { row: number; col: number }[] = []
  for (let r = rect.rowStart; r <= rect.rowEnd; r += 1) {
    if (hiddenRows.has(r)) continue
    for (let c = rect.colStart; c <= rect.colEnd; c += 1) {
      if (hiddenCols.has(c)) continue
      matches.push({ row: r, col: c })
    }
  }
  return packMatches(context.sheetId, matches)
}

/**
 * Row/column differences. Scope is the *current selection* rect
 * (`context.selectionRect`), not the used range. For each row (resp. col)
 * in the rect, we compare every cell against the active-column (resp.
 * active-row) cell on the same row (resp. col). Differing cells match.
 *
 * Blank vs blank counts as equal; blank vs non-blank counts as different.
 */
function scanDifferences(
  kind: 'row-differences' | 'column-differences',
  context: GoToScanContext,
): GoToScanResult {
  const rect = context.selectionRect ?? context.searchRect
  if (!rect) {
    return { regions: [], truncated: false, totalMatchCount: 0 }
  }
  // Build a lookup of the projection within the rect for O(1) cell access.
  const lookup = new Map<string, GoToCandidateCell>()
  for (const cell of context.cells) {
    if (cell.row < rect.rowStart || cell.row > rect.rowEnd) continue
    if (cell.col < rect.colStart || cell.col > rect.colEnd) continue
    lookup.set(keyOf(cell.row, cell.col), cell)
  }
  const matches: { row: number; col: number }[] = []
  if (kind === 'row-differences') {
    const anchorCol = context.activeCell.col
    if (anchorCol < rect.colStart || anchorCol > rect.colEnd) {
      // Active cell sits outside the rect — Excel falls back to colStart.
      // We follow suit so the comparison always has a well-defined column.
    }
    const compareCol =
      anchorCol >= rect.colStart && anchorCol <= rect.colEnd ? anchorCol : rect.colStart
    for (let r = rect.rowStart; r <= rect.rowEnd; r += 1) {
      const anchor = lookup.get(keyOf(r, compareCol)) ?? null
      for (let c = rect.colStart; c <= rect.colEnd; c += 1) {
        if (c === compareCol) continue
        const cell = lookup.get(keyOf(r, c)) ?? null
        if (cellsDiffer(cell, anchor)) {
          matches.push({ row: r, col: c })
        }
      }
    }
  } else {
    const anchorRow = context.activeCell.row
    const compareRow =
      anchorRow >= rect.rowStart && anchorRow <= rect.rowEnd ? anchorRow : rect.rowStart
    for (let c = rect.colStart; c <= rect.colEnd; c += 1) {
      const anchor = lookup.get(keyOf(compareRow, c)) ?? null
      for (let r = rect.rowStart; r <= rect.rowEnd; r += 1) {
        if (r === compareRow) continue
        const cell = lookup.get(keyOf(r, c)) ?? null
        if (cellsDiffer(cell, anchor)) {
          matches.push({ row: r, col: c })
        }
      }
    }
  }
  return packMatches(context.sheetId, matches)
}

function scanLastCell(context: GoToScanContext): GoToScanResult {
  let maxRow = -1
  let maxCol = -1
  for (const cell of context.cells) {
    const hasValue =
      (cell.valueKind ?? 'blank') !== 'blank' ||
      (cell.displayValue ?? '') !== '' ||
      cell.formula != null
    if (!hasValue) continue
    if (cell.row > maxRow) maxRow = cell.row
    if (cell.col > maxCol) maxCol = cell.col
  }
  if (maxRow < 0 || maxCol < 0) {
    return { regions: [], truncated: false, totalMatchCount: 0 }
  }
  return {
    regions: [toCellSelection(context.sheetId, maxRow, maxCol)],
    truncated: false,
    totalMatchCount: 1,
  }
}

// Suppress unused-import warning — GO_TO_SCAN_MAX_CELLS is referenced in
// docs and re-exported via types; keep the import for readers who follow
// the engine→types link.
void GO_TO_SCAN_MAX_CELLS
