import { describe, expect, it } from 'vitest'
import { workbookCellAtViewportPoint } from '../../../src/workbook/grid/viewport/workbook-grid-hit-test'

const viewport = {
  bounds: { left: 100, top: 80 }, scrollTop: 280, scrollLeft: 240,
  rowHeight: 28, colWidth: 120, rowHeaderWidth: 44, rowCount: 100, colCount: 20,
}

describe('captured drag viewport fallback', () => {
  it.each([
    ['top heading', 284, 83, { row: 10, col: 3 }],
    ['left heading', 103, 178, { row: 12, col: 2 }],
    ['ordinary cell', 284, 178, { row: 12, col: 3 }],
  ] as const)('%s selects the nearest real cell after scrolling', (_label, clientX, clientY, expected) => {
    expect(workbookCellAtViewportPoint({ ...viewport, clientX, clientY })).toEqual(expected)
  })

  it.each([
    ['top', 284, 83, { row: 0, col: 3 }],
    ['left', 103, 178, { row: 12, col: 0 }],
  ] as const)('%s heading keeps frozen cells fixed', (_label, clientX, clientY, expected) => {
    expect(workbookCellAtViewportPoint({
      ...viewport, clientX, clientY, frozenHeight: 28, frozenWidth: 120,
    })).toEqual(expected)
  })

  it.each([
    ['top', 284, 83, { row: 9, col: 2 }],
    ['left', 103, 178, { row: 11, col: 1 }],
  ] as const)('%s heading respects native size overrides', (_label, clientX, clientY, expected) => {
    expect(workbookCellAtViewportPoint({
      ...viewport, clientX, clientY, rowHeights: { 0: 56 }, colWidths: { 0: 200 },
    })).toEqual(expected)
  })
})
