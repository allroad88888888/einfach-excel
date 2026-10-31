import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import {
  activeWorkbookSheetAtom,
  duplicateSheetAtom,
  hideSheetAtom,
  initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom,
  setSheetTabColorAtom,
  sheetTabsAtom,
  unhideSheetAtom,
  workbookDocumentAtom,
  adjacentVisibleSheet,
  nearestVisibleSheet,
  type RustWorkbookConnection,
} from '../src'
import { assertHostCommandAllowed } from '../src/host/policy'

const base = (id: string, index: number, extra = {}) => ({
  id, index, name: id, rowCount: 100, colCount: 10, ...extra,
})

function setup(sheets = [base('a', 0), base('b', 1), base('c', 2)]) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'T', sheets })
  const respond = vi.fn()
  const request = vi.fn(async (command: string, input: unknown) => respond(command, input))
  store.setter(setRustWorkbookConnectionAtom, {
    request, dispose: vi.fn(),
  } as unknown as RustWorkbookConnection)
  return { store, request, respond }
}

describe('visible sheet navigation helpers', () => {
  const sheets = [base('a', 0), base('b', 1, { hidden: true }), base('c', 2)]
  test('adjacent skips hidden sheets and does not wrap', () => {
    expect(adjacentVisibleSheet(sheets, 'a', 'next')?.id).toBe('c')
    expect(adjacentVisibleSheet(sheets, 'c', 'previous')?.id).toBe('a')
    expect(adjacentVisibleSheet(sheets, 'c', 'next')).toBeNull()
    expect(adjacentVisibleSheet(sheets, 'a', 'previous')).toBeNull()
  })
  test('nearest visible prefers the right neighbour', () => {
    expect(nearestVisibleSheet(sheets, 0, 'a')?.id).toBe('c')
    expect(nearestVisibleSheet(sheets, 2, 'c')?.id).toBe('a')
  })
})

describe('sheet management commands', () => {
  test('hiding the active sheet sends one native command and activates the nearest visible sheet', async () => {
    const { store, request, respond } = setup()
    respond.mockResolvedValue({
      sheetId: 'a', revision: 1,
      sheets: [
        { id: 'a', name: 'a', index: 0, hidden: true },
        { id: 'b', name: 'b', index: 1 },
        { id: 'c', name: 'c', index: 2 },
      ],
    })
    expect(await store.setter(hideSheetAtom, 'a')).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(
      'workbook.setSheetHidden', expect.objectContaining({ sheetId: 'a', hidden: true }),
    )
    expect(store.getter(workbookDocumentAtom).sheets[0]?.hidden).toBe(true)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('b')
  })

  test('the last visible sheet is refused before any request', async () => {
    const { store, request } = setup([base('a', 0), base('b', 1, { hidden: true })])
    expect(await store.setter(hideSheetAtom, 'a')).toBe(false)
    expect(request).not.toHaveBeenCalled()
    expect(store.getter(sheetTabsAtom).error).toBe('Keep at least one worksheet visible.')
  })

  test('Rust rejection is surfaced and leaves the document untouched', async () => {
    const { store, respond } = setup()
    respond.mockRejectedValue(new Error('Keep at least one worksheet visible.'))
    expect(await store.setter(hideSheetAtom, 'b')).toBe(false)
    expect(store.getter(sheetTabsAtom).error).toBe('Keep at least one worksheet visible.')
    expect(store.getter(sheetTabsAtom).mutation).toBeNull()
    expect(store.getter(workbookDocumentAtom).sheets.every((sheet) => !sheet.hidden)).toBe(true)
  })

  test('unhide restores visibility without changing the active sheet', async () => {
    const { store, respond } = setup([base('a', 0), base('b', 1, { hidden: true })])
    respond.mockResolvedValue({
      sheetId: 'b', revision: 1,
      sheets: [{ id: 'a', name: 'a', index: 0 }, { id: 'b', name: 'b', index: 1 }],
    })
    expect(await store.setter(unhideSheetAtom, 'b')).toBe(true)
    expect(store.getter(workbookDocumentAtom).sheets[1]?.hidden).toBeFalsy()
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('a')
  })

  test('duplicate publishes the Rust copy and activates it', async () => {
    const { store, request, respond } = setup([base('a', 0), base('b', 1)])
    respond.mockResolvedValue({
      sheetId: 'copy', revision: 1,
      sheets: [
        { id: 'a', name: 'a', index: 0 },
        { id: 'copy', name: 'a (2)', index: 1, rowCount: 100, colCount: 10 },
        { id: 'b', name: 'b', index: 2 },
      ],
    })
    expect(await store.setter(duplicateSheetAtom, 'a')).toBe(true)
    expect(request).toHaveBeenCalledWith('workbook.duplicateSheet', expect.objectContaining({ sheetId: 'a' }))
    expect(store.getter(workbookDocumentAtom).sheets.map((s) => s.name)).toEqual(['a', 'a (2)', 'b'])
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('copy')
  })

  test('tab color rejects malformed values locally and clears with null', async () => {
    const { store, request, respond } = setup()
    expect(await store.setter(setSheetTabColorAtom, { sheetId: 'a', color: 'red' })).toBe(false)
    expect(request).not.toHaveBeenCalled()
    respond.mockResolvedValue({
      sheetId: 'a', revision: 1,
      sheets: [
        { id: 'a', name: 'a', index: 0, tabColor: undefined },
        { id: 'b', name: 'b', index: 1 },
        { id: 'c', name: 'c', index: 2 },
      ],
    })
    expect(await store.setter(setSheetTabColorAtom, { sheetId: 'a', color: null })).toBe(true)
    expect(request).toHaveBeenCalledWith(
      'workbook.setSheetTabColor', expect.objectContaining({ color: null }),
    )
  })
})

describe('structure-locked hosts', () => {
  const locked = { readOnly: false, busy: false, allowSheetStructure: false }
  test.each(['workbook.duplicateSheet', 'workbook.setSheetHidden', 'workbook.setSheetTabColor'])(
    '%s is blocked like add and delete',
    (command) => {
      expect(() => assertHostCommandAllowed(locked, command)).toThrow('HOST_STRUCTURE_DISABLED')
      expect(() => assertHostCommandAllowed(locked, 'workbook.editSheet')).toThrow(
        'HOST_STRUCTURE_DISABLED',
      )
      const open = { ...locked, allowSheetStructure: true }
      expect(() => assertHostCommandAllowed(open, command)).not.toThrow()
    },
  )
})
