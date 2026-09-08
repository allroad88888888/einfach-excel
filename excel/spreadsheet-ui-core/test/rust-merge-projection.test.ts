import { expect, test, vi } from 'vitest'
import { readMergeProjection } from '../src/rust-workbook/merge-projection'
import { changeMerge } from '../src/rust-workbook/merge-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

const window = { rowStart: 20, rowEnd: 30, colStart: 4, colEnd: 8 }
function native(geometry: number[]) {
  return {
    merged_ranges: vi.fn(() => new Uint32Array(geometry)),
    snapshotCell: vi.fn(() => ({
      addr: 'A1',
      type: 'number',
      display: '0.25',
      inputText: '0.25',
      formula: '',
      isError: false,
    })),
    snapshot_format_range: vi.fn(() => ({
      cellStyles: [
        { addr: 'A1', format: { numberFormat: { kind: 'percent', digits: 0 }, bold: true } },
      ],
      rowStyles: [],
      columnStyles: [],
    })),
  }
}

test('offscreen merge anchor retains its source, format and full span without filling covered cells', () => {
  const wb = native([0, 0, 100, 10, 200, 5, 201, 7])
  const result = readMergeProjection(wb as unknown as WasmWorkbook, 0, window)
  expect(result.mergedRanges).toEqual([
    { rowStart: 0, colStart: 0, rowEnd: 100, colEnd: 10 },
    { rowStart: 200, colStart: 5, rowEnd: 201, colEnd: 7 },
  ])
  expect(result.mergeAnchors).toEqual([
    expect.objectContaining({
      row: 0,
      col: 0,
      displayValue: '25%',
      inputText: '0.25',
      mergedSpan: { rows: 101, cols: 11 },
      format: expect.objectContaining({ bold: true }),
    }),
  ])
  expect(wb.snapshotCell).toHaveBeenCalledTimes(1)
  expect(wb.snapshotCell).toHaveBeenCalledWith(0, 'A1')
  expect(wb.snapshot_format_range).toHaveBeenCalledTimes(1)
  expect(wb.snapshot_format_range).toHaveBeenCalledWith(0, 0, 0, 0, 0)
})

test('blank anchors remain renderable; unrelated merges do not read cells', () => {
  const wb = native([0, 0, 100, 10])
  wb.snapshotCell.mockReturnValue({
    addr: 'A1',
    type: 'null',
    display: '',
    inputText: '',
    formula: '',
    isError: false,
  })
  expect(readMergeProjection(wb as unknown as WasmWorkbook, 0, window).mergeAnchors).toMatchObject([
    { row: 0, col: 0, displayValue: '', valueKind: 'blank', mergedSpan: { rows: 101, cols: 11 } },
  ])
  wb.snapshotCell.mockClear()
  expect(
    readMergeProjection(wb as unknown as WasmWorkbook, 0, {
      rowStart: 200,
      rowEnd: 210,
      colStart: 0,
      colEnd: 2,
    }).mergeAnchors,
  ).toEqual([])
  expect(wb.snapshotCell).not.toHaveBeenCalled()
})

test.each([
  [0, 0, 1],
  [0, 0, 0, 0],
  [10, 0, 5, 1],
  [0, 0, 1_048_576, 0],
])('rejects malformed geometry %j', (...values) => {
  const wb = native(values)
  expect(() => readMergeProjection(wb as unknown as WasmWorkbook, 0, window)).toThrow(
    'Invalid Rust merge geometry.',
  )
})

test('missing native projection capability fails before merge writes', () => {
  const merge = vi.fn()
  expect(() =>
    changeMerge(
      { merge_cells: merge } as unknown as WasmWorkbook,
      0,
      {
        sheetId: 's',
        range: window,
        action: 'merge',
        discard: true,
        projection: { kind: 'visible-window', sheetId: 's', requestId: 1, window },
      },
      0,
    ),
  ).toThrow('Rust merge command is unavailable.')
  expect(merge).not.toHaveBeenCalled()
})
