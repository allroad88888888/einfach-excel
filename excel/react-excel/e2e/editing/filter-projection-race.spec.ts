import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

// 只控制响应送达顺序；区域、历史、投影都来自真实 Rust Worker。
test('clear replaces a preceding in-flight viewport read without an extra refresh', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (coreUrl) => {
    const core = await import(`${coreUrl}index.ts`)
    const { default: RuntimeWorker } = await import(`${coreUrl}rust-runtime.ts?worker`)
    const connection = core.createRustWorkbookConnection(() => new RuntimeWorker())
    let releaseRead!: () => void
    let releaseClear!: () => void
    let readArrived!: () => void
    let clearArrived!: () => void
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const clearGate = new Promise<void>((resolve) => { releaseClear = resolve })
    const readReady = new Promise<void>((resolve) => { readArrived = resolve })
    const clearReady = new Promise<void>((resolve) => { clearArrived = resolve })
    let pauseRead = false
    const calls: string[] = []
    const { store } = core.createSpreadsheetUi({
      connection: {
        async request(command: string, payload: { action?: string }) {
          calls.push(command)
          const value = await connection.request(command, payload)
          if (command === 'projection.readVisible' && pauseRead) {
            pauseRead = false
            readArrived()
            await readGate
          }
          if (command === 'sheet.filter' && payload.action === 'clear') {
            clearArrived()
            await clearGate
          }
          return value
        },
        dispose() { connection.dispose() },
      },
    })
    try {
      const sheets = [{ id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 }]
      await connection.request('workbook.initialize', { sheets })
      store.setter(core.initializeWorkbookDocumentAtom, { title: 'Book', sheets })
      store.setter(core.selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
      const window = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }
      const range = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 1 }
      await store.setter(core.runVisibleProjectionAtom, { sheetId: 's', window })
      await store.setter(core.runNativeFilterAtom, { action: 'apply', range, rules: [] })
      pauseRead = true
      const refresh = store.setter(core.runVisibleProjectionAtom, {
        sheetId: 's', window, retainResult: true,
      })
      await readReady
      const clear = store.setter(core.runNativeFilterAtom, { action: 'clear' })
      await clearReady
      releaseRead()
      await refresh
      const before = store.getter(core.nativeFilterRangeAtom)
      releaseClear()
      const cleared = await clear
      const after = store.getter(core.nativeFilterRangeAtom)
      const projection = store.getter(core.projectionSnapshotAtom).result
      return { before, after, cleared, calls, history: projection.history }
    } finally {
      releaseRead()
      releaseClear()
      connection.dispose()
    }
  }, coreUrl)
  expect(result.before).toEqual({ rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 1 })
  expect(result.cleared).toBe(true)
  expect(result.after).toBeUndefined()
  expect(result.history.undoCount).toBe(2)
  expect(result.calls).toEqual([
    'projection.readVisible', 'sheet.filter', 'projection.readVisible', 'sheet.filter',
  ])
})
