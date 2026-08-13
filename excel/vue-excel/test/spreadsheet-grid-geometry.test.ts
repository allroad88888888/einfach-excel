import { describe, expect, it } from '@jest/globals'

import { getSpreadsheetGridGeometry } from '../src/spreadsheet-grid-geometry'

const VIEWPORT = {
  viewportHeight: 100,
  viewportWidth: 120,
  rowHeight: 20,
  colWidth: 30,
  rowCount: 100,
  colCount: 100,
  overscanRows: 0,
  overscanCols: 0,
}

describe('getSpreadsheetGridGeometry', () => {
  it('maps logical offsets to whole-surface render intervals', () => {
    const geometry = getSpreadsheetGridGeometry({
      viewport: VIEWPORT,
      scroll: { top: 400, left: 300 },
    })

    expect(geometry.window).toEqual({ rowStart: 15, rowEnd: 39, colStart: 6, colEnd: 25 })
    expect(geometry.rows).toMatchObject({
      startOffsetPx: 300,
      endOffsetPx: 800,
      totalPx: 2000,
      surfacePx: 500,
      placement: { anchorPx: 300, physicalPx: 100 },
    })
    expect(geometry.cols).toMatchObject({
      startOffsetPx: 180,
      endOffsetPx: 780,
      totalPx: 3000,
      surfacePx: 600,
      placement: { anchorPx: 180, physicalPx: 120 },
    })
    expect(geometry.rows.placement.anchorPx + geometry.rows.placement.physicalPx).toBe(400)
    expect(geometry.cols.placement.anchorPx + geometry.cols.placement.physicalPx).toBe(300)
  })

  it('uses sparse dimensions and hidden indices for coordinates', () => {
    const geometry = getSpreadsheetGridGeometry({
      viewport: { ...VIEWPORT, rowCount: 8, colCount: 8 },
      scroll: { top: 55, left: 65 },
      rowHeights: { 1: 40 },
      colWidths: { 2: 50 },
      hiddenRows: new Set([3]),
      hiddenCols: new Set([1]),
    })

    expect(geometry.window).toEqual({ rowStart: 0, rowEnd: 7, colStart: 0, colEnd: 7 })
    expect(geometry.rows).toMatchObject({
      startOffsetPx: 0,
      endOffsetPx: 160,
      totalPx: 160,
      surfacePx: 160,
      placement: { anchorPx: 0, physicalPx: 55 },
    })
    expect(geometry.cols).toMatchObject({
      startOffsetPx: 0,
      endOffsetPx: 230,
      totalPx: 230,
      surfacePx: 230,
      placement: { anchorPx: 0, physicalPx: 65 },
    })
  })

  it('returns an empty render window for an empty axis', () => {
    const geometry = getSpreadsheetGridGeometry({
      viewport: { ...VIEWPORT, rowCount: 0 },
      scroll: { top: 500, left: 30 },
    })

    expect(geometry.window).toEqual({ rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 })
    expect(geometry.rows).toMatchObject({
      startIndex: 0,
      endIndex: -1,
      totalPx: 0,
      surfacePx: 0,
      placement: { anchorPx: 0, physicalPx: 0 },
    })
  })

  it('normalizes non-finite logical offsets without changing grid metrics', () => {
    const geometry = getSpreadsheetGridGeometry({
      viewport: VIEWPORT,
      scroll: { top: Number.NaN, left: Number.POSITIVE_INFINITY },
    })

    expect(geometry.window).toEqual({ rowStart: 0, rowEnd: 24, colStart: 0, colEnd: 19 })
    expect(geometry.rows.placement).toEqual({ anchorPx: 0, physicalPx: 0 })
    expect(geometry.cols.placement).toEqual({ anchorPx: 0, physicalPx: 0 })
  })
})
