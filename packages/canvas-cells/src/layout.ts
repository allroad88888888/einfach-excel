import type { Rect } from '@einfach-excel/canvas'
import { createCellBorderResolver, type CellRange, type VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'
import type { CanvasCellsInput, LayoutCell, BorderSegment } from './types'

function axis(start: number, end: number, sizes: readonly number[] | undefined, fallback: number) {
  const offsets = [0]
  for (let index = start; index <= end; index++) {
    const size = sizes?.[index - start] ?? fallback
    if (!Number.isFinite(size) || size < 0) throw new Error('Cell sizes must be finite and non-negative.')
    offsets.push(offsets[offsets.length - 1] + size)
  }
  const offset = (index: number) => index < start ? (index - start) * fallback
    : index > end + 1 ? offsets[offsets.length - 1] + (index - end - 1) * fallback
      : offsets[index - start]
  const hit = (point: number) => {
    if (point < 0 || point >= offsets[offsets.length - 1]) return null
    let lo = 0, hi = offsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (offsets[mid] <= point) lo = mid
      else hi = mid - 1
    }
    return start + lo
  }
  return { offset, hit, size: offsets[offsets.length - 1] }
}
export function includes(range: CellRange, row: number, col: number) {
  return row >= range.rowStart && row <= range.rowEnd
    && col >= range.colStart && col <= range.colEnd
}
export function createLayout(input: CanvasCellsInput, options: {
  origin?: { x: number; y: number }
  rectangle?: (range: CellRange) => Rect
  projection?: VisibleProjectionResult
  scrollTop?: number
  scrollLeft?: number
} = {}) {
  const origin = options.origin ?? { x: 0, y: 0 }
  const window = input.window
  const rows = axis(window.rowStart, window.rowEnd, input.rowHeights, 28)
  const cols = axis(window.colStart, window.colEnd, input.columnWidths, 120)
  const rectangle = options.rectangle ?? ((range: CellRange): Rect => ({
    x: origin.x + cols.offset(range.colStart), y: origin.y + rows.offset(range.rowStart),
    width: cols.offset(range.colEnd + 1) - cols.offset(range.colStart),
    height: rows.offset(range.rowEnd + 1) - rows.offset(range.rowStart),
  }))
  const resolve = createCellBorderResolver({ ...input, projection: options.projection,
    scrollTop: options.scrollTop ?? 0, scrollLeft: options.scrollLeft ?? 0 })
  const anchors = input.mergeAnchors ?? input.cells.filter(cell => cell.mergedSpan)
  const merges = anchors.filter(cell => cell.mergedSpan).map(cell => ({ cell, range: {
    rowStart: cell.row, colStart: cell.col,
    rowEnd: cell.row + cell.mergedSpan!.rows - 1, colEnd: cell.col + cell.mergedSpan!.cols - 1,
  } }))
  const mergedRanges = input.mergedRanges ?? merges.map(item => item.range)
  const data = new Map(input.cells.map(cell => [`${cell.row}:${cell.col}`, cell]))
  const items: LayoutCell[] = []
  function add(range: CellRange, merged: boolean, cell = data.get(`${range.rowStart}:${range.colStart}`)) {
    const bounds = rectangle(range)
    if (bounds.width <= 0 || bounds.height <= 0
      || bounds.x >= origin.x + cols.size || bounds.y >= origin.y + rows.size
      || bounds.x + bounds.width <= origin.x || bounds.y + bounds.height <= origin.y) return
    const borders: BorderSegment[] = []
    if (!merged) {
      const resolved = resolve(range.rowStart, range.colStart, cell?.format)
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        if (side === 'top' && resolved.suppressTop || side === 'left' && resolved.suppressLeft) continue
        const border = resolved.borders[side]
        if ((side === 'top' || side === 'left') && (!border || border.style === 'none')) continue
        borders.push({ side, bounds, border })
      }
    } else {
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const horizontal = side === 'top' || side === 'bottom'
        const fixed = side === 'top' ? range.rowStart : side === 'bottom' ? range.rowEnd
          : side === 'left' ? range.colStart : range.colEnd
        const start = horizontal ? Math.max(range.colStart, window.colStart)
          : Math.max(range.rowStart, window.rowStart)
        const end = horizontal ? Math.min(range.colEnd, window.colEnd)
          : Math.min(range.rowEnd, window.rowEnd)
        for (let index = start; index <= end; index++) {
          const row = horizontal ? fixed : index, col = horizontal ? index : fixed
          const segment = rectangle({ rowStart: row, rowEnd: row, colStart: col, colEnd: col })
          if (horizontal ? segment.width <= 0 : segment.height <= 0) continue
          borders.push({ side, bounds: segment, border: resolve(row, col).borders[side] })
        }
      }
    }
    items.push({ key: `${merged ? 'm' : 'c'}:${range.rowStart}:${range.colStart}`,
      bounds, range, cell, merged, borders, signature: JSON.stringify([bounds, cell, borders]) })
  }
  for (let row = window.rowStart; row <= window.rowEnd; row++) {
    if (rows.offset(row + 1) === rows.offset(row)) continue
    for (let col = window.colStart; col <= window.colEnd; col++) {
      if (cols.offset(col + 1) === cols.offset(col)
        || mergedRanges.some(range => includes(range, row, col))) continue
      add({ rowStart: row, rowEnd: row, colStart: col, colEnd: col }, false)
    }
  }
  for (const { cell, range } of merges) add(range, true, cell)
  return {
    items, origin, width: cols.size, height: rows.size, rectangle,
    hit(x: number, y: number) {
      const row = rows.hit(y - origin.y), col = cols.hit(x - origin.x)
      if (row === null || col === null) return null
      const merged = merges.find(item => includes(item.range, row, col))
      return merged ? { row: merged.cell.row, col: merged.cell.col } : { row, col }
    },
  }
}
