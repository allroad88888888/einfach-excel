import { describe, expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom, runSystemClipboardAtom,
  runVisibleProjectionAtom, selectCellAtom, systemClipboardFeedbackAtom,
} from '../../src'
import { clipboardErrorMessage } from '../../src/clipboard/system-clipboard-command'
import { activateWorkbookSheetAtom } from '../../src/runtime/activate-workbook-sheet'
import { setupClipboardStore } from '../support/system-clipboard-store'

async function setup() {
  const context = await setupClipboardStore()
  context.store.setter(initializeWorkbookDocumentAtom, {
    title: 'Move', sheets: [
      { id: 'sheet-1', index: 0, name: 'Source', rowCount: 10, colCount: 5 },
      { id: 'sheet-2', index: 1, name: "Target O'Brien", rowCount: 10, colCount: 5 },
    ],
  })
  context.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await context.store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  })
  return context
}

describe('XSCUT cross-sheet clipboard command', () => {
  test('confirmed cut stays native and its token is forwarded after sheet activation', async () => {
    const { store, capture, finish, paste } = await setup()
    expect(await store.setter(runSystemClipboardAtom, {
      operation: 'cut', write: async (pending) => { await pending },
    })).toBe(true)
    expect(capture.mock.calls[0][0]).toMatchObject({ sheetId: 'sheet-1', cut: true })
    expect(finish).toHaveBeenCalledWith({ token: 'snapshot-token', commit: true })
    store.setter(activateWorkbookSheetAtom, {
      id: 'sheet-2', index: 1, name: "Target O'Brien", rowCount: 10, colCount: 5,
    })
    store.setter(selectCellAtom, { sheetId: 'sheet-2', coord: { row: 3, col: 2 } })
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-2', reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
    })
    expect(await store.setter(runSystemClipboardAtom, {
      operation: 'paste', read: async () => ({ text: 'old', token: 'snapshot-token' }),
    })).toBe(true)
    expect(paste).toHaveBeenCalledTimes(1)
    expect(paste.mock.calls[0][0]).toMatchObject({ sheetId: 'sheet-2', row: 3, col: 2, token: 'snapshot-token' })
    expect(paste.mock.calls[0][0]).not.toHaveProperty('cells')
  })

  test('browser failure discards the pending cut without sending a mutation', async () => {
    const { store, finish, paste } = await setup()
    const write = vi.fn(async (pending) => { await pending; throw new Error('Clipboard denied') })
    expect(await store.setter(runSystemClipboardAtom, { operation: 'cut', write })).toBe(false)
    expect(finish).toHaveBeenCalledWith({ token: 'snapshot-token', commit: false })
    expect(paste).not.toHaveBeenCalled()
    expect(store.getter(systemClipboardFeedbackAtom).message).toBe('Clipboard denied')
  })

  test.each([
    'CLIPBOARD_CROSS_SHEET_MERGE', 'CLIPBOARD_CROSS_SHEET_TABLE',
    'CLIPBOARD_CROSS_SHEET_NAMED_RANGE',
  ])('%s explains the atomic rejection', (code) => {
    expect(clipboardErrorMessage(new Error(code))).toContain('No cells were moved.')
  })
})
