import { expect, test } from 'vitest'
import { initializeWorkbook } from '../../src/rust-workbook/initialize-workbook'
import { snapshotRustWorkbookDefinition } from '../../src/runtime/rust-workbook-definition'
import type { RustWasmModule } from '../../src/rust-workbook/wasm-types'

test('initial note and editable ranges are native inputs and startup history is cleared last', () => {
  const calls: unknown[][] = []
  class NativeWorkbook {
    rename_sheet(sheet: number, name: string) { calls.push(['rename', sheet, name]) }
    sheet_name() { return 'Summary' }
    change_note(...input: unknown[]) { calls.push(['note', ...input]) }
    change_protection(...input: unknown[]) { calls.push(['protection', ...input]) }
    history_clear() { calls.push(['clear-history']) }
  }
  const range = { rowStart: 70, rowEnd: 72, colStart: 0, colEnd: 0 }
  const definition = snapshotRustWorkbookDefinition({ title: 'Demo', sheets: [{ id: 'summary',
    name: 'Summary', rowCount: 100, colCount: 8, editableRanges: [range],
    notes: [{ row: 1, col: 1, text: 'native only' }] }], createImportChunks: () => [] })
  range.rowEnd = 80
  expect(definition.sheets[0].editableRanges?.[0].rowEnd).toBe(72)
  initializeWorkbook(
    { WasmWorkbook: NativeWorkbook } as unknown as RustWasmModule,
    definition.sheets,
  )
  expect(calls).toEqual([
    ['rename', 0, 'Summary'], ['note', 0, 1, 1, 'native only'],
    ['protection', 0, { action: 'allow-range', range: { rowStart: 70, rowEnd: 72, colStart: 0, colEnd: 0 } }],
    ['clear-history'],
  ])
  expect(calls.some(call => (call[2] as { action?: string })?.action === 'protect')).toBe(false)
})

test('workbook custom definitions are snapshotted and installed before sheet metadata without startup history', () => {
  const calls: unknown[][] = []
  class NativeWorkbook {
    rename_sheet() { calls.push(['rename']) }
    sheet_name() { return 'Summary' }
    change_custom_formula(sheet: number, action: string) { calls.push(['custom', sheet, JSON.parse(action)]) }
    change_note() { calls.push(['note']) }
    history_clear() { calls.push(['clear-history']) }
  }
  const parameters = ['QUANTITY', 'PRICE']
  const definition = snapshotRustWorkbookDefinition({ title: 'Demo', customFormulas: [
    { name: 'ORDER_NET', parameters, expression: '=QUANTITY*PRICE' },
  ], sheets: [{ id: 'summary', name: 'Summary', rowCount: 100, colCount: 8,
    notes: [{ row: 1, col: 1, text: 'native' }] }], createImportChunks: () => [] })
  parameters[0] = 'CHANGED'
  initializeWorkbook({ WasmWorkbook: NativeWorkbook } as unknown as RustWasmModule,
    definition.sheets, definition.customFormulas)
  expect(calls).toEqual([
    ['rename'], ['custom', 0, { kind: 'upsert', definition: {
      name: 'ORDER_NET', parameters: ['QUANTITY', 'PRICE'], expression: '=QUANTITY*PRICE',
    } }], ['note'], ['clear-history'],
  ])
  expect(Object.isFrozen(definition.customFormulas?.[0].parameters)).toBe(true)
})
