import { describe, expect, test } from 'vitest'
import {
  anchorForContentRect, draggedDrawingRect, drawingContentRect, MAX_DRAWING_SIZE_PX,
  MIN_DRAWING_SIZE_PX, type DrawingAnchor, type DrawingRect,
} from '../../src'
import type { ViewportMetrics } from '../../src/viewport/types'

const metrics: ViewportMetrics = { sheetId: 's', scrollTop: 0, scrollLeft: 0, viewportHeight: 400,
  viewportWidth: 800, rowHeight: 20, colWidth: 100, rowCount: 100, colCount: 20, overscanRows: 2,
  overscanCols: 2 }
const plain = { rowHeightsBySheet: {}, colWidthsBySheet: {} }
const anchor: DrawingAnchor = { row: 2, col: 3, offsetX: 5, offsetY: 7, width: 200, height: 100 }

describe('drawingContentRect', () => {
  test('puts the top-left at the anchor cell plus the in-cell offset', () => {
    expect(drawingContentRect(anchor, metrics, plain))
      .toEqual({ left: 305, top: 47, width: 200, height: 100 })
  })

  test('uses the sparse row heights and column widths of the active sheet', () => {
    const sizes = { rowHeightsBySheet: { s: { 1: 50 } }, colWidthsBySheet: { s: { 1: 30 } } }
    // row 1 is 50px tall, col 1 is 30px wide
    expect(drawingContentRect(anchor, metrics, sizes))
      .toEqual({ left: 100 + 30 + 100 + 5, top: 20 + 50 + 7, width: 200, height: 100 })
  })

  test('ignores overrides that belong to another sheet', () => {
    const sizes = { rowHeightsBySheet: { t: { 1: 50 } }, colWidthsBySheet: { t: { 1: 30 } } }
    expect(drawingContentRect(anchor, metrics, sizes)).toMatchObject({ left: 305, top: 47 })
  })

  test('hidden (zero-size) columns and rows take no space', () => {
    const sizes = { rowHeightsBySheet: { s: { 0: 0 } }, colWidthsBySheet: { s: { 2: 0 } } }
    expect(drawingContentRect(anchor, metrics, sizes)).toMatchObject({ left: 205, top: 27 })
  })
})

describe('anchorForContentRect', () => {
  test('round-trips a content rect back to the same anchor', () => {
    const rect = drawingContentRect(anchor, metrics, plain)
    expect(anchorForContentRect(rect, metrics, plain)).toEqual(anchor)
  })

  test('crosses rows and columns with sparse sizes and keeps the in-cell remainder', () => {
    const sizes = { rowHeightsBySheet: { s: { 1: 50 } }, colWidthsBySheet: { s: { 1: 30 } } }
    const rect = drawingContentRect(anchor, metrics, sizes)
    expect(anchorForContentRect(rect, metrics, sizes)).toEqual(anchor)
    // 135 is inside col 2 (130..230) at offset 5; 95 is inside row 3 (90..110) at offset 5.
    expect(anchorForContentRect({ left: 135, top: 95, width: 40, height: 40 }, metrics, sizes))
      .toMatchObject({ col: 2, row: 3, offsetX: 5, offsetY: 5 })
  })

  test('a point exactly on a cell boundary belongs to the next cell', () => {
    expect(anchorForContentRect({ left: 200, top: 40, width: 50, height: 50 }, metrics, plain))
      .toMatchObject({ col: 2, row: 2, offsetX: 0, offsetY: 0 })
  })

  test('a hidden column is skipped when the rect starts at its position', () => {
    const sizes = { rowHeightsBySheet: {}, colWidthsBySheet: { s: { 2: 0 } } }
    expect(anchorForContentRect({ left: 200, top: 0, width: 50, height: 50 }, metrics, sizes))
      .toMatchObject({ col: 3, offsetX: 0 })
  })

  test('negative positions clamp to the sheet origin', () => {
    expect(anchorForContentRect({ left: -30, top: -5, width: 50, height: 50 }, metrics, plain))
      .toMatchObject({ row: 0, col: 0, offsetX: 0, offsetY: 0 })
  })

  test('positions past the last row land in the last row with a bounded offset', () => {
    const result = anchorForContentRect(
      { left: 0, top: 5000, width: 50, height: 50 }, metrics, plain)
    expect(result).toMatchObject({ row: 99, offsetY: 5000 - 99 * 20 })
    const far = anchorForContentRect({ left: 0, top: 50_000, width: 50, height: 50 }, metrics,
      plain)
    expect(far.offsetY).toBe(MAX_DRAWING_SIZE_PX)
  })

  test('sizes are rounded and clamped to the allowed range', () => {
    const small = anchorForContentRect({ left: 0, top: 0, width: 3, height: 15.4 }, metrics, plain)
    expect([small.width, small.height]).toEqual([MIN_DRAWING_SIZE_PX, MIN_DRAWING_SIZE_PX])
    const big = anchorForContentRect({ left: 0, top: 0, width: 99_999, height: 20.6 }, metrics,
      plain)
    expect([big.width, big.height]).toEqual([MAX_DRAWING_SIZE_PX, 21])
  })
})

describe('draggedDrawingRect', () => {
  const start: DrawingRect = { left: 100, top: 60, width: 200, height: 100 }

  test('move shifts the rect without changing its size and never goes negative', () => {
    expect(draggedDrawingRect(start, 'move', 30, -10)).toEqual({ ...start, left: 130, top: 50 })
    expect(draggedDrawingRect(start, 'move', -500, -500)).toEqual({ ...start, left: 0, top: 0 })
  })

  test('east and south handles grow the far edges and keep the origin fixed', () => {
    expect(draggedDrawingRect(start, 'e', 40, 99)).toEqual({ ...start, width: 240 })
    expect(draggedDrawingRect(start, 's', 99, 25)).toEqual({ ...start, height: 125 })
    expect(draggedDrawingRect(start, 'se', 40, 25))
      .toEqual({ left: 100, top: 60, width: 240, height: 125 })
  })

  test('west and north handles keep the opposite edge fixed', () => {
    expect(draggedDrawingRect(start, 'w', -50, 0)).toEqual({ ...start, left: 50, width: 250 })
    expect(draggedDrawingRect(start, 'w', 50, 0)).toEqual({ ...start, left: 150, width: 150 })
    expect(draggedDrawingRect(start, 'n', 0, -20)).toEqual({ ...start, top: 40, height: 120 })
    expect(draggedDrawingRect(start, 'nw', 10, 10))
      .toEqual({ left: 110, top: 70, width: 190, height: 90 })
  })

  test('the minimum size stops a shrinking rect from flipping over the fixed edge', () => {
    expect(draggedDrawingRect(start, 'e', -999, 0)).toEqual({ ...start, width: MIN_DRAWING_SIZE_PX })
    expect(draggedDrawingRect(start, 's', 0, -999)).toEqual({ ...start, height: MIN_DRAWING_SIZE_PX })
    // right edge stays at 300 and bottom edge at 160
    expect(draggedDrawingRect(start, 'nw', 999, 999)).toEqual({ left: 300 - MIN_DRAWING_SIZE_PX,
      top: 160 - MIN_DRAWING_SIZE_PX, width: MIN_DRAWING_SIZE_PX, height: MIN_DRAWING_SIZE_PX })
  })

  test('resizing never moves the left or top edge into negative space', () => {
    const result = draggedDrawingRect(start, 'nw', -500, -500)
    // right edge stays at 300 and bottom edge at 160
    expect(result).toEqual({ left: 0, top: 0, width: 300, height: 160 })
  })
})
