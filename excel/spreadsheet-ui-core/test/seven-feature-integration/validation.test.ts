import { expect, test, vi } from 'vitest'
import { writeCellInput } from '../../src/rust-workbook/cell-io'
import { takeValidationErrorDetail } from '../../src/rust-workbook/validation-error-detail'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'

test('explicit validation Continue uses the same native input transaction without implicit retry', () => {
  const normal = vi.fn(() => { throw new Error('DATA_VALIDATION_WARNING') })
  const confirmed = vi.fn()
  const workbook = {
    set_cell_input: normal,
    setCellInputConfirmed: confirmed,
  } as unknown as WasmWorkbook
  expect(() => writeCellInput(workbook, 2, 3, 4, 'bad')).toThrow('DATA_VALIDATION_WARNING')
  expect(confirmed).not.toHaveBeenCalled()
  writeCellInput(workbook, 2, 3, 4, 'bad', false, 'continue')
  expect(confirmed).toHaveBeenCalledExactlyOnceWith(2, 'E4', 'bad', false)
  expect(normal).toHaveBeenCalledTimes(1)
})

test('native validation details are consumed only for exact matching validation failures', () => {
  const detail = { sheet: 0, row: 3, col: 2, style: 'warning', title: 'Review', message: 'Keep draft' }
  const consume = vi.fn(() => detail)
  const workbook = { getLastValidationFailure: consume } as unknown as WasmWorkbook
  const unrelated = new Error('other DATA_VALIDATION_WARNING text')
  expect(takeValidationErrorDetail(workbook, unrelated)).toBe(unrelated)
  expect(consume).not.toHaveBeenCalled()
  const error = takeValidationErrorDetail(workbook, 'auto-fill rejected: DATA_VALIDATION_WARNING') as Error & { detail: unknown }
  expect(error.detail).toEqual(detail)
  expect(consume).toHaveBeenCalledTimes(1)
  const mismatch = takeValidationErrorDetail(workbook, new Error('DATA_VALIDATION_FAILED')) as Error & { detail?: unknown }
  expect(mismatch.detail).toBeUndefined()
})
