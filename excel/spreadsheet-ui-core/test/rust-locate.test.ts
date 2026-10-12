import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())
test('Worker forwards native classification with the resolved sheet index and does not mutate revision', async () => {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', { addEventListener: (_: string, callback: typeof receive) => { receive = callback }, postMessage: post })
  const range = { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 5 }
  const locate = vi.fn(() => ({ scope: range, ranges: [range], cellCount: 60 }))
  class Book {
    rename_sheet = () => true
    add_sheet = () => 1
    sheet_name = () => 'Sheet'
    locate_cells = locate
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: Book })
  await receive({ data: { id: 1, command: 'workbook.initialize', payload: { sheets: [
    { id: 'a', name: 'First' }, { id: 'b', name: 'Second' },
  ] } } })
  for (const kind of ['constants', 'formulas', 'blanks']) {
    await receive({ data: { id: 2, command: 'workbook.locate', payload: { sheetId: 'b', range, kind, limit: 500 } } })
    expect(locate).toHaveBeenLastCalledWith({ sheet: 1, range, kind, limit: 500 })
    expect(post.mock.lastCall![0]).toMatchObject({
      ok: true, result: { cellCount: 60, revision: 0 },
    })
  }
  await receive({ data: { id: 3, command: 'workbook.locate', payload: { sheetId: 'missing', range, kind: 'blanks', limit: 500 } } })
  expect(post.mock.lastCall![0]).toMatchObject({ ok: false })
  expect(locate).toHaveBeenCalledTimes(3)
  locate.mockImplementationOnce(() => { throw new Error('Too many separate areas') })
  await receive({ data: { id: 4, command: 'workbook.locate', payload: { sheetId: 'b', range, kind: 'blanks', limit: 500 } } })
  expect(post.mock.lastCall![0]).toMatchObject({ ok: false, error: { message: 'Too many separate areas' } })
})
