import { afterEach, describe, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

afterEach(() => vi.unstubAllGlobals())

async function runtime() {
  let onMessage!: (event: { data: unknown }) => Promise<void>
  const posted = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_type: string, callback: typeof onMessage) => {
      onMessage = callback
    },
    postMessage: posted,
  })
  const names = ['Orders']
  const edit = vi.fn((index: number | undefined, name: string) => {
    if (name === 'invalid') throw new Error('Invalid sheet name')
    const target = index ?? names.length
    names[target] = name
    return target
  })
  class TestWorkbook {
    rename_sheet(index: number, name: string) {
      names[index] = name
      return true
    }

    sheet_name(index: number) {
      return names[index]
    }

    edit_sheet = edit

    remove_sheet(index: number) {
      names.splice(index, 1)
      return true
    }

    move_sheet(from: number, to: number) {
      const [name] = names.splice(from, 1)
      names.splice(to, 0, name!)
      return true
    }

    read_sparse_range() {
      return []
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }

    snapshotCell() {
      return { display: '', formula: '', type: 'null' }
    }
  }
  installRustWorkbookRuntime({
    default: async () => {},
    WasmWorkbook: TestWorkbook,
  } as unknown as RustWasmModule)
  const call = async (command: string, payload: unknown) => {
    await onMessage({ data: { id: posted.mock.calls.length + 1, command, payload } })
    return posted.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 'orders', name: 'Orders' }] })
  return { call, edit, names }
}

const projection = {
  kind: 'visible-window',
  sheetId: 'orders',
  requestId: 5,
  window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
  reason: 'viewport',
}

describe('Rust sheet command transport', () => {
  test('reordering and deletion keep surviving IDs correctly mapped to native indices', async () => {
    const { call, edit } = await runtime()
    const first = await call('workbook.editSheet', { name: 'Budget' })
    const budget = first.result.sheet.id
    const moved = await call('workbook.changeSheets', {
      operation: 'move',
      sheetId: budget,
      targetIndex: 0,
      projection,
    })
    expect(moved.ok).toBe(true)
    expect(moved.result.sheets).toEqual([
      { id: budget, name: 'Budget', index: 0 },
      { id: 'orders', name: 'Orders', index: 1 },
    ])
    expect(moved.result.projection).toMatchObject({ sheetId: 'orders', revision: 2, requestId: 5 })
    const deleted = await call('workbook.changeSheets', {
      operation: 'delete',
      sheetId: budget,
      projection,
    })
    expect(deleted.result.sheets).toEqual([{ id: 'orders', name: 'Orders', index: 0 }])
    expect(deleted.result.projection).toMatchObject({ sheetId: 'orders', revision: 3 })
    await call('workbook.editSheet', { sheetId: 'orders', name: 'Renamed' })
    expect(edit).toHaveBeenLastCalledWith(0, 'Renamed')
    expect((await call('workbook.editSheet', { sheetId: budget, name: 'Removed' })).ok).toBe(false)
    expect(
      (await call('workbook.changeSheets', { operation: 'delete', sheetId: 'orders' })).ok,
    ).toBe(false)
  })

  test('invalid structural requests do not mutate native state or advance revision', async () => {
    const { call, names } = await runtime()
    for (const targetIndex of [-1, 1, 0.5]) {
      expect(
        (await call('workbook.changeSheets', { operation: 'move', sheetId: 'orders', targetIndex }))
          .ok,
      ).toBe(false)
    }
    const added = await call('workbook.editSheet', { name: 'Budget' })
    expect(added.result.revision).toBe(1)
    expect(
      (await call('workbook.changeSheets', { operation: 'delete', sheetId: 'orders', projection }))
        .ok,
    ).toBe(false)
    expect(names).toEqual(['Orders', 'Budget'])
  })
  test('add returns a unique stable identity backed by the same native workbook', async () => {
    const { call, edit } = await runtime()
    const added = await call('workbook.editSheet', { name: 'Budget' })
    expect(added.ok).toBe(true)
    expect(added.result.sheet).toMatchObject({ index: 1, name: 'Budget' })
    expect(added.result.sheet.id).not.toBe('orders')
    expect(edit).toHaveBeenCalledTimes(1)
    expect(edit).toHaveBeenCalledWith(undefined, 'Budget')
    const renamed = await call('workbook.editSheet', {
      sheetId: added.result.sheet.id,
      name: 'Costs',
    })
    expect(renamed.result.sheet).toEqual({ ...added.result.sheet, name: 'Costs' })
    expect(edit).toHaveBeenLastCalledWith(1, 'Costs')
  })

  test('rename returns the rewritten visible projection with the same revision in one response', async () => {
    const { call, edit } = await runtime()
    const response = await call('workbook.editSheet', {
      sheetId: 'orders',
      name: 'Costs',
      projection,
    })
    expect(response.ok).toBe(true)
    expect(edit).toHaveBeenCalledTimes(1)
    expect(edit).toHaveBeenCalledWith(0, 'Costs')
    expect(response.result).toMatchObject({
      sheet: { id: 'orders', index: 0, name: 'Costs' },
      revision: 1,
      projection: { sheetId: 'orders', requestId: 5, revision: 1 },
    })
  })

  test('invalid input preserves metadata and revision for a subsequent retry', async () => {
    const { call, names } = await runtime()
    const failure = await call('workbook.editSheet', { sheetId: 'orders', name: 'invalid' })
    expect(failure).toMatchObject({ ok: false, error: { message: 'Invalid sheet name' } })
    expect(names).toEqual(['Orders'])
    const retry = await call('workbook.editSheet', { sheetId: 'orders', name: 'Costs' })
    expect(retry.result).toMatchObject({
      revision: 1,
      sheet: { id: 'orders', index: 0, name: 'Costs' },
    })
  })

  test('unknown sheet or projection target is rejected before calling native mutation', async () => {
    const { call, edit } = await runtime()
    expect((await call('workbook.editSheet', { sheetId: 'missing', name: 'Costs' })).ok).toBe(false)
    expect(
      (
        await call('workbook.editSheet', {
          name: 'Costs',
          projection: { ...projection, sheetId: 'missing' },
        })
      ).ok,
    ).toBe(false)
    expect(edit).not.toHaveBeenCalled()
  })
})
