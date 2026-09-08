import { describe, expect, test, vi } from 'vitest'
import { displayCell, writeCellInput } from '../src/rust-workbook/cell-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

describe('Rust cell input boundary', () => {
  test.each(["'00123", "'=1+2", "'", ' FaLsE ', '12.50%', '0.125', '=SUM(A1:A3)', '', '  '])(
    'sends %j unchanged in one native write',
    (input) => {
      const write = vi.fn()
      const workbook = { set_cell_input: write } as unknown as WasmWorkbook
      writeCellInput(workbook, 2, 9, 27, input)
      expect(write).toHaveBeenCalledTimes(1)
      expect(write).toHaveBeenCalledWith(2, 'AB10', input)
      expect(write.mock.contexts[0]).toBe(workbook)
    },
  )

  test('does not retry or fall back after a native rejection', () => {
    const rejection = 'INVALID_FORMULA'
    const write = vi.fn(() => {
      throw rejection
    })
    const workbook = { set_cell_input: write } as unknown as WasmWorkbook
    let caught: unknown
    try {
      writeCellInput(workbook, 0, 0, 0, '=SUM(')
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(rejection)
    expect(write).toHaveBeenCalledTimes(1)
  })

  test('requires the unified Rust input method', () => {
    expect(() => writeCellInput({} as WasmWorkbook, 0, 0, 0, '1')).toThrow(
      'WasmWorkbook.set_cell_input is unavailable',
    )
  })

  test.each([
    { type: 'text', display: '00123', inputText: "'00123", valueKind: 'string' },
    { type: 'text', display: '', inputText: "'", valueKind: 'string' },
    { type: 'boolean', display: 'FALSE', inputText: 'FALSE', valueKind: 'boolean' },
    { type: 'number', display: '0.125', inputText: '0.125', valueKind: 'number' },
  ] as const)('preserves native edit text and kind: $type / $inputText', (cell) => {
    expect(
      displayCell({ sheet: 0, addr: 'A1', isError: false, formula: '', ...cell }),
    ).toMatchObject({
      row: 0,
      col: 0,
      displayValue: cell.display,
      inputText: cell.inputText,
      valueKind: cell.valueKind,
    })
  })
})
