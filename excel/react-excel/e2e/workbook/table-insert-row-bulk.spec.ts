import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} pastes into an empty table with atomic history and rejection`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook()
    try {
      book.set_number(0, 'D3', 99)
      book.add_sheet('Report')
      book.set_formula(1, 'A1', '=ROWS(Orders[Qty])')
      book.set_formula(1, 'A2', '=Orders[Amount]')
      const snapshot = book.snapshot_persistence_v1()
      snapshot.tables = [{ name: 'Orders', sheet: 'Sheet1', sheetIndex: 0, range: 'A3:B3',
        hasHeaders: false, hasTotals: false, columns: ['Qty', 'Amount'], insertRow: true }]
      book.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
      const saved = () => JSON.stringify(book.snapshot_persistence_v1())
      const before = saved()
      const policy = { rowCount: 100, colCount: 10 }
      book.paste_clipboard(0, 2, 0, '7\t14', false, policy)
      const after = saved()
      const first = { record: !book.listTables()[0].insertRow,
        count: book.get_number(1, 'A1'), amount: book.get_number(1, 'A2'),
        undoCount: book.history_state().undoCount }
      book.history_apply('undo')
      const exactUndo = saved() === before
      const empty = book.get_display(1, 'A1')
      book.history_apply('redo')
      const exactRedo = saved() === after
      book.history_apply('undo')
      const history = JSON.stringify(book.history_state())
      let arrayRejected = false
      try { book.paste_clipboard(0, 2, 0, '=SEQUENCE(2)', false, policy) } catch { arrayRejected = true }
      const arrayRollback = saved() === before && JSON.stringify(book.history_state()) === history
      // 仅格式不是数据记录；格式只能来自内部快照，外部 TSV 没有格式。
      book.capture_clipboard(0, 3, 3, 3, 3, false)
      book.paste_clipboard(0, 2, 0, '', true, { ...policy, mode: 'formats' })
      const stillEmpty = Boolean(book.listTables()[0].insertRow)
      // 既有规则只在值类粘贴时校验；加零保留 C3 的公式，等待整批结果后判断。
      book.set_formula(0, 'C3', '=IFERROR(ROWS(Orders[Amount]),0)')
      book.setDataValidation(0, 2, 2, 2, 2,
        { kind: 'whole-number', min: 2, max: 2, ignoreBlank: false })
      const restricted = saved(), restrictedHistory = JSON.stringify(book.history_state())
      let validationRejected = false
      try {
        book.paste_clipboard(0, 2, 0, '7\t14\t0', false, { ...policy, mode: 'values', arithmetic: 'add' })
      } catch { validationRejected = true }
      const validationRollback = saved() === restricted
        && JSON.stringify(book.history_state()) === restrictedHistory
      // 填充等调用使用的通用 begin/write/finish 也必须恢复输入位置。
      book.restore_persistence_v1(JSON.parse(before))
      book.history_begin(0, 2, 0, 2, 1, 'Bulk values', true)
      book.set_number(0, 'A3', 8)
      book.set_number(0, 'B3', 16)
      book.history_finish(true)
      const bulkAmount = book.get_number(1, 'A2')
      book.history_apply('undo')
      const bulkUndo = saved() === before
      return { first, exactUndo, empty, exactRedo, arrayRejected, arrayRollback,
        stillEmpty, validationRejected, validationRollback, bulkAmount, bulkUndo,
        outside: book.get_number(0, 'D3') }
    } finally { book.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ first: { record: true, count: 1, amount: 14, undoCount: 1 },
    exactUndo: true, empty: '#REF!', exactRedo: true, arrayRejected: true, arrayRollback: true,
    stillEmpty: true, validationRejected: true, validationRollback: true,
    bulkAmount: 16, bulkUndo: true, outside: 99 })
})
