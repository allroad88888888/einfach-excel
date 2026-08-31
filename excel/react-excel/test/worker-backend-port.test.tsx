import { createStore } from '@einfach/core'
import type { SpreadsheetUiCore } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react'
import { createWorkerWorkbookSpreadsheetBackend } from '../../solid-excel/src/adapter/worker/backend'
import type {
  SparseRangeWire,
  WorkerWorkbookClient,
} from '../../solid-excel/src/adapter/worker-protocol'
import { SpreadsheetUiProvider, useSpreadsheetUiCore } from '../src'

const SHEET_ID = 'sheet-1'

function CoreCapture({ onCore }: { onCore: (core: SpreadsheetUiCore) => void }) {
  onCore(useSpreadsheetUiCore())
  return null
}

function createWorkerClient(): {
  client: WorkerWorkbookClient
  readSparseRange: jest.Mock<(range: unknown) => Promise<unknown>>
} {
  const readSparseRange = jest.fn(async () => [
    {
      sheet: 0,
      addr: 'A1',
      display: 'from worker',
      type: 'text',
      isError: false,
      formula: '',
    },
  ])

  return {
    client: {
      initWorkbook: async () => [{ idx: 0, name: 'Sheet1' }],
      onCellsDirty: () => () => undefined,
      readSparseRange,
      snapshotFormatRange: async (range: SparseRangeWire) => ({
        ...range,
        cellFormats: [],
        rangeFormats: [],
      }),
    } as unknown as WorkerWorkbookClient,
    readSparseRange,
  }
}

describe('React Worker backend port', () => {
  it('calls a caller-owned Worker backend through the React provider context', async () => {
    const worker = createWorkerClient()
    const backend = createWorkerWorkbookSpreadsheetBackend({
      client: worker.client,
      sheets: [{ id: SHEET_ID, name: 'Sheet1' }],
    })
    await backend.ready()

    let core: SpreadsheetUiCore | undefined
    render(
      <SpreadsheetUiProvider backend={backend} store={createStore()}>
        <CoreCapture
          onCore={(nextCore) => {
            core = nextCore
          }}
        />
      </SpreadsheetUiProvider>,
    )

    expect(core?.backend).toBe(backend)
    await expect(
      core!.backend.readRangeProjection({
        kind: 'range',
        sheetId: SHEET_ID,
        range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
        requestId: 1,
        reason: 'viewport',
      }),
    ).resolves.toMatchObject({
      cells: [{ row: 0, col: 0, displayValue: 'from worker' }],
    })
    expect(worker.readSparseRange).toHaveBeenCalledWith({
      sheet: 0,
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 0,
    })
  })
})
