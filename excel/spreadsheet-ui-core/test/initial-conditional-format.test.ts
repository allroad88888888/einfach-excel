import { expect, test, vi } from 'vitest'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import { initializeWorkbook } from '../src/rust-workbook/initialize-workbook'
import type { RustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

function definition(): RustWorkbookDefinition {
  return {
    title: 'Book',
    sheets: [
      {
        id: 's',
        name: 'Sheet',
        rowCount: 100,
        colCount: 8,
        conditionalFormats: [
          {
            scope: { range: { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 } },
            rule: {
              kind: 'cell-value',
              operator: 'gt',
              value: '2',
              format: { bgColor: '#ffc7ce' },
            },
          },
        ],
      },
    ],
    createImportChunks: () => [],
  }
}

test('seed rule is copied before asynchronous startup and range bounds are validated', () => {
  const source = definition()
  const result = snapshotRustWorkbookDefinition(source)
  const entry = source.sheets[0].conditionalFormats![0]
  entry.scope.range.rowEnd = 120
  entry.rule.format.bgColor = '#000000'
  expect(result.sheets[0].conditionalFormats![0]).toMatchObject({
    scope: { range: { rowEnd: 3 } },
    rule: { format: { bgColor: '#ffc7ce' } },
  })
  expect(Object.isFrozen(result.sheets[0].conditionalFormats![0].rule.format)).toBe(true)
  expect(() => snapshotRustWorkbookDefinition(source)).toThrow('initial conditional-format range')
})

test('seed uses native rule command and startup clears its history once', () => {
  const write = vi.fn(() => ({ revision: 1, rules: [] }))
  const clear = vi.fn()
  class Native {
    rename_sheet() {}
    sheet_name() {
      return 'Sheet'
    }

    setConditionalFormatRule = write
    history_clear = clear
  }
  initializeWorkbook(
    { WasmWorkbook: Native } as unknown as RustWasmModule,
    snapshotRustWorkbookDefinition(definition()).sheets,
  )
  expect(write).toHaveBeenCalledWith(0, {
    ...definition().sheets[0].conditionalFormats![0],
    revision: 0,
    priority: 0,
  })
  expect(clear).toHaveBeenCalledWith('')
  expect(write.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0])
})
