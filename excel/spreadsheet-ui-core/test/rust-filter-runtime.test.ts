import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustFilterReport } from '../src/rust-workbook/filter-commands'

afterEach(() => vi.unstubAllGlobals())
const rules = [{ kind: 'equals', colIndex: 2, value: 'West' }]
const projection = {
  kind: 'visible-window',
  sheetId: 's',
  requestId: 8,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
}
async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => {
      receive = fn
    },
    postMessage: post,
  })
  const apply = vi.fn<(...args: unknown[]) => RustFilterReport>(() => ({
    ok: true,
    hiddenRows: [2, 4],
    scannedRows: 8,
    predicateCells: 16,
  }))
  const reapply = vi.fn(apply),
    clear = vi.fn(apply),
    begin = vi.fn()
  class TestWorkbook {
    rename_sheet() {
      return true
    }

    sheet_name() {
      return 'Orders'
    }

    applyFilter = apply
    reapplyFilter = reapply
    clearFilter = clear
    history_begin = begin
    history_state() {
      return { entries: [], undoCount: 0, redoCount: 0, notice: null }
    }

    sheet_visibility() {
      return { manualRows: [3], manualColumns: [], filterRows: [2, 4], filterRules: rules }
    }

    read_sparse_range() {
      return []
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [{ id: 's', name: 'Orders', rowCount: 100, colCount: 8 }],
  })
  return { call, apply, reapply, clear, begin }
}

test.each(['apply', 'reapply', 'clear'])(
  '%s calls native once and returns the same revision projection',
  async (action) => {
    const { call, apply, reapply, clear, begin } = await runtime()
    expect(await call('sheet.filter', { action, rules, sheetId: 's', projection })).toMatchObject({
      ok: true,
      result: {
        hiddenRows: 2,
        projection: {
          revision: 1,
          filterRules: rules,
          visibility: { manualRows: [3], filterRows: [2, 4] },
        },
      },
    })
    expect(apply).toHaveBeenCalledTimes(1)
    if (action === 'apply') expect(apply).toHaveBeenCalledWith(0, { rules })
    if (action === 'reapply') expect(reapply).toHaveBeenCalledWith(0)
    if (action === 'clear') expect(clear).toHaveBeenCalledWith(0)
    expect(begin).not.toHaveBeenCalled() // 原生筛选命令直接记录索引历史。
  },
)

test('invalid and duplicate columns, bounds, and sheet mismatches never reach native', async () => {
  const { call, apply } = await runtime()
  const invalid = [
    {},
    { rules: [rules[0], rules[0]] },
    { action: 'wrong' },
    { rules: [{ ...rules[0], colIndex: 8 }] },
    { rules: [{ ...rules[0], colIndex: 0.5 }] },
    { rules: [{ kind: 'range', colIndex: 0, min: 5, max: 4 }] },
    { rules: [{ kind: 'range', colIndex: 0 }] },
    { rules: [{ kind: 'range', colIndex: 0, min: NaN }] },
    { rules: [{ kind: 'equals', colIndex: 0, value: null }] },
    { projection: { ...projection, sheetId: 'other' } },
  ]
  for (const patch of invalid)
    expect(
      (
        await call('sheet.filter', {
          sheetId: 's',
          projection,
          action: 'apply',
          ...patch,
        })
      ).ok,
    ).toBe(false)
  expect(apply).not.toHaveBeenCalled()
})

test('native rejection leaves revision unchanged and exposes the original error', async () => {
  const { call, apply } = await runtime()
  apply.mockReturnValueOnce({ ok: false, code: 'source-too-large', message: 'Scan is too large' })
  expect(
    await call('sheet.filter', { sheetId: 's', projection, action: 'apply', rules }),
  ).toMatchObject({ ok: false, error: { message: 'Scan is too large' } })
  expect((await call('projection.readVisible', { request: projection })).result.revision).toBe(0)
})
