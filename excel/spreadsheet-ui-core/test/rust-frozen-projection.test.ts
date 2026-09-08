import { expect, test, vi } from 'vitest'
import type { VisibleProjectionRequest } from '../src/backend'
import { readVisibleProjection } from '../src/rust-workbook/visible-projection'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'
import { validateProjectionResult } from '../src/projection/contracts'
import { getSourceTextFromProjection } from '../src/projection/editable-source-text'
import { cellAtProjection } from '../src/projection/cell-at'

const projection: VisibleProjectionRequest = {
  kind: 'visible-window',
  sheetId: 's',
  requestId: 7,
  window: { rowStart: 100, rowEnd: 110, colStart: 20, colEnd: 25 },
  viewport: { height: 280, width: 600, rowHeight: 28, colWidth: 120 },
}
function native(rows = 2, cols = 1) {
  const read = vi.fn(() => [])
  const formats = vi.fn(() => ({ cellStyles: [], rowStyles: [], columnStyles: [] }))
  const sizes = vi.fn(() => ({ rowHeights: [], colWidths: [] }))
  const workbook = {
    frozen_panes: () => [rows, cols],
    read_sparse_range: read,
    snapshot_format_range: formats,
    snapshot_viewport_sizes: sizes,
    merged_ranges: () => [],
    sheet_visibility: () => ({ manualRows: [], manualColumns: [], filterRows: [] }),
  } as unknown as WasmWorkbook
  return { workbook, read, formats, sizes }
}

test('one result groups three frozen regions beside an unchanged body window', () => {
  const r = native()
  const result = readVisibleProjection(r.workbook, 0, projection, 12)
  expect(result).toMatchObject({
    sheetId: 's',
    requestId: 7,
    revision: 12,
    window: projection.window,
    cells: [],
  })
  expect(result.frozen).toMatchObject({ height: 56, width: 120 })
  expect(result.frozen!.regions.map((region) => region.pane)).toEqual(['corner', 'top', 'left'])
  expect(r.read.mock.calls).toEqual([
    [0, 0, 0, 1, 0],
    [0, 0, 20, 1, 25],
    [0, 100, 0, 110, 0],
    [0, 100, 20, 110, 25],
  ])
  expect(validateProjectionResult(result, { request: projection }).ok).toBe(true)
  expect(getSourceTextFromProjection(result, { row: 0, col: 0 }, 's')).toBe('')
  expect(getSourceTextFromProjection(result, { row: 50, col: 10 }, 's')).toBeUndefined()
  expect(getSourceTextFromProjection(result, { row: 0, col: 0 }, 'other')).toBeUndefined()
})

test('a huge freeze reads sparse size metadata but never expands its full cell rectangle', () => {
  const r = native(1_000_000, 16_000)
  const result = readVisibleProjection(r.workbook, 0, projection, 1)
  expect(r.sizes.mock.calls[0]).toEqual([0, 0, 0, 999_999, 15_999])
  expect(r.read.mock.calls).toEqual([
    [0, 0, 0, 9, 4],
    [0, 100, 20, 110, 25],
  ])
  expect(r.formats.mock.calls).toEqual(r.read.mock.calls)
  expect(result.frozen!.regions).toHaveLength(1)
})

test('hidden rows split native reads and never leak their contents into frozen projection', () => {
  const r = native(4, 1)
  r.workbook.sheet_visibility = () => ({ manualRows: [1], filterRows: [2], manualColumns: [] })
  const result = readVisibleProjection(r.workbook, 0, projection, 1)
  const top = result.frozen!.regions.filter((region) => region.pane !== 'left')
  expect(top.map((region) => [region.window.rowStart, region.window.rowEnd])).toEqual([
    [0, 0],
    [3, 3],
    [0, 0],
    [3, 3],
  ])
  expect(result.frozen!.height).toBe(56)
  expect(getSourceTextFromProjection(result, { row: 1, col: 0 }, 's')).toBeUndefined()
})

test('frozen merged anchors outside a read block retain their source and effective format', () => {
  const r = native(2, 0)
  r.workbook.merged_ranges = () => [0, 19, 1, 21]
  r.workbook.snapshotCell = () => ({
    sheet: 0,
    addr: 'T1',
    display: '24',
    inputText: '=12*2',
    formula: '=12*2',
    type: 'number',
    isError: false,
  })
  r.workbook.snapshot_format_range = () => ({
    cellStyles: [{ addr: 'T1', format: { bold: true } }],
    rowStyles: [],
    columnStyles: [],
  })
  const result = readVisibleProjection(r.workbook, 0, projection, 1)
  expect(result.cells).toEqual([])
  expect(result.mergeAnchors).toEqual([])
  expect(result.frozen!.regions[0].mergeAnchors).toMatchObject([
    { row: 0, col: 19, mergedSpan: { rows: 2, cols: 3 }, format: { bold: true } },
  ])
  expect(getSourceTextFromProjection(result, { row: 0, col: 19 }, 's')).toBe('=12*2')
  expect(cellAtProjection(result, { row: 0, col: 19 })?.format).toEqual({ bold: true })
})

test('unfreeze has an explicit empty frozen result and no extra size or data reads', () => {
  const r = native(0, 0)
  const result = readVisibleProjection(r.workbook, 0, projection, 2)
  expect(result.frozen).toEqual({ height: 0, width: 0, regions: [] })
  expect(r.read).toHaveBeenCalledTimes(1)
  expect(r.sizes).toHaveBeenCalledTimes(1)
})
