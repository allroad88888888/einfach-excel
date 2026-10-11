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
