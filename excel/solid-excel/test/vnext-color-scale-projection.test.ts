import { describe, expect, test } from '@jest/globals'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { createWorkerWorkbookSpreadsheetBackend } from '../src-vnext/adapter'
import { createStaticSpreadsheetBackend } from '../src-vnext/adapter/static/backend'
import { installWorkerRuntimeTs, type WorkerContext } from '../src-vnext/adapter/worker-runtime-ts'
import type { WorkerLike, WorkerWorkbookSpreadsheetBackend } from '../src-vnext/adapter'

const SHEET = 'sheet-1'
const SCALE_RANGE = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 0 }
const INNER_RANGE = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }

type ColorScaleBackend = Pick<
  SpreadsheetBackend,
  'readRangeProjection' | 'setConditionalFormatRule'
>

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

async function applyColorScaleRules(backend: ColorScaleBackend) {
  const setConditionalFormatRule = backend.setConditionalFormatRule
  if (!setConditionalFormatRule) throw new Error('conditional formatting is unavailable')
  const scale = await setConditionalFormatRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 1,
    revision: 0,
    scope: { range: SCALE_RANGE },
    priority: 1,
    rule: {
      kind: 'color-scale',
      minColor: '#ff0000',
      midColor: '#ffff00',
      maxColor: '#00ff00',
    },
  })
  const priority = await setConditionalFormatRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 2,
    revision: scale.revision,
    scope: { range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } },
    priority: 0,
    rule: {
      kind: 'cell-value',
      operator: 'eq',
      value: '0',
      format: { bgColor: '#111111' },
    },
  })
  await setConditionalFormatRule({
    kind: 'set-conditional-format-rule',
    sheetId: SHEET,
    requestId: 3,
    revision: priority.revision,
    scope: { range: { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 } },
    priority: 2,
    rule: {
      kind: 'color-scale',
      minColor: '#0000ff',
      maxColor: '#00ff00',
    },
  })
}

async function backgroundsFor(
  backend: ColorScaleBackend,
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
): Promise<string[]> {
  const result = await backend.readRangeProjection({
    kind: 'range',
    sheetId: SHEET,
    range,
    requestId: 10,
    reason: 'viewport',
  })
  return result.cells.map((cell) => cell.conditionalFormat?.bgColor ?? '')
}

async function expectColorScaleProjection(backend: ColorScaleBackend) {
  await applyColorScaleRules(backend)

  // A2:A4 omits the rule's min/max cells. Its colors prove the domain came
  // from all A1:A5 instead of only from the requested projection window.
  await expect(backgroundsFor(backend, INNER_RANGE)).resolves.toEqual([
    'rgb(255, 128, 0)',
    '#ffff00',
    'rgb(128, 255, 0)',
  ])
  await expect(
    backgroundsFor(backend, { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }),
  ).resolves.toEqual(['#111111'])
  await expect(
    backgroundsFor(backend, { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 }),
  ).resolves.toEqual(['#00ff00'])
}

describe('Color Scale projection', () => {
  test('static backend projects full-domain gradients, priority, and a single value', async () => {
    const backend = createStaticSpreadsheetBackend({
      matrix: [[0, 42], [25], [50], [75], [100]],
    })
    await expectColorScaleProjection(backend)
  })

  test('TS worker projects full-domain gradients through the real runtime bridge', async () => {
    const backend = await createTsBackend()
    for (const [row, input] of ['0', '25', '50', '75', '100'].entries()) {
      await backend.setCellInput({ kind: 'set-cell-input', sheetId: SHEET, row, col: 0, input })
    }
    await backend.setCellInput({
      kind: 'set-cell-input',
      sheetId: SHEET,
      row: 0,
      col: 1,
      input: '42',
    })
    await expectColorScaleProjection(backend)
  })
})
