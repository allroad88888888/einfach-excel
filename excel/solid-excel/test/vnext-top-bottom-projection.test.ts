import { describe, expect, test } from '@jest/globals'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { createWorkerWorkbookSpreadsheetBackend } from '../src/adapter'
import { collectTopBottomMatches } from '../src/adapter/top-bottom-projection'
import { createStaticSpreadsheetBackend } from '../src/adapter/static/backend'
import { installWorkerRuntimeTs, type WorkerContext } from '../src/adapter/worker-runtime-ts'
import type { WorkerLike, WorkerWorkbookSpreadsheetBackend } from '../src/adapter'

const SHEET = 'sheet-1'
const RULE_RANGE = { rowStart: 0, rowEnd: 6, colStart: 0, colEnd: 0 }
const INNER_RANGE = { rowStart: 1, rowEnd: 5, colStart: 0, colEnd: 0 }
type TopBottomBackend = Pick<SpreadsheetBackend, 'readRangeProjection' | 'setConditionalFormatRule'>

function createInProcessTsWorker(): WorkerLike {
  const toWorker: Array<(event: MessageEvent) => void> = []
  const toClient: Array<(event: MessageEvent) => void> = []
  const workerContext: WorkerContext = {
    postMessage(message: unknown) {
      for (const listener of [...toClient]) listener({ data: message } as MessageEvent)
    },
    addEventListener(_type, listener) {
      toWorker.push(listener)
    },
  }
  installWorkerRuntimeTs(workerContext)
  return {
    postMessage(message: unknown) {
      for (const listener of [...toWorker]) listener({ data: message } as MessageEvent)
    },
    addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
      toClient.push(listener)
    },
    removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
      const index = toClient.indexOf(listener)
      if (index >= 0) toClient.splice(index, 1)
    },
    terminate() {},
  }
}

async function createTsBackend(): Promise<WorkerWorkbookSpreadsheetBackend> {
  const backend = createWorkerWorkbookSpreadsheetBackend({
    workerFactory: createInProcessTsWorker,
    sheets: [{ id: SHEET, name: 'Sheet1' }],
  })
  await backend.ready()
  return backend
}

async function applyTopBottomRules(backend: TopBottomBackend) {
  const setRule = backend.setConditionalFormatRule
  if (!setRule) throw new Error('conditional formatting is unavailable')
  const top = await setRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 1,
    revision: 0,
    scope: { range: RULE_RANGE },
    priority: 0,
    rule: { kind: 'top-bottom', direction: 'top', count: 2, format: { bgColor: '#ef4444' } },
  })
  const bottom = await setRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 2,
    revision: top.revision,
    scope: { range: RULE_RANGE },
    priority: 1,
    rule: {
      kind: 'top-bottom',
      direction: 'bottom',
      count: 40,
      percent: true,
      format: { bgColor: '#3b82f6' },
    },
  })
  await setRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 3,
    revision: bottom.revision,
    scope: { range: RULE_RANGE },
    priority: 2,
    rule: { kind: 'cell-value', operator: 'gt', value: '-1000', format: { bgColor: '#22c55e' } },
  })
}

async function expectTopBottomProjection(backend: TopBottomBackend) {
  await applyTopBottomRules(backend)
  const result = await backend.readRangeProjection({
    kind: 'range',
    sheetId: SHEET,
    range: INNER_RANGE,
    requestId: 10,
    reason: 'viewport',
  })
  // Row 0 is outside the read window but takes the first Top slot. The equal
  // 90s then use source row order, so row 2 falls through to the lower rule.
  expect(result.cells.map((cell) => cell.conditionalFormat?.bgColor)).toEqual([
    '#ef4444',
    '#22c55e',
    '#3b82f6',
    '#3b82f6',
    undefined,
  ])
}

describe('Top/Bottom projection', () => {
  test('static backend ranks the full range with stable ties and percent bottom', async () => {
    const backend = createStaticSpreadsheetBackend({
      matrix: [[100], [90], [90], [80], [10], ['text'], ['']],
    })
    await expectTopBottomProjection(backend)
  })

  test('TS worker ranks each canonical scope rather than its requested window', async () => {
    const backend = await createTsBackend()
    for (const [row, input] of ['100', '90', '90', '80', '10', 'text', ''].entries()) {
      await backend.setCellInput({ kind: 'set-cell-input', sheetId: SHEET, row, col: 0, input })
    }
    await expectTopBottomProjection(backend)
  })

  test('ignores blanks and invalid counts while retaining a deterministic coordinate cut-off', () => {
    const matches = collectTopBottomMatches(
      [
        {
          id: 'top',
          priority: 0,
          scope: { range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 0 } },
          rule: { kind: 'top-bottom', direction: 'top', count: 2, format: {} },
        },
        {
          id: 'invalid',
          priority: 0,
          scope: { range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 0 } },
          rule: { kind: 'top-bottom', direction: 'bottom', count: 0, format: {} },
        },
      ],
      [
        { row: 0, col: 0, displayValue: '9', numericValue: 9 },
        { row: 1, col: 0, displayValue: '9', numericValue: 9 },
        { row: 2, col: 0, displayValue: '8', numericValue: 8 },
        { row: 3, col: 0, displayValue: 'error' },
      ],
    )
    expect([...(matches.get('top') ?? [])]).toEqual(['0:0', '1:0'])
    expect(matches.get('invalid')).toEqual(new Set())
  })
})
