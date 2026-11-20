import { describe, expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  getProtectionPermissions,
  initializeWorkbookDocumentAtom,
  runSelectionStructureAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  selectionStructureFeedbackAtom,
  setSelectionBoundsAtom,
  setSheetProtectionAtom,
  sortFeedbackAtom,
  sortSelectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import {
  structureProjectionRequest,
  structureSheet,
  structureSizeRange,
} from '../src/rust-workbook/structure-geometry'

describe('protected-sheet sort and structural permissions', () => {
  test('sortSelectionAtom gates protected sorting on permissions.sort AND unlocked range', async () => {
    const calls: string[] = []
    const request = vi.fn(async (command: string, payload: unknown) => {
      calls.push(command)
      if (command === 'range.sort') {
        return {
          movedRows: 2,
          movedCells: 2,
          projection: {
            ...(payload as { projection: VisibleProjectionRequest }).projection,
            revision: 2,
            cells: [],
          },
        }
      }
      return {
        ...(payload as { request: VisibleProjectionRequest }).request,
        revision: 1,
        cells: [],
      }
    })
    const connection: RustWorkbookConnection = {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    }
    const core = createSpreadsheetUi({ connection })
    core.store.setter(initializeWorkbookDocumentAtom, {
      title: 'Book',
      sheets: [{ id: 's1', index: 0, name: 'Sheet1', rowCount: 20, colCount: 10 }],
    })
    core.store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 1, col: 0 } })
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 3, col: 1 }, extend: true })

    // Protected without sort permission -> blocked even on unlocked range
    core.store.setter(setSheetProtectionAtom, {
      sheetId: 's1',
      state: {
        mode: 'protected',
        unlockedRanges: [{ rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 1 }],
      },
    })
    expect(await core.store.setter(sortSelectionAtom, 'asc')).toBe(false)
    expect(core.store.getter(sortFeedbackAtom).error).toBe(
      'Unprotect the worksheet before sorting cells.',
    )

    // Protected WITH sort permission -> allowed on unlocked range
    core.store.setter(setSheetProtectionAtom, {
      sheetId: 's1',
      state: {
        mode: 'protected',
        unlockedRanges: [{ rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 1 }],
        permissions: {
          ...getProtectionPermissions(null),
          sort: true,
        },
      },
    })
    expect(await core.store.setter(sortSelectionAtom, 'asc')).toBe(true)
    expect(calls).toContain('range.sort')

    // Protected WITH sort permission on range overlapping locked row 0 -> blocked without header
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 0, col: 0 } })
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 3, col: 1 }, extend: true })
    expect(await core.store.setter(sortSelectionAtom, 'asc')).toBe(false)
    expect(core.store.getter(sortFeedbackAtom).error).toBe('The selected range cannot be changed.')

    // Protected WITH sort permission and locked header row 0 -> allowed when hasHeader: true
    expect(
      await core.store.setter(sortSelectionAtom, {
        keys: [{ col: 0, direction: 'asc' }],
        hasHeader: true,
      }),
    ).toBe(true)
  })

  test('runSelectionStructureAtom checks per-action protection permissions', async () => {
    const sheet = { id: 's1', key: '1', index: 0, name: 'Sheet1', rowCount: 20, colCount: 10 }
    const visibility = { manualRows: [], manualColumns: [], filterRows: [] }
    const edits: string[] = []
    const request = vi.fn(async (command: string, payload: unknown) => {
      if (command === 'sheet.editStructure') {
        const req = payload as RustWorkbookCommands['sheet.editStructure']['payload']
        edits.push(req.edit.action)
        const next = structureSheet(sheet, req.edit)
        return {
          sheet: next,
          range: structureSizeRange(sheet, next),
          projection: {
            ...structureProjectionRequest(req.projection, next),
            revision: 2,
            cells: [],
            visibility,
          },
          sizes: { rowHeights: [], colWidths: [] },
        }
      }
      return {
        ...(payload as { request: VisibleProjectionRequest }).request,
        revision: 1,
        cells: [],
        visibility,
      }
    })
    const connection: RustWorkbookConnection = {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    }
    const core = createSpreadsheetUi({ connection })
    core.store.setter(initializeWorkbookDocumentAtom, {
      title: 'Book',
      sheets: [sheet],
    })
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 1, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })
    core.store.setter(setSheetProtectionAtom, {
      sheetId: 's1',
      state: {
        mode: 'protected',
        unlockedRanges: [],
        permissions: {
          sort: false,
          insertRows: true,
          insertColumns: false,
          deleteRows: false,
          deleteColumns: false,
        },
      },
    })

    // insert-columns and delete-rows are denied; insert-rows is allowed
    expect(await core.store.setter(runSelectionStructureAtom, 'insert-columns')).toBe(false)
    expect(await core.store.setter(runSelectionStructureAtom, 'delete-rows')).toBe(false)
    const inserted = await core.store.setter(runSelectionStructureAtom, 'insert-rows')
    expect(core.store.getter(selectionStructureFeedbackAtom).error).toBeNull()
    expect(inserted).toBe(true)
    expect(edits).toEqual(['insert-rows'])
  })
})
