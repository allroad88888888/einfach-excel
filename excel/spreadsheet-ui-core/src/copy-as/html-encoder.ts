import type { CellCoord } from '../shared'
import type { DisplayCell } from '../contracts/types'
import type { CopyAsInput, CopyAsRect } from './types'
import { copyAsVisibleRows, normalizeCopyAsHiddenRows } from './visible-rows'

import { escapeHtmlAttr } from './html-sanitize'
import { buildCellStyle } from './html-cell-style'
import { buildCellContent, hasRichText } from './html-cell-text'

interface CellIndex {
  byKey: Map<string, DisplayCell>
}

function makeKey(row: number, col: number): string {
  return `${row},${col}`
}

function indexCells(cells: ReadonlyArray<DisplayCell>): CellIndex {
  const byKey = new Map<string, DisplayCell>()
  for (const cell of cells) {
    byKey.set(makeKey(cell.row, cell.col), cell)
  }
  return { byKey }
}

/**
 * Describe how to emit one merge inside the selection rectangle.
 *
 * - `anchorRow` / `anchorCol`: where the `<td rowspan colspan>` is drawn.
 *   For merges whose true anchor is outside the rect, we manufacture a
 *   synthetic anchor at the top-left of the intersection between the merge
 *   and the rect, so the table stays grid-aligned and never leaks cells
 *   outside the selection.
 * - `rows` / `cols`: span clipped to the rect intersection. Always >= 1.
 * - `sourceCell`: the actual anchor `DisplayCell` carrying content/format.
 *   May be `undefined` if the true anchor is outside the rect *and* is not
 *   included in the cells array — in that case the clipped anchor renders
 *   blank, which is the desired behaviour (don't leak content from outside
 *   the selection).
 */
interface ClippedMerge {
  anchorRow: number
  anchorCol: number
  rows: number
  cols: number
  sourceCell: DisplayCell | undefined
}

/**
 * Compute the per-merge clipping plan and the set of covered (non-anchor)
 * cells to skip during iteration. Inputs:
 *
 * - `cells`: the projection slice. Anchors carry `mergedSpan`; covered cells
 *   carry `mergeAnchor` pointing back to their anchor.
 * - `rect`: the selection rectangle we will iterate.
 *
 * We surface two pieces of state:
 *
 * 1. `coveredKeys` — every `(row, col)` inside the rect that is part of any
 *    merge AND is not the rect-local anchor for that merge. Iteration skips
 *    these so the table emits a single `<td>` per merge.
 * 2. `mergesByAnchorKey` — keyed by `"row,col"` of the rect-local anchor
 *    cell, the clipped `ClippedMerge` to emit there.
 *
 * `hiddenRows` (filter-hidden rows, §8.2) participates in the clipping the
 * same way the rect bounds do: a hidden row emits no `<tr>`, so counting it
 * in a `rowspan` would make the anchor claim more rows than the table has
 * and produce a structurally broken table. The clipped row count is
 * therefore the number of VISIBLE rows in the intersection, and the
 * rect-local anchor is the FIRST visible row of it. A merge whose entire
 * in-rect slice is hidden drops out completely.
 */
function planMerges(
  cells: ReadonlyArray<DisplayCell>,
  rect: CopyAsRect,
  hiddenRows: ReadonlySet<number>,
): { coveredKeys: Set<string>; mergesByAnchorKey: Map<string, ClippedMerge> } {
  const coveredKeys = new Set<string>()
  const mergesByAnchorKey = new Map<string, ClippedMerge>()

  // First pass: collect every merge by its true anchor. Anchors that carry
  // `mergedSpan` give us span dimensions directly. Covered cells that arrive
  // with `mergeAnchor` but without the anchor cell in the projection still
  // need a placeholder so we can clip; we resolve that in a second pass.
  type AnchorEntry = {
    row: number
    col: number
    rows: number
    cols: number
    cell: DisplayCell | undefined
  }
  const anchorByKey = new Map<string, AnchorEntry>()

  for (const cell of cells) {
    const span = cell.mergedSpan
    if (!span) continue
    const rows = Math.max(1, span.rows)
    const cols = Math.max(1, span.cols)
    anchorByKey.set(makeKey(cell.row, cell.col), {
      row: cell.row,
      col: cell.col,
      rows,
      cols,
      cell,
    })
  }

  // Now walk covered cells. If the anchor cell didn't ship with the
  // projection (true anchor outside the selection rectangle), we don't know
  // the merge's full extent — but we know enough: every covered cell that
  // points back to the anchor must live inside the merge. We grow a synthetic
  // entry whose bottom-right is the max row/col of any covered cell that
  // points to it. That's sufficient for clipping against the rect, because
  // we only emit cells that fall inside both the merge and the rect, and any
  // additional merge cells outside the rect can't appear in the output
  // anyway.
  for (const cell of cells) {
    const anchor: CellCoord | undefined = cell.mergeAnchor
    if (!anchor) continue
    const key = makeKey(anchor.row, anchor.col)
    const existing = anchorByKey.get(key)
    if (!existing) {
      anchorByKey.set(key, {
        row: anchor.row,
        col: anchor.col,
        // Inclusive span from anchor to this covered cell — at minimum.
        rows: Math.max(1, cell.row - anchor.row + 1),
        cols: Math.max(1, cell.col - anchor.col + 1),
        cell: undefined,
      })
    } else if (existing.cell === undefined) {
      // Synthetic entry — grow it to include this covered cell.
      const trueRowEnd = Math.max(existing.row + existing.rows - 1, cell.row)
      const trueColEnd = Math.max(existing.col + existing.cols - 1, cell.col)
      existing.rows = trueRowEnd - existing.row + 1
      existing.cols = trueColEnd - existing.col + 1
    }
    // If the anchor is in the projection (existing.cell !== undefined),
    // we trust its `mergedSpan` and don't grow.
  }

  // Second pass: for each anchor, compute clipped span + rect-local anchor.
  for (const entry of anchorByKey.values()) {
    const trueRowEnd = entry.row + entry.rows - 1
    const trueColEnd = entry.col + entry.cols - 1

    // Intersection with the rect (inclusive on both ends).
    const ixRowStart = Math.max(entry.row, rect.startRow)
    const ixRowEnd = Math.min(trueRowEnd, rect.endRow)
    const ixColStart = Math.max(entry.col, rect.startCol)
    const ixColEnd = Math.min(trueColEnd, rect.endCol)
    if (ixRowEnd < ixRowStart || ixColEnd < ixColStart) continue

    // Hidden rows emit no `<tr>`, so they must not be counted in `rowspan`
    // and must not host the anchor. Both reduce to the visible-row list of
    // the intersection; an empty list means the merge is entirely hidden.
    let visibleRowCount = 0
    let firstVisibleRow = -1
    for (let r = ixRowStart; r <= ixRowEnd; r += 1) {
      if (hiddenRows.has(r)) continue
      if (firstVisibleRow === -1) firstVisibleRow = r
      visibleRowCount += 1
    }
    if (visibleRowCount === 0) continue

    const clippedRows = visibleRowCount
    const clippedCols = ixColEnd - ixColStart + 1
    const anchorRow = firstVisibleRow
    const anchorCol = ixColStart

    // Every in-rect cell of the merge that isn't the clipped anchor must
    // be skipped during iteration.
    for (let r = ixRowStart; r <= ixRowEnd; r += 1) {
      for (let c = ixColStart; c <= ixColEnd; c += 1) {
        if (r === anchorRow && c === anchorCol) continue
        coveredKeys.add(makeKey(r, c))
      }
    }

    mergesByAnchorKey.set(makeKey(anchorRow, anchorCol), {
      anchorRow,
      anchorCol,
      rows: clippedRows,
      cols: clippedCols,
      sourceCell: entry.cell,
    })
  }

  return { coveredKeys, mergesByAnchorKey }
}

export function encodeSelectionAsHtml(input: CopyAsInput): string {
  const { rect, cells } = input
  const index = indexCells(cells)
  const hiddenRows = normalizeCopyAsHiddenRows(input.hiddenRows)
  const { coveredKeys, mergesByAnchorKey } = planMerges(cells, rect, hiddenRows)

  const parts: string[] = []
  parts.push('<table style="border-collapse: collapse; border: 1px solid #ccc">')

  // Optional <colgroup> for column widths.
  const colCount = rect.endCol - rect.startCol + 1
  if (input.columnWidths && input.columnWidths.size > 0) {
    parts.push('<colgroup>')
    for (let i = 0; i < colCount; i += 1) {
      const colIdx = rect.startCol + i
      const w = input.columnWidths.get(colIdx)
      if (typeof w === 'number' && isFinite(w) && w > 0) {
        parts.push(`<col style="width: ${w}px">`)
      } else {
        parts.push('<col>')
      }
    }
    parts.push('</colgroup>')
  }

  // Filter-hidden rows emit no `<tr>` at all (§8.2). `planMerges` above was
  // given the same set so no surviving `rowspan` can reference them.
  for (const row of copyAsVisibleRows(rect, hiddenRows)) {
    const rowHeight = input.rowHeights?.get(row)
    const trStyle =
      typeof rowHeight === 'number' && isFinite(rowHeight) && rowHeight > 0
        ? ` style="height: ${rowHeight}px"`
        : ''
    parts.push(`<tr${trStyle}>`)
    for (let col = rect.startCol; col <= rect.endCol; col += 1) {
      const key = makeKey(row, col)
      if (coveredKeys.has(key)) {
        continue
      }
      const merge = mergesByAnchorKey.get(key)
      // Prefer the merge's source cell (true anchor's content/format); fall
      // back to whatever cell happens to live at this rect-local position.
      const cellAtKey = index.byKey.get(key)
      const cell = merge?.sourceCell ?? cellAtKey

      const attrs: string[] = []
      const cellStyle: string[] = ['border: 1px solid #ccc', 'padding: 2px 4px']
      const inlineStyle = cell ? buildCellStyle(cell, hasRichText(cell)) : ''
      if (inlineStyle) cellStyle.push(inlineStyle)

      if (merge) {
        if (merge.rows > 1) attrs.push(`rowspan="${merge.rows}"`)
        if (merge.cols > 1) attrs.push(`colspan="${merge.cols}"`)
      }

      // `style` payload is built from the whitelisted values above; we
      // attribute-escape as defence-in-depth so a future bug can't break
      // out of the `"`-quoted attribute.
      attrs.push(`style="${escapeHtmlAttr(cellStyle.join('; '))}"`)
      // Only render content when the cell is the true merge anchor (or no
      // merge applies). Synthetic clipped anchors with no source cell stay
      // blank so we don't leak content from outside the selection.
      const renderContent = merge ? merge.sourceCell !== undefined : true
      const content = renderContent ? buildCellContent(cell) : ''
      parts.push(`<td ${attrs.join(' ')}>${content}</td>`)
    }
    parts.push('</tr>')
  }

  parts.push('</table>')
  return parts.join('')
}
