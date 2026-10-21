import { expect, test, vi } from 'vitest'
import { readCustomFormulas, changeCustomFormula, type RustCustomFormulaCommands } from '../../src/rust-workbook/custom-formulas/command'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'
import { DOUBLE } from './fixture'

test('handlers carry data-only action to native engine and reject stale or wrong-sheet projections', () => {
  const read = vi.fn(() => JSON.stringify([DOUBLE]))
  const change = vi.fn(() => true)
  const workbook = {
    read_custom_formulas: read,
    change_custom_formula: change,
  } as unknown as WasmWorkbook
  const sheets = new Map([['s', { id: 's', index: 3, name: 'Sheet' }]])
  const input: RustCustomFormulaCommands['customFormula.change']['payload'] = {
    sheetId: 's', revision: 4, action: { kind: 'upsert', definition: DOUBLE },
    projection: { kind: 'visible-window', sheetId: 's', requestId: 1,
      window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 5 } },
  }
  expect(readCustomFormulas(workbook, input, 4)).toEqual([DOUBLE])
  expect(changeCustomFormula(workbook, sheets, input, 4)).toBe(true)
  expect(change).toHaveBeenCalledExactlyOnceWith(3, JSON.stringify(input.action))
  change.mockClear()
  expect(() => readCustomFormulas(workbook, { revision: 3 }, 4)).toThrow('changed')
  expect(() => changeCustomFormula(workbook, sheets, { ...input, revision: 3 }, 4)).toThrow('changed')
  expect(() => changeCustomFormula(workbook, sheets, { ...input, sheetId: 'missing' }, 4)).toThrow('exists')
  expect(() => changeCustomFormula(workbook, sheets, { ...input,
    projection: { ...input.projection, sheetId: 'other' } }, 4)).toThrow('projection')
  expect(change).not.toHaveBeenCalled()
})
