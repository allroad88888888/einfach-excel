import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())

async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => { receive = fn }, postMessage: post,
  })
  const fill = vi.fn(() => ({ written: 6 }))
  const begin = vi.fn()
  const finish = vi.fn()
  const sizes = vi.fn(() => ({ rowHeights: [], colWidths: [] }))
  class TestWorkbook {
    rename_sheet() { return true }
    sheet_name() { return 'Orders' }
    apply_auto_fill = fill
    history_begin = begin
    history_finish = finish
    snapshot_viewport_sizes = sizes
    read_sparse_range() { return [] }
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 's', name: 'Orders' }] })
  return { call, fill, begin, finish, sizes }
}
const range = { rowStart: 50, rowEnd: 53, colStart: 1, colEnd: 2 }
const projection = {
  kind: 'visible-window', sheetId: 's', requestId: 8,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
}
const input = { request: { sheetId: 's', requestId: 8, range, direction: 'down' }, projection }

test.each(['down', 'right'])('%s copies only the first axis through one native call', async (direction) => {
  const { call, fill, begin, finish, sizes } = await runtime()
  const reply = await call('range.fill', { ...input, request: { ...input.request, direction } })
  expect(reply).toMatchObject({ ok: true, result: {
    acknowledgement: { sheetId: 's', requestId: 8, revision: 1 },
    projection: { sheetId: 's', requestId: 8, revision: 1 },
    sizes: { rowHeights: [], colWidths: [] },
  } })
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill).toHaveBeenCalledWith({
    sheet: 0, direction, series: 'copy',
    sourceRange: {
      startRow: 50, startCol: 1, endRow: direction === 'down' ? 50 : 53,
      endCol: direction === 'down' ? 2 : 1,
    },
    targetRange: { startRow: 50, startCol: 1, endRow: 53, endCol: 2 },
  })
  expect(begin).toHaveBeenCalledTimes(1)
  expect(begin).toHaveBeenCalledWith(
    0, direction === 'down' ? 51 : 50, direction === 'down' ? 1 : 2, 53, 2,
    `Fill ${direction}`, true,
  )
  expect(finish).toHaveBeenCalledTimes(1)
  expect(finish).toHaveBeenCalledWith(true)
  expect(sizes).toHaveBeenCalledWith(0, 50, 1, 53, 2)
})

test('invalid ranges, sheet mismatch and direction are rejected before history snapshots', async () => {
  const { call, fill, begin } = await runtime()
  for (const invalid of [
    { ...range, rowStart: -1 }, { ...range, rowEnd: 0 }, { ...range, rowEnd: 1.5 },
    { ...range, rowEnd: 2 ** 32 }, { ...range, colEnd: 16384 },
    { ...range, rowStart: 0, rowEnd: 1048575 }, { ...range, rowEnd: 50 },
  ]) expect((await call('range.fill', { ...input,
    request: { ...input.request, range: invalid },
  })).ok).toBe(false)
  expect((await call('range.fill', { ...input,
    request: { ...input.request, direction: 'left' },
  })).ok).toBe(false)
  expect((await call('range.fill', { ...input,
    projection: { ...projection, sheetId: 'other' },
  })).ok).toBe(false)
  expect(fill).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})

test('native rejection cancels history without advancing revision; retry works', async () => {
  const { call, fill, finish } = await runtime()
  fill.mockImplementationOnce(() => { throw new Error('unmerge cells before filling this range') })
  expect(await call('range.fill', input)).toMatchObject({ ok: false })
  expect(finish).toHaveBeenLastCalledWith(false)
  expect((await call('projection.readVisible', { request: projection })).result.revision).toBe(0)
  expect((await call('range.fill', input)).ok).toBe(true)
  expect(finish).toHaveBeenLastCalledWith(true)
  expect((await call('projection.readVisible', { request: projection })).result.revision).toBe(1)
})

test.each(['number', 'text-number', 'linear-trend'])(
  '%s transmits inference intent without sample values or JS-derived parameters', async (kind) => {
    const { call, fill, begin } = await runtime()
    const series = { kind, sourceCount: kind === 'linear-trend' ? 3 : 2 }
    const single = { ...range, colEnd: 1, rowEnd: 100 }
    expect((await call('range.fill', {
      ...input, request: { ...input.request, range: single, series },
    })).ok).toBe(true)
    expect(fill).toHaveBeenCalledTimes(1)
    expect(fill).toHaveBeenCalledWith({
      sheet: 0, direction: 'down', infer: true,
      series: kind === 'number' ? 'integer-step' : kind,
      sourceRange: { startRow: 50, endRow: 49 + series.sourceCount, startCol: 1, endCol: 1 },
      targetRange: { startRow: 50, endRow: 100, startCol: 1, endCol: 1 },
    })
    expect(begin).toHaveBeenCalledWith(0, 50 + series.sourceCount, 1, 100, 1,
      `Fill ${kind} series`, true)
  },
)

test('invalid series geometry and counts fail before history allocation', async () => {
  const { call, begin, fill } = await runtime()
  for (const sourceCount of [NaN, -1, 1, 1.5, 4, 2 ** 32]) {
    expect((await call('range.fill', { ...input, request: {
      ...input.request, range: { ...range, colEnd: 1 }, series: { kind: 'number', sourceCount },
    } })).ok).toBe(false)
  }
  expect((await call('range.fill', { ...input, request: {
    ...input.request, series: { kind: 'number', sourceCount: 2 },
  } })).ok).toBe(false)
  expect(fill).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})
