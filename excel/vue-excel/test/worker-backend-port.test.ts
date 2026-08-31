import {
  createWorkerWorkbookSpreadsheetBackend,
  type WorkerWorkbookClient,
} from '../../solid-excel/src/adapter'
import type { SpreadsheetUiCore } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { createApp, defineComponent, h } from 'vue'
import { SpreadsheetUiProvider, useSpreadsheetUiCore } from '../src'

const SHEET_ID = 'worker-sheet'

function createFakeWorkerClient() {
  const writes: Array<{ sheet: number; address: string; value: unknown }> = []
  const client: Partial<WorkerWorkbookClient> = {
    initWorkbook: async (sheets = []) => sheets.map((name, idx) => ({ idx, name })),
    sheetList: async () => [{ idx: 0, name: 'Sheet1' }],
    snapshotRangeSparse: async () => [],
    setCell: async (sheet, address, value) => {
      writes.push({ sheet, address, value })
      return true
    },
    onCellsDirty: () => () => {},
    dispose: () => {},
  }

  return { client: client as WorkerWorkbookClient, writes }
}

function mountProvider(
  backend: SpreadsheetUiCore['backend'],
  onCore: (core: SpreadsheetUiCore) => void,
) {
  const Capture = defineComponent({
    setup() {
      const core = useSpreadsheetUiCore()
      return () => {
        onCore(core.value)
        return null
      }
    },
  })
  const Root = defineComponent({
    setup() {
      return () => h(SpreadsheetUiProvider, { backend }, { default: () => h(Capture) })
    },
  })
  const app = createApp(Root)
  app.mount(document.createElement('div'))
  return app
}

describe('Vue Worker backend port', () => {
  it('calls a caller-owned Worker backend through the injected spreadsheet core', async () => {
    const { client, writes } = createFakeWorkerClient()
    const backend = createWorkerWorkbookSpreadsheetBackend({
      client,
      sheets: [{ id: SHEET_ID, name: 'Sheet1' }],
    })
    let injectedCore: SpreadsheetUiCore | undefined
    const app = mountProvider(backend, (core) => {
      injectedCore = core
    })

    await backend.ready()
    await injectedCore?.backend.setCellInput({
      kind: 'set-cell-input',
      sheetId: SHEET_ID,
      row: 0,
      col: 0,
      input: '42',
    })

    expect(injectedCore?.backend).toBe(backend)
    expect(writes).toEqual([{ sheet: 0, address: 'A1', value: { type: 'number', value: 42 } }])

    app.unmount()
    backend.dispose()
  })
})
