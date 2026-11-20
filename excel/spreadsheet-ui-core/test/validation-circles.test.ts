import { describe, expect, test, vi } from 'vitest'
import { isPersistentHostCommand } from '../src/host/policy'
import { listInvalidValidationCells } from '../src/rust-workbook/data-validation-commands'
import {
  activateSheetTabAtom,
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runValidationCirclesAtom,
  runVisibleProjectionAtom,
  validationCirclesAtom,
  type InvalidValidationReport,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

describe('validation circles UI core', () => {
  test('policy treats validation.listInvalid as read-only and IO bounds maxCount', () => {
    expect(isPersistentHostCommand('validation.listInvalid')).toBe(false)
    const workbook = {
      listInvalidValidationCells: vi.fn(
        (_sheet: number, maxCount: number): InvalidValidationReport => ({
          cells: [{ row: 1, col: 0 }],
          truncated: maxCount < 2,
        }),
      ),
    } as never

    const bounded = listInvalidValidationCells(workbook, 0, 5000, 4)
    expect(workbook.listInvalidValidationCells).toHaveBeenCalledWith(0, 1000)
    expect(bounded).toEqual({ cells: [{ row: 1, col: 0 }], truncated: false, revision: 4 })
  })

  test('circle, refresh on new revision, clear while in flight, and isolate per sheet', async () => {
    let revision = 1
    let invalidCells = [{ row: 1, col: 0 }, { row: 3, col: 2 }]
    let holdNext: ((value: unknown) => void) | null = null

    const request = vi.fn(async (command: string, payload: unknown) => {
      if (command === 'validation.listInvalid') {
        if (holdNext) {
          return new Promise((resolve) => {
            const done = holdNext
            holdNext = null
            done?.(resolve)
          })
        }
        return { cells: invalidCells, truncated: false, revision }
      }
      return {
        ...(payload as { request: VisibleProjectionRequest }).request,
        revision,
        cells: [],
      }
    })
    const connection: RustWorkbookConnection = {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    }

    const core = createSpreadsheetUi({ connection })
    core.store.setter(initializeWorkbookDocumentAtom, {
      title: 'Test',
      sheets: [
        { id: 's1', index: 0, name: 'Sheet1', rowCount: 50, colCount: 10 },
        { id: 's2', index: 1, name: 'Sheet2', rowCount: 50, colCount: 10 },
      ],
    })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })

    expect(core.store.getter(validationCirclesAtom).active).toBe(false)
    await core.store.setter(runValidationCirclesAtom, 'circle')
    expect(core.store.getter(validationCirclesAtom)).toMatchObject({
      sheetId: 's1',
      active: true,
      busy: false,
      cells: [{ row: 1, col: 0 }, { row: 3, col: 2 }],
      revision: 1,
    })

    // Refresh at same revision is a no-op
    expect(core.store.setter(runValidationCirclesAtom, 'refresh')).toBe(false)

    // Advance revision and refresh updates circles
    revision = 2
    invalidCells = [{ row: 3, col: 2 }]
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })
    await core.store.setter(runValidationCirclesAtom, 'refresh')
    expect(core.store.getter(validationCirclesAtom).cells).toEqual([{ row: 3, col: 2 }])

    // Switching to Sheet2 shows inactive circles; switching back preserves Sheet1 circles
    core.store.setter(activateSheetTabAtom, { sheetId: 's2' })
    expect(core.store.getter(validationCirclesAtom).active).toBe(false)
    core.store.setter(activateSheetTabAtom, { sheetId: 's1' })
    expect(core.store.getter(validationCirclesAtom).active).toBe(true)

    // Clearing while a refresh is in flight drops the late response
    let resolveLate!: (value: unknown) => void
    holdNext = (resolver) => {
      resolveLate = resolver as (value: unknown) => void
    }
    revision = 3
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })
    const pending = core.store.setter(runValidationCirclesAtom, 'refresh')
    expect(core.store.getter(validationCirclesAtom).busy).toBe(true)
    expect(core.store.setter(runValidationCirclesAtom, 'clear')).toBe(true)
    expect(core.store.getter(validationCirclesAtom).active).toBe(false)
    resolveLate({ cells: [{ row: 0, col: 0 }], truncated: false, revision: 3 })
    expect(await pending).toBe(false)
    expect(core.store.getter(validationCirclesAtom).active).toBe(false)
  })
})
