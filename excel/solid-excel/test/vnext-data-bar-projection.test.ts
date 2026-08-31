import { describe, expect, test } from '@jest/globals'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { createWorkerWorkbookSpreadsheetBackend } from '../src/adapter'
import { dataBarProjection, getDataBarProjection } from '../src/adapter/data-bar-projection'
import { createStaticSpreadsheetBackend } from '../src/adapter/static/backend'
import { installWorkerRuntimeTs, type WorkerContext } from '../src/adapter/worker-runtime-ts'
import type { WorkerLike, WorkerWorkbookSpreadsheetBackend } from '../src/adapter'

const SHEET = 'sheet-1'
const DATA_BAR_RANGE = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 0 }
const INNER_RANGE = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }

type DataBarBackend = Pick<SpreadsheetBackend, 'readRangeProjection' | 'setConditionalFormatRule'>

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

async function applyDataBar(backend: DataBarBackend) {
  const setConditionalFormatRule = backend.setConditionalFormatRule
  if (!setConditionalFormatRule) throw new Error('conditional formatting is unavailable')
  const dataBar = await setConditionalFormatRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 1,
    revision: 0,
    scope: { range: DATA_BAR_RANGE },
    priority: 0,
    rule: { kind: 'data-bar', minColor: '#eff6ff', maxColor: '#1d4ed8' },
  })
  await setConditionalFormatRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 2,
    revision: dataBar.revision,
    scope: { range: DATA_BAR_RANGE },
    priority: 1,
    rule: {
      kind: 'cell-value',
      operator: 'gt',
      value: '-1000',
      format: { bgColor: '#111111' },
    },
  })
}

async function expectDataBarProjection(backend: DataBarBackend) {
  await applyDataBar(backend)
  const result = await backend.readRangeProjection({
    kind: 'range',
    sheetId: SHEET,
    range: INNER_RANGE,
    requestId: 10,
    reason: 'viewport',
  })
  expect(result.cells.map((cell) => getDataBarProjection(cell)?.ratio)).toEqual([0.25, 0.5, 0.75])
  expect(result.cells.map((cell) => getDataBarProjection(cell)?.maxColor)).toEqual([
    '#1d4ed8',
    '#1d4ed8',
    '#1d4ed8',
  ])
  expect(result.cells.every((cell) => cell.conditionalFormat === undefined)).toBe(true)

  const outOfScope = await backend.readRangeProjection({
    kind: 'range',
    sheetId: SHEET,
    range: { rowStart: 5, rowEnd: 5, colStart: 0, colEnd: 0 },
    requestId: 11,
    reason: 'viewport',
  })
  expect(getDataBarProjection(outOfScope.cells[0])).toBeUndefined()
}

describe('Data Bar projection', () => {
  test('static backend uses the full numeric rule domain and first matching priority', async () => {
    const backend = createStaticSpreadsheetBackend({
      matrix: [[-100], [-50], [0], [50], [100], ['text']],
    })
    await expectDataBarProjection(backend)
  })

  test('TS worker uses the full canonical rule domain through the runtime bridge', async () => {
    const backend = await createTsBackend()
    for (const [row, input] of ['-100', '-50', '0', '50', '100', 'text'].entries()) {
      await backend.setCellInput({ kind: 'set-cell-input', sheetId: SHEET, row, col: 0, input })
    }
    await expectDataBarProjection(backend)
  })

  test('a one-value domain is stable at a full-width max-color bar', () => {
    expect(
      dataBarProjection({ kind: 'data-bar', maxColor: '#456' }, 8, { min: 8, max: 8 }),
    ).toEqual({
      ratio: 1,
      minColor: '#dbeafe',
      maxColor: '#456',
    })
  })

  test('fails untrusted CSS colors closed before a projection reaches the Grid', () => {
    expect(
      dataBarProjection(
        { kind: 'data-bar', minColor: 'red; width: 100%', maxColor: 'url(javascript:alert(1))' },
        2,
        { min: 0, max: 4 },
      ),
    ).toMatchObject({ ratio: 0.5, minColor: '#dbeafe', maxColor: '#2563eb' })
  })
})
