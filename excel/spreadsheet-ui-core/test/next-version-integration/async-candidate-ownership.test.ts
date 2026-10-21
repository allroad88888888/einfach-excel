import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../../src/rust-workbook/runtime'
import { EmptyAsyncFormulaWorkbook } from './empty-async-workbook'

afterEach(() => vi.unstubAllGlobals())

test('a rejected async provider candidate frees itself and preserves the previous workbook', async () => {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  const books: Native[] = []
  vi.stubGlobal('self', {
    location: { origin: 'http://localhost' },
    addEventListener: (_: string, callback: typeof receive) => { receive = callback },
    postMessage: post,
  })
  class Native extends EmptyAsyncFormulaWorkbook {
    name = 'Sheet1'
    readonly conflict: boolean
    constructor() {
      super()
      this.conflict = books.length === 1
      books.push(this)
    }

    rename_sheet(_index: number, name: string) { this.name = name; return true }
    sheet_name() { return this.name }

    read_custom_formulas = () => this.conflict ? JSON.stringify([
      { name: 'FETCHJSON', parameters: ['URL'], expression: '=URL' },
    ]) : '[]'

    registerCustomFormulaAsync = vi.fn()
    preview_number_format = () => 'previous workbook'
    free = vi.fn()
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: Native })
  let id = 0
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: ++id, command, payload } })
    return post.mock.lastCall![0]
  }
  expect(await call('workbook.initialize', { sheets: [{ id: 'old', name: 'Previous' }] }))
    .toMatchObject({ ok: true })
  expect(await call('workbook.initialize', { sheets: [{ id: 'candidate', name: 'Conflict' }] }))
    .toMatchObject({ ok: false, error: { message: 'The custom formula name is already in use.' } })
  expect(books[0].free).not.toHaveBeenCalled()
  expect(books[1].free).toHaveBeenCalledOnce()
  expect(books[1].registerCustomFormulaAsync).not.toHaveBeenCalled()
  expect(await call('format.preview', {
    sheetId: 'old', addr: 'A1', numberFormat: { kind: 'general' },
  })).toMatchObject({ ok: true, result: 'previous workbook' })
})
