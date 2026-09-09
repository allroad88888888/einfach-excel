import { expect, test, vi } from 'vitest'
import { fillRange } from '../src/rust-workbook/fill-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

const sourceRange = { rowStart: 3, rowEnd: 4, colStart: 3, colEnd: 4 }
function setup() {
  const apply_auto_fill = vi.fn(() => ({ written: 6 }))
  const history_begin = vi.fn()
  const history_finish = vi.fn()
  const workbook = { apply_auto_fill, history_begin, history_finish,
    snapshot_viewport_sizes: vi.fn() } as unknown as WasmWorkbook
  return { workbook, apply_auto_fill, history_begin, history_finish }
}
test.each([
  ['down', { ...sourceRange, rowEnd: 7 }, { ...sourceRange, rowStart: 5, rowEnd: 7 }],
  ['up', { ...sourceRange, rowStart: 0 }, { ...sourceRange, rowStart: 0, rowEnd: 2 }],
  ['right', { ...sourceRange, colEnd: 7 }, { ...sourceRange, colStart: 5, colEnd: 7 }],
  ['left', { ...sourceRange, colStart: 0 }, { ...sourceRange, colStart: 0, colEnd: 2 }],
] as const)('%s snapshots only destinations and passes explicit source to native', (direction, range, destination) => {
  const { workbook, apply_auto_fill, history_begin, history_finish } = setup()
  expect(fillRange(workbook, 0, { sheetId: 's', requestId: 1, range,
    sourceRange, direction, auto: true })).toEqual(destination)
  expect(apply_auto_fill).toHaveBeenCalledTimes(1)
  expect(apply_auto_fill.mock.lastCall).toEqual([{ sheet: 0, direction, series: 'copy', infer: true,
    sourceRange: { startRow: 3, endRow: 4, startCol: 3, endCol: 4 }, targetRange: {
      startRow: range.rowStart, endRow: range.rowEnd,
      startCol: range.colStart, endCol: range.colEnd,
    } }])
  expect(history_begin).toHaveBeenCalledWith(0, destination.rowStart, destination.colStart,
    destination.rowEnd, destination.colEnd, `Fill ${direction}`, true)
  expect(history_finish).toHaveBeenCalledWith(true)
})

test('invalid explicit sources never reach history allocation', () => {
  const { workbook, history_begin } = setup()
  for (const source of [sourceRange, { ...sourceRange, rowStart: -1 },
    { ...sourceRange, rowEnd: 100 }, { ...sourceRange, colEnd: 2 },
    { ...sourceRange, colEnd: 5 }, { ...sourceRange, rowStart: 4 },
  ]) expect(() => fillRange(workbook, 0, { sheetId: 's', requestId: 1,
    sourceRange: source, range: sourceRange, direction: 'down' })).toThrow()
  expect(history_begin).not.toHaveBeenCalled()
})

test('forced copy omits inference and native failure rolls back history', () => {
  const { workbook, apply_auto_fill, history_finish } = setup()
  apply_auto_fill.mockImplementationOnce(() => { throw new Error('spill') })
  expect(() => fillRange(workbook, 0, { sheetId: 's', requestId: 1, sourceRange,
    range: { ...sourceRange, rowEnd: 8 }, direction: 'down', auto: false })).toThrow('spill')
  expect(apply_auto_fill.mock.lastCall![0]).not.toHaveProperty('infer')
  expect(history_finish).toHaveBeenCalledWith(false)
})
