import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom,
  toggleGridlinesAtom,
  toggleHeadingsAtom,
  viewportShowGridlinesAtom,
  viewportShowHeadingsAtom,
  workbookDocumentAtom,
  type RustWorkbookConnection,
} from '../src'
import { assertHostCommandAllowed } from '../src/host/policy'
import { setWorkbookSheetView } from '../src/rust-workbook/sheet-management'
import { withSheetTabFacts } from '../src/rust-workbook/sheet-tab-facts'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

const sheet = (id: string, index: number, extra = {}) =>
  ({ id, index, name: id, rowCount: 100, colCount: 10, ...extra })

function setup(sheets = [sheet('a', 0), sheet('b', 1)]) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'T', sheets })
  const respond = vi.fn()
  const request = vi.fn(async (command: string, input: unknown) => respond(command, input))
  store.setter(setRustWorkbookConnectionAtom, {
    request, dispose: vi.fn(),
  } as unknown as RustWorkbookConnection)
  return { store, request, respond }
}

describe('sheet view options', () => {
  test('gridlines and headings follow the active sheet facts', () => {
    const { store } = setup([sheet('a', 0, { hideGridlines: true }), sheet('b', 1)])
    expect(store.getter(viewportShowGridlinesAtom)).toBe(false)
    expect(store.getter(viewportShowHeadingsAtom)).toBe(true)
    expect(store.getter(toggleGridlinesAtom)).toBe(false)
  })

  test('toggling sends one native command for the active sheet and publishes the result', async () => {
    const { store, request, respond } = setup()
    respond.mockResolvedValue({
      sheetId: 'a', revision: 1,
      sheets: [{ id: 'a', name: 'a', index: 0, hideHeadings: true }, { id: 'b', name: 'b', index: 1 }],
    })
    expect(await store.setter(toggleHeadingsAtom)).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('workbook.setSheetView',
      expect.objectContaining({ sheetId: 'a', hideHeadings: true, hideGridlines: undefined }))
    expect(store.getter(viewportShowHeadingsAtom)).toBe(false)
    expect(store.getter(workbookDocumentAtom).sheets[1]?.hideHeadings).toBeFalsy()
  })

  test('a later catalog without the fact shows the option again', async () => {
    const { store, respond } = setup([sheet('a', 0, { hideGridlines: true }), sheet('b', 1)])
    respond.mockResolvedValue({
      sheetId: 'a', revision: 1,
      sheets: [{ id: 'a', name: 'a', index: 0 }, { id: 'b', name: 'b', index: 1 }],
    })
    expect(await store.setter(toggleGridlinesAtom)).toBe(true)
    expect(store.getter(viewportShowGridlinesAtom)).toBe(true)
  })

  test('view options are a persistent change but not sheet structure', () => {
    const readOnly = { readOnly: true, busy: false, allowSheetStructure: true }
    const locked = { readOnly: false, busy: false, allowSheetStructure: false }
    expect(() => assertHostCommandAllowed(readOnly, 'workbook.setSheetView', 'user'))
      .toThrow('HOST_READ_ONLY')
    expect(() => assertHostCommandAllowed(locked, 'workbook.setSheetView', 'user')).not.toThrow()
  })
})

describe('worker sheet view command', () => {
  function fakeWorkbook(initialFlags = 0) {
    let flags = initialFlags
    const set = vi.fn((_index: number, gridlines: boolean, headings: boolean) => {
      const next = Number(gridlines) | (Number(headings) << 1)
      const changed = next !== flags
      flags = next
      return changed
    })
    const workbook = {
      sheet_count: () => 1, sheet_name: () => 'a', sheet_key: () => 'k',
      sheet_view_flags: () => flags, set_sheet_view: set,
    } as unknown as WasmWorkbook
    return { workbook, set }
  }

  test('keeps the option that was not given and only advances the revision on change', () => {
    const { workbook, set } = fakeWorkbook(0b10)
    const known = new Map([['a', { id: 'a', index: 0, name: 'a', key: 'k' }]])
    const first = setWorkbookSheetView(workbook, known, { sheetId: 'a', hideGridlines: true }, 4)
    expect(set).toHaveBeenCalledWith(0, true, true)
    expect(first.revision).toBe(5)
    expect(first.sheets[0]).toMatchObject({ hideGridlines: true, hideHeadings: true })
    expect(setWorkbookSheetView(workbook, known, { sheetId: 'a', hideGridlines: true }, 5).revision)
      .toBe(5)
  })

  test('facts drop stale view fields and only write hidden options', () => {
    const { workbook } = fakeWorkbook(0)
    const stale = { id: 'a', index: 0, name: 'a', hideGridlines: true, hideHeadings: true }
    expect(withSheetTabFacts(stale, workbook, 0)).toEqual({ id: 'a', index: 0, name: 'a' })
  })
})
