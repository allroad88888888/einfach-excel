import { expect, test } from 'vitest'
import type { VisibleProjectionResult } from '../src/backend'
import { validateProjectionResult } from '../src/projection/contracts'

function result(): VisibleProjectionResult {
  return {
    kind: 'visible-window', sheetId: 's', requestId: 1, cells: [],
    window: { rowStart: 2, rowEnd: 4, colStart: 2, colEnd: 4 },
    mergedRanges: [{ rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }],
    visibility: { manualRows: [0, 1], filterRows: [], manualColumns: [0, 1] },
    mergeBorderCells: [{ row: 0, col: 2, displayValue: '',
      format: { borders: { top: { style: 'thin', color: '#123abc' } } } }],
  }
}

test('a hidden offscreen merged edge is permitted without widening ordinary cells', () => {
  expect(validateProjectionResult(result()).ok).toBe(true)
  const ordinary = result()
  ordinary.cells = ordinary.mergeBorderCells!
  expect(validateProjectionResult(ordinary).ok).toBe(false)
})

test('rejects non-collapsed, internal, duplicate and unbounded supplemental edges', () => {
  const visible = result()
  visible.visibility!.manualRows = [0]
  expect(validateProjectionResult(visible).ok).toBe(false)
  const internal = result()
  internal.mergeBorderCells![0].row = 1
  expect(validateProjectionResult(internal).ok).toBe(false)
  const duplicate = result()
  duplicate.mergeBorderCells!.push(duplicate.mergeBorderCells![0])
  expect(validateProjectionResult(duplicate).ok).toBe(false)
  expect(validateProjectionResult(result(), { maxCells: 0 }).ok).toBe(false)
})
