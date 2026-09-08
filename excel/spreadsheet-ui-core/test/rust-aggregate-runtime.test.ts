import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())

async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => { receive = fn },
    postMessage: post,
  })
  const aggregate = vi.fn((_targets: unknown) => ({
    count: 12, numericCount: 10, sum: 100, average: 10, min: 10, max: 10,
  }))
  class Workbook {
    names = ['Sheet']
    rename_sheet() { return true }
    sheet_name(index: number) { return this.names[index] }
    add_sheet(name: string) { this.names.push(name); return this.names.length - 1 }
    aggregate_selection = aggregate
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: Workbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
  return { call, aggregate }
}

test('maps stable sheet IDs and forwards full geometry in one native read', async () => {
  const r = await setup()
  const range = { rowStart: 0, rowEnd: 1_048_575, colStart: 0, colEnd: 0 }
  const input = { targets: [{ sheetId: 'b', range }, { sheetId: 'a', range }] }
  const expected = {
    ok: true,
    result: { count: 12, numericCount: 10, sum: 100, average: 10, min: 10, max: 10, revision: 0 },
  }
  expect(await r.call('selection.aggregate', input)).toMatchObject(expected)
  expect(r.aggregate).toHaveBeenCalledWith([{ ...range, sheet: 1 }, { ...range, sheet: 0 }])
  expect(r.aggregate).toHaveBeenCalledTimes(1)
  expect(await r.call('selection.aggregate', input)).toMatchObject(expected)
})

test('unknown sheets fail before native reads; native rejection is returned unchanged', async () => {
  const r = await setup()
  const range = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 }
  expect(await r.call('selection.aggregate', { targets: [{ sheetId: 'missing', range }] }))
    .toMatchObject({ ok: false, error: { code: 'INVALID_SHEET' } })
  expect(r.aggregate).not.toHaveBeenCalled()
  r.aggregate.mockImplementationOnce(() => { throw new Error('Invalid aggregate range.') })
  expect(await r.call('selection.aggregate', { targets: [{ sheetId: 'a', range }] }))
    .toMatchObject({ ok: false, error: { message: 'Invalid aggregate range.' } })
})
