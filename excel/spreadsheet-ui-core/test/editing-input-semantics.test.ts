import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import {
  dispatchEditorKeyboardInputAtom,
  editingSessionAtom,
  insertEditingLineBreakAtom,
} from '../src'
import { bindEditingMutation, startCellEdit } from './editing-test-support'
import { readVisibleProjection } from '../src/rust-workbook/visible-projection'
import { cloneCell } from '../src/backend/projection-helpers'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

describe('editing input semantics', () => {
  test('line break replaces only selected text and returns the caret without a mutation', () => {
    const store = createStore()
    expect(store.setter(insertEditingLineBreakAtom, { start: 0, end: 0 })).toBeNull()
    startCellEdit(store, 'left-selected-right')
    expect(store.setter(insertEditingLineBreakAtom, { start: 5, end: 14 })).toBe(6)
    expect(store.getter(editingSessionAtom).draft).toBe('left-\nright')
  })
  test.each([
    { key: 'Enter', isComposing: true },
    { key: 'Escape', isComposing: true },
    { key: 'Enter', altKey: true },
  ])('keeps the draft and sends no mutation for %j', async (key) => {
    const store = createStore()
    const write = vi.fn(async () => ({ sheetId: 'sheet-1', requestId: 1, revision: 1 }))
    bindEditingMutation(store, write)
    startCellEdit(store, '中文\nsecond')
    expect(await store.setter(dispatchEditorKeyboardInputAtom, key)).toBe('ignored')
    expect(store.getter(editingSessionAtom).draft).toBe('中文\nsecond')
    expect(store.getter(editingSessionAtom).source).not.toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  test('Rust inputText survives visible formatting and cloneCell without a second read', () => {
    const read = vi.fn(() => [
      {
        addr: 'A1',
        sheet: 0,
        display: '125.02',
        inputText: '125.02',
        type: 'number',
        formula: '',
        isError: false,
      },
    ])
    const workbook = {
      read_sparse_range: read,
      snapshot_format_range: () => ({
        cellStyles: [
          { addr: 'A1', format: { numberFormat: { kind: 'currency', symbol: '$', digits: 0 } } },
        ],
        rowStyles: [],
        columnStyles: [],
      }),
    } as unknown as WasmWorkbook
    const result = readVisibleProjection(
      workbook,
      0,
      {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        requestId: 1,
        window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      },
      1,
    )
    expect(cloneCell(result.cells[0]!)).toMatchObject({ displayValue: '$125', inputText: '125.02' })
    expect(read).toHaveBeenCalledTimes(1)
  })
})
