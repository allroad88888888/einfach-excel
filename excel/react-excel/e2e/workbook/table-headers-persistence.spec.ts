import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`

// 直接调用真实二进制的保存边界；不表示页面保存菜单已交付。
for (const variant of ['lite', 'full']) for (const visible of [false, true]) test(
  `${variant} restores ${visible ? 'visible' : 'hidden'} table header arrays before anchor reads`, async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async ({ url, visible: headersVisible }) => {
      const module = await import(url)
      await module.default()
      const source = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
      try {
        source.set_cell_input(0, 'A1', 'Product'); source.set_cell_input(0, 'B1', 'Amount')
        source.set_cell_input(0, 'A2', 'One'); source.set_cell_input(0, 'B2', '10')
        source.set_cell_input(0, 'A3', 'Two'); source.set_cell_input(0, 'B3', '20')
        source.change_table(0, { kind: 'create', name: 'Sales', range: [0, 0, 2, 1] })
        source.add_sheet('Report')
        source.set_cell_input(1, 'A1', '=Sales[#Headers]')
        source.set_cell_input(1, 'D1', '=Sales[Amount]')
        if (!headersVisible) source.change_table(0, { kind: 'header-row', name: 'Sales', enabled: false })
        const snapshot = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
        restored.restore_persistence_v1(snapshot)
        const header = restored.get_display(1, 'B1')
        const data = restored.get_number(1, 'D2')
        const cleanHistory = !restored.history_apply('undo')
        // 改名、开关和历史在恢复后仍走同一原生事务。
        restored.change_table(0, { kind: 'rename-column', name: 'Sales', column: 'Amount', newName: 'Net' })
        restored.change_table(0, { kind: 'header-row', name: 'Sales', enabled: !headersVisible })
        const toggled = restored.get_display(1, 'B1')
        const table = restored.listTables()[0]
        restored.history_apply('undo')
        const undone = restored.get_display(1, 'B1')
        restored.history_apply('redo')
        const redone = restored.get_display(1, 'B1')
        restored.set_cell_input(0, 'B3', '25')
        return { header, data, cleanHistory, toggled, table, undone, redone,
          updated: restored.get_number(1, 'D2'), body: restored.get_display(0, 'A2') }
      } finally { source.free(); restored.free() }
    }, { url: `${wasmUrl}${variant}/einfach_wasm.js`, visible })
    expect(result.header).toBe(visible ? 'Amount' : '0')
    expect(result.data).toBe(20)
    expect(result.cleanHistory).toBe(true)
    expect(result.toggled).toBe(visible ? '0' : 'Net')
    expect(result.table).toMatchObject({ hasHeaders: !visible,
      range: visible ? 'A2:B3' : 'A1:B3', columns: ['Product', 'Net'] })
    expect(result.undone).toBe(visible ? 'Net' : '0')
    expect(result.redone).toBe(result.toggled)
    expect(result.updated).toBe(25)
    expect(result.body).toBe('One')
  },
)

for (const variant of ['lite', 'full']) test(`${variant} persists locally inserted headers and named arrays`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      for (const [address, value] of [['A1', 'Qty'], ['B1', 'Total'], ['A2', '2'],
        ['B2', '=A2*2'], ['A3', '3'], ['B3', '=A3*2'], ['D2', '99']])
        source.set_cell_input(0, address, value)
      source.change_table(0, { kind: 'create', name: 'Orders', range: [0, 0, 2, 1] })
      source.change_table(0, { kind: 'header-row', name: 'Orders', enabled: false, rowCount: 100 })
      source.set_cell_input(0, 'A1', 'Keep outside')
      source.change_named_range(0, { kind: 'create', name: 'Body', target: { sheet: 0, range: [1, 0, 2, 0] } })
      source.change_table(0, { kind: 'create', name: 'LowerOrders', range: [3, 0, 5, 1] })
      for (const [address, value] of [['A4', 'Qty'], ['B4', 'Amount'], ['A5', '5'],
        ['B5', '=A5*2'], ['A6', '6'], ['B6', '=A6*2']]) source.set_cell_input(0, address, value)
      source.add_sheet('Report'); source.set_cell_input(1, 'A1', '=Body')
      source.set_cell_input(1, 'D1', '=LowerOrders[Amount]')
      const applied = source.applyFilter(0, {
        range: { rowStart: 3, rowEnd: 5, colStart: 0, colEnd: 1 },
        rules: [{ kind: 'range', colIndex: 1, min: 11 }] })
      if (!applied.ok) throw new Error('Filter fixture failed to apply')
      const before = JSON.stringify(source.snapshot_persistence_v1())
      source.change_table(0, { kind: 'header-row', name: 'Orders', enabled: true, rowCount: 100 })
      const inserted = JSON.parse(JSON.stringify(source.snapshot_persistence_v1()))
      source.history_apply('undo')
      const exactUndo = JSON.stringify(source.snapshot_persistence_v1()) === before
      source.history_apply('redo')
      const redone = JSON.stringify(source.snapshot_persistence_v1())
      const exactRedo = redone === JSON.stringify(inserted)
      restored.restore_persistence_v1(inserted)
      const child = restored.get_number(1, 'A2')
      const lowerChild = restored.get_number(1, 'D2')
      const filter = restored.getFilter(0)
      const cleanHistory = !restored.history_apply('undo')
      restored.set_cell_input(0, 'A4', '8')
      restored.set_cell_input(0, 'A7', '9')
      return { exactUndo, exactRedo, child, cleanHistory, names: restored.list_named_ranges(),
        table: restored.listTables().find((table: { name: string }) => table.name === 'Orders'),
        lower: restored.listTables().find((table: { name: string }) => table.name === 'LowerOrders'),
        lowerChild, filter, lowerChanged: restored.get_number(1, 'D2'), outside: restored.get_display(0, 'A1'),
        adjacent: restored.get_number(0, 'D2'), formula: restored.get_number(0, 'B4'),
        changed: restored.get_number(1, 'A2') }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toMatchObject({ exactUndo: true, exactRedo: true, child: 3, cleanHistory: true,
    table: { hasHeaders: true, range: 'A2:B4' }, outside: 'Keep outside', adjacent: 99,
    formula: 16, changed: 8, lower: { range: 'A5:B7' }, lowerChild: 12, lowerChanged: 18 })
  expect(result.names).toEqual([{ name: 'Body', target: { sheet: 0, range: [2, 0, 3, 0] } }])
  expect(result.filter).toMatchObject({ range: { rowStart: 4, rowEnd: 6, colStart: 0, colEnd: 1 },
    hiddenRows: [5], rules: [{ kind: 'range', colIndex: 1, min: 11 }] })
})
