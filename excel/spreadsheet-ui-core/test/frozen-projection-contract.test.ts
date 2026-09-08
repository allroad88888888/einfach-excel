import { expect, test } from 'vitest'
import {
  createVisibleProjectionRequest,
  validateProjectionRequest,
  validateProjectionResult,
} from '../src/projection/contracts'
import type { VisibleProjectionRequest, VisibleProjectionResult } from '../src/backend'

const request: VisibleProjectionRequest = {
  kind: 'visible-window',
  sheetId: 's',
  requestId: 1,
  window: { rowStart: 100, rowEnd: 110, colStart: 20, colEnd: 25 },
  viewport: { height: 280, width: 600, rowHeight: 28, colWidth: 120 },
}
function result(): VisibleProjectionResult {
  return {
    ...request,
    cells: [],
    freeze: { rows: 2, cols: 1 },
    frozen: {
      height: 56,
      width: 120,
      regions: [
        {
          pane: 'top',
          window: { rowStart: 0, rowEnd: 1, colStart: 20, colEnd: 25 },
          cells: [],
        },
      ],
    },
  }
}

test('visible request copies viewport dimensions without taking workbook ownership', () => {
  const copy = createVisibleProjectionRequest(request)
  expect(copy.viewport).toEqual(request.viewport)
  expect(copy.viewport).not.toBe(request.viewport)
  expect(validateProjectionRequest(copy).ok).toBe(true)
})

test.each([null, {}, { height: NaN }, { rowHeight: 0 }, { width: Infinity }, { width: -1 }])(
  'invalid pixel viewport is rejected before scheduling: %j',
  (change) => {
    expect(
      validateProjectionRequest({
        ...request,
        viewport: change === null ? null : { ...request.viewport, ...change },
      } as never).ok,
    ).toBe(change !== null && Object.keys(change).length === 0)
  },
)

test('frozen cells remain outside the ordinary window contract but inside their own windows', () => {
  const value = result()
  expect(validateProjectionResult(value, { request }).ok).toBe(true)
  value.frozen!.regions[0].cells = [
    { row: 2, col: 20, valueKind: 'string', displayValue: 'outside' },
  ]
  expect(validateProjectionResult(value, { request }).ok).toBe(false)
})

test.each(['corner', 'left', 'unknown'])('a %s region cannot impersonate the top strip', (pane) => {
  const value = result()
  value.frozen!.regions[0].pane = pane as never
  expect(validateProjectionResult(value, { request }).ok).toBe(false)
})

test('all frozen blocks share the cap and malformed geometry cannot publish', () => {
  // 普通窗口有 66 格，先证明它符合预算，再只增大冻结区到 72 格。
  expect(validateProjectionResult(result(), { maxCells: 66 }).ok).toBe(true)
  const oversized = result()
  oversized.freeze = { rows: 12, cols: 1 }
  oversized.frozen!.regions[0].window.rowEnd = 11
  expect(validateProjectionResult(oversized, { maxCells: 66 }).ok).toBe(false)
  const value = result()
  value.frozen!.regions[0].window.rowStart = -1
  expect(validateProjectionResult(value).ok).toBe(false)
  value.frozen = { height: Infinity, width: 120, regions: [] }
  expect(validateProjectionResult(value).ok).toBe(false)
  value.frozen = null as never
  expect(validateProjectionResult(value).ok).toBe(false)
})
