import { expect, test, vi } from 'vitest'
import { changeStructure } from '../src/rust-workbook/structure-io'
import { applyRustHistory } from '../src/rust-workbook/history-apply'
import { STRUCTURE_ACTIONS, type StructuralEdit } from '../src/rust-workbook/structure-geometry'
import type { RustWorkbookSheet } from '../src/rust-workbook/commands'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'
import type { VisibleProjectionRequest } from '../src/backend'

const orders = { id: 'orders', key: '1', index: 0, name: 'Orders', rowCount: 100, colCount: 8 }
const summary = { id: 'summary', key: '2', index: 1, name: 'Summary', rowCount: 12, colCount: 2 }
const projection: VisibleProjectionRequest = {
  kind: 'visible-window',
  sheetId: orders.id,
  reason: 'toolbar',
  requestId: 1,
  window: { rowStart: 90, rowEnd: 99, colStart: 4, colEnd: 7 },
}

function setup(edit: StructuralEdit = { action: 'insert-rows', at: 90, count: 2 }) {
  const known = new Map<string, RustWorkbookSheet>([orders, summary].map((s) => [s.id, s]))
  const state = {
    undoCount: 1,
    redoCount: 0,
    notice: null,
    entries: [
      {
        label: 'Structure',
        sheetIndex: 0,
        sheetKey: '1',
        structuralEdit: edit,
        range: { rowStart: 90, rowEnd: 91, colStart: 0, colEnd: 7 },
      },
    ],
  }
  const native = {
    edit_structure: vi.fn(() => true),
    history_apply: vi.fn(() => true),
    history_state: () => state,
    sheet_key: (i: number) => [orders, summary][i]!.key,
    sheet_count: () => 2,
    sheet_name: (i: number) => [orders, summary][i]!.name,
    read_sparse_range: vi.fn(() => []),
    snapshot_format_range: () => ({ cellStyles: [], rowStyles: [], columnStyles: [] }),
    snapshot_viewport_sizes: vi.fn(() => ({
      rowHeights: [{ rowIndex: 95, heightPx: 60 }],
      colWidths: [],
    })),
    sheet_visibility: () => ({ manualRows: [96], manualColumns: [], filterRows: [] }),
  }
  return { known, native, state, workbook: native as unknown as WasmWorkbook }
}

test.each(STRUCTURE_ACTIONS)('%s calls native once and publishes changed bounds', (action) => {
  const r = setup()
  const result = changeStructure(
    r.workbook,
    r.known,
    {
      sheetId: orders.id,
      edit: { action, at: 2, count: 2 },
      projection,
    },
    5,
  )
  expect(r.native.edit_structure).toHaveBeenCalledTimes(1)
  expect(r.native.edit_structure).toHaveBeenCalledWith(0, action, 2, 2)
  const delta = action.startsWith('insert') ? 2 : -2
  expect(result.sheet.rowCount).toBe(100 + (action.endsWith('rows') ? delta : 0))
  expect(result.sheet.colCount).toBe(8 + (action.endsWith('columns') ? delta : 0))
  expect(result.projection.revision).toBe(5)
  expect(result.projection.window.rowEnd).toBeLessThan(result.sheet.rowCount!)
  expect(result.projection.window.colEnd).toBeLessThan(result.sheet.colCount!)
  expect(result.range.rowEnd).toBe(Math.max(100, result.sheet.rowCount!) - 1)
  expect(result.range.colEnd).toBe(Math.max(8, result.sheet.colCount!) - 1)
  expect(r.known.get('summary')).toBe(summary)
})

test('undo restores bounds and reads the whole moved tail, not just the inserted band', () => {
  const r = setup()
  r.known.set('orders', { ...orders, rowCount: 102 })
  const result = applyRustHistory(
    r.workbook,
    r.known,
    {
      direction: 'undo',
      projection: { ...projection, window: { ...projection.window, rowStart: 92, rowEnd: 101 } },
    },
    8,
  )
  expect(r.native.history_apply).toHaveBeenCalledTimes(1)
  expect(r.native.history_apply).toHaveBeenCalledWith('undo')
  expect(result.sheets).toEqual([orders, summary])
  expect(result.range).toEqual({ rowStart: 0, colStart: 0, rowEnd: 101, colEnd: 7 })
  expect(r.native.snapshot_viewport_sizes).toHaveBeenCalledWith(0, 0, 0, 101, 7)
  expect(result.projection.window).toEqual(projection.window)
  expect(result.visibility?.manualRows).toEqual([96])
})

test('redo while viewing another sheet changes only the affected canvas', () => {
  const r = setup({ action: 'delete-columns', at: 6, count: 2 })
  r.state.undoCount = 0
  r.state.redoCount = 1
  const request = {
    ...projection,
    sheetId: 'summary',
    window: { rowStart: 0, rowEnd: 11, colStart: 0, colEnd: 1 },
  }
  const result = applyRustHistory(
    r.workbook,
    r.known,
    { direction: 'redo', projection: request },
    9,
  )
  expect(r.native.history_apply).toHaveBeenCalledTimes(1)
  expect(r.native.history_apply).toHaveBeenCalledWith('redo')
  expect(result.sheets?.[0]?.colCount).toBe(6)
  expect(result.sheets?.[1]).toEqual(summary)
  expect(result.projection).toMatchObject({ sheetId: 'summary', window: request.window })
  expect(result.sheetId).toBe('orders')
})

test.each([
  { action: 'delete-rows', at: 0, count: 100 },
  { action: 'insert-rows', at: -1, count: 1 },
  { action: 'insert-columns', at: 9, count: 1 },
  { action: 'insert-columns', at: 1, count: 0 },
  { action: 'insert-columns', at: 1, count: 0.5 },
  { action: 'insert-columns', at: 1, count: 16_384 },
] as const)('rejects invalid geometry before native mutation: %o', (edit) => {
  const r = setup()
  expect(() =>
    changeStructure(r.workbook, r.known, { sheetId: orders.id, edit, projection }, 1),
  ).toThrow()
  expect(r.native.edit_structure).not.toHaveBeenCalled()
  expect(r.known.get('orders')).toBe(orders)
})

test('native failure leaves host bounds intact and the command can retry', () => {
  const r = setup()
  r.native.edit_structure.mockImplementationOnce(() => {
    throw new Error('Overflow')
  })
  const input = { sheetId: orders.id, edit: r.state.entries[0]!.structuralEdit!, projection }
  expect(() => changeStructure(r.workbook, r.known, input, 1)).toThrow('Overflow')
  expect(r.known.get('orders')).toBe(orders)
  expect(changeStructure(r.workbook, r.known, input, 1).sheet.rowCount).toBe(102)
})

test('invalid history window and missing projection API cannot consume native undo', () => {
  const r = setup()
  const input = { direction: 'undo' as const, projection }
  expect(() =>
    applyRustHistory(
      r.workbook,
      r.known,
      {
        ...input,
        projection: { ...projection, window: { ...projection.window, rowStart: NaN } },
      },
      1,
    ),
  ).toThrow('Invalid projection window')
  r.workbook.snapshot_format_range = undefined
  expect(() => applyRustHistory(r.workbook, r.known, input, 1)).toThrow('unavailable')
  expect(r.native.history_apply).not.toHaveBeenCalled()
})
