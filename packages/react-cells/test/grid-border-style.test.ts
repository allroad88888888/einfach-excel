import { expect, test } from 'vitest'
import type { DisplayCell, VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'
import { createGridBorderStyles, sharedBorder } from '../src/grid-border-style'

const red = { style: 'thick', color: '#c00000' } as const
const blue = { style: 'thin', color: '#123abc' } as const
const none = { style: 'none' } as const
const window = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }
const cell = (row: number, col: number, borders: DisplayCell['format']) =>
  ({ row, col, displayValue: '', format: borders })

test('imported conflicts use explicit clear, width, then leading side; inputs stay unchanged', () => {
  expect(sharedBorder(red, blue)).toBe(red)
  expect(sharedBorder(blue, red)).toBe(red)
  expect(sharedBorder(red, none)).toBe(none)
  expect(sharedBorder(none, red)).toBe(none)
  expect(sharedBorder(blue, { ...blue, color: '#ffffff' })).toBe(blue)
  expect(sharedBorder(undefined, blue)).toBe(blue)
  expect(blue.style).toBe('thin')
})

test('one painted edge resolves both adjacent formats, including formatted blank cells', () => {
  const cells = [cell(1, 1, { borders: { left: blue, top: red } })]
  const style = createGridBorderStyles({ cells, window, scrollTop: 0, scrollLeft: 0 })
  expect(style(1, 0)).toMatchObject({ borderRightWidth: '1px', borderRightColor: '#123abc' })
  expect(style(0, 1)).toMatchObject({ borderBottomWidth: '3px', borderBottomColor: '#c00000' })
  expect(style(1, 1, cells[0].format)).toMatchObject({
    borderTopWidth: '0px', borderLeftWidth: '0px',
  })
})

test('virtual window leading edges keep their own border when the preceding cell is not painted', () => {
  const cells = [cell(1, 1, { borders: { left: blue, top: red } })]
  const style = createGridBorderStyles({
    cells, window: { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
    scrollTop: 90, scrollLeft: 80,
  })
  expect(style(1, 1, cells[0].format)).toMatchObject({
    borderTopWidth: '3px', borderLeftWidth: '1px',
  })
})

test('hidden row and column do not own a visible edge', () => {
  const cells = [cell(2, 2, { borders: { left: blue, top: red } })]
  const style = createGridBorderStyles({
    cells, window, rowHeights: [28, 0, 28], columnWidths: [100, 0, 100],
    scrollTop: 0, scrollLeft: 0,
  })
  expect(style(0, 2)).toMatchObject({ borderBottomWidth: '3px' })
  expect(style(2, 0)).toMatchObject({ borderRightWidth: '1px' })
  expect(style(2, 2, cells[0].format)).toMatchObject({
    borderTopWidth: '0px', borderLeftWidth: '0px',
  })
})

test('a clipped buffered neighbor keeps its border facts but no longer owns the painted edge', () => {
  const cells = [cell(1, 0, { borders: { right: blue } }),
    cell(0, 1, { borders: { bottom: red } })]
  const style = (visible: boolean) => createGridBorderStyles({
    cells, window, scrollTop: 28, scrollLeft: 100,
    isCellVisible: (row, col) => visible || row > 0 && col > 0,
  })(1, 1)
  expect(style(false)).toMatchObject({
    borderTopWidth: '3px', borderTopColor: '#c00000',
    borderLeftWidth: '1px', borderLeftColor: '#123abc',
  })
  expect(style(true)).toMatchObject({ borderTopWidth: '0px', borderLeftWidth: '0px' })
})

test('frozen seam joins only adjacent cells at zero scroll in the same projection', () => {
  const cells = [cell(1, 1, { borders: { top: blue, left: blue } })]
  const frozen = [cell(0, 1, { borders: { bottom: red } }),
    cell(1, 0, { borders: { right: red } })]
  const bodyWindow = { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }
  const projection: VisibleProjectionResult = {
    kind: 'visible-window', sheetId: 'sheet-1', requestId: 1, window: bodyWindow,
    cells, freeze: { rows: 1, cols: 1 },
    frozen: { width: 100, height: 28, regions: [
      { pane: 'top', window: { ...window, rowEnd: 0 }, cells: frozen },
    ] },
  }
  const style = (scroll: number, ownCells = cells) => createGridBorderStyles({
    cells: ownCells, window: bodyWindow, projection, scrollTop: scroll, scrollLeft: scroll,
  })(1, 1, cells[0].format)
  expect(style(0)).toMatchObject({
    borderTopWidth: '0px', borderLeftWidth: '0px', borderTopColor: '#c00000',
  })
  expect(style(1)).toMatchObject({ borderTopWidth: '1px', borderLeftWidth: '1px' })
  // 控制组件不能借用另一个 store 或旧快照中的格式。
  expect(style(0, [...cells])).toMatchObject({ borderTopWidth: '1px', borderTopColor: '#123abc' })
})

test('merged perimeter uses physical segments before offscreen anchor defaults', () => {
  const cells = [cell(2, 3, { borders: { right: blue } }),
    cell(2, 4, { borders: { left: blue } }), cell(3, 3, { borders: { right: none } })]
  const mergedWindow = { rowStart: 2, rowEnd: 4, colStart: 2, colEnd: 4 }
  const projection: VisibleProjectionResult = {
    kind: 'visible-window', sheetId: 'sheet-1', requestId: 1, window: mergedWindow, cells,
    mergedRanges: [{ rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 }],
    mergeAnchors: [{ ...cell(1, 1, { borders: {
      top: red, right: red, bottom: red, left: red,
    } }), mergedSpan: { rows: 3, cols: 3 } }],
  }
  const style = createGridBorderStyles({
    cells, window: mergedWindow, projection, scrollTop: 20, scrollLeft: 100,
  })
  expect(style(2, 3)).toMatchObject({ borderRightWidth: '1px', borderRightColor: '#123abc' })
  expect(style(2, 4, cells[1].format)).toMatchObject({ borderLeftWidth: '0px' })
  expect(style(3, 3).borderRightColor).toBeUndefined()
  expect(style(3, 2)).toMatchObject({ borderBottomWidth: '3px', borderBottomColor: '#c00000' })
  // 窗口从合并内部开始时，不能把锚点外沿画成一条假的内部线。
  expect(style(2, 2).borderTopColor).toBeUndefined()
  expect(style(2, 2).borderLeftColor).toBeUndefined()
})

test('collapsed hidden merge edges transfer to the preceding visible frozen cells only once', () => {
  const cells: DisplayCell[] = []
  const topCells: DisplayCell[] = [], leftCells: DisplayCell[] = []
  const bodyWindow = { rowStart: 2, rowEnd: 4, colStart: 2, colEnd: 4 }
  const topWindow = { ...bodyWindow, rowStart: 0, rowEnd: 0 }
  const leftWindow = { ...bodyWindow, colStart: 0, colEnd: 0 }
  const projection: VisibleProjectionResult = {
    kind: 'visible-window', sheetId: 's', requestId: 1, cells, window: bodyWindow,
    freeze: { rows: 1, cols: 1 },
    visibility: { manualRows: [1], filterRows: [], manualColumns: [1] },
    mergedRanges: [{ rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 }],
    mergeAnchors: [{ ...cell(1, 1, { borders: { top: red, left: red } }),
      mergedSpan: { rows: 3, cols: 3 } }],
    mergeBorderCells: [cell(1, 2, { borders: { top: blue } }),
      cell(2, 1, { borders: { left: blue } })],
    frozen: { height: 28, width: 100, regions: [
      { pane: 'top', window: topWindow, cells: topCells },
      { pane: 'left', window: leftWindow, cells: leftCells },
    ] },
  }
  const style = (data: DisplayCell[], region: typeof bodyWindow) => createGridBorderStyles({
    cells: data, window: region, projection, scrollTop: 0, scrollLeft: 0,
  })
  expect(style(topCells, topWindow)(0, 2)).toMatchObject({ borderBottomColor: '#123abc', borderBottomWidth: '1px' })
  expect(style(leftCells, leftWindow)(2, 0)).toMatchObject({ borderRightColor: '#123abc', borderRightWidth: '1px' })
  expect(style(cells, bodyWindow)(1, 2)).toMatchObject({ borderTopColor: '#123abc', borderTopWidth: '0px' })
  expect(style(cells, bodyWindow)(2, 1)).toMatchObject({ borderLeftColor: '#123abc', borderLeftWidth: '0px' })
})
