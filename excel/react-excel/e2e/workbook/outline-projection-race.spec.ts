import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

// 只延迟真实响应的送达；分组、版本校验、历史、投影仍由 Rust Worker 完成。
test('outline collapse accepts the retained version while a viewport read settles', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (coreUrl) => {
    const core = await import(`${coreUrl}index.ts`)
    const { default: RuntimeWorker } = await import(`${coreUrl}rust-runtime.ts?worker`)
    const connection = core.createRustWorkbookConnection(() => new RuntimeWorker())
    let releaseRead!: () => void, releaseChange!: () => void
    let readArrived!: () => void, changeArrived!: () => void
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve })
    const changeGate = new Promise<void>((resolve) => { releaseChange = resolve })
    const readReady = new Promise<void>((resolve) => { readArrived = resolve })
    const changeReady = new Promise<void>((resolve) => { changeArrived = resolve })
    let hold = false
    const calls: string[] = []
    const { store } = core.createSpreadsheetUi({
      connection: {
        async request(command: string, payload: unknown) {
          calls.push(command)
          const value = await connection.request(command, payload)
          if (hold && command === 'projection.readVisible') {
            readArrived()
            await readGate
          }
          if (hold && command === 'outline.change') {
            changeArrived()
            await changeGate
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
      store.setter(core.selectCellAtom, { sheetId: 's', coord: { row: 1, col: 0 } })
      const window = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }
      await store.setter(core.runVisibleProjectionAtom, { sheetId: 's', window })
      await store.setter(core.runNativeOutlineAtom, {
        axis: 'row', action: { kind: 'group', start: 1, end: 3 },
      })
      hold = true
      const read = store.setter(core.runVisibleProjectionAtom, {
        sheetId: 's', window: { ...window, rowEnd: 8 }, retainResult: true,
      })
      await readReady
      const collapse = store.setter(core.runNativeOutlineAtom, {
        axis: 'row', action: { kind: 'show-level', level: 1 },
      })
      // 旧实现直接拒绝时也结束测试，不以等待超时代替断言失败。
      await Promise.race([changeReady, collapse.then(() => {})])
      releaseRead()
      await read
      const before = store.getter(core.nativeOutlineAtom)
      releaseChange()
      const changed = await collapse
      return {
        before, changed, after: store.getter(core.nativeOutlineAtom), calls,
        feedback: store.getter(core.nativeOutlineFeedbackAtom),
        projection: store.getter(core.projectionSnapshotAtom).result,
      }
    } finally {
      releaseRead()
      releaseChange()
      connection.dispose()
    }
  }, coreUrl)
  expect(result.changed).toBe(true)
  expect(result.before.rows).toEqual([{ start: 1, end: 3, collapsed: false }])
  expect(result.after.rows).toEqual([{ start: 1, end: 3, collapsed: true }])
  expect(result.projection.visibility.outlineRows).toEqual([1, 2, 3])
  expect(result.projection.history.undoCount).toBe(2)
  expect(result.feedback).toEqual({ busy: false, error: '' })
  expect(result.calls).toEqual([
    'projection.readVisible', 'outline.change', 'projection.readVisible', 'outline.change',
  ])
})
