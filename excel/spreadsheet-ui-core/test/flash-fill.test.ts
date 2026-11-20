import { describe, expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  directionalFillFeedbackAtom,
  fillSelectionAtom,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  setSelectionBoundsAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

describe('flash fill command and keyboard shortcut', () => {
  test('fillSelectionAtom("flash") allows single-cell selection and rejects multi-column ranges', async () => {
    const payloads: RustWorkbookCommands['range.fill']['payload'][] = []
    const request = vi.fn(async (command: string, payload: unknown) => {
      if (command === 'range.fill') {
        const input = payload as RustWorkbookCommands['range.fill']['payload']
        payloads.push(input)
        return {
          acknowledgement: {
            sheetId: input.request.sheetId,
            requestId: input.request.requestId,
            revision: 2,
            affectedRange: { rowStart: 1, rowEnd: 4, colStart: 1, colEnd: 1 },
          },
          projection: { ...input.projection, revision: 2, cells: [] },
          sizes: { rowHeights: [], colWidths: [] },
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
      title: 'FlashBook',
      sheets: [{ id: 's1', index: 0, name: 'Sheet1', rowCount: 20, colCount: 10 }],
    })
    core.store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    })

    // Single cell selection is accepted for Flash Fill
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 1, col: 1 } })
    expect(await core.store.setter(fillSelectionAtom, 'flash')).toBe(true)
    expect(payloads).toHaveLength(1)
    expect(payloads[0]!.request.flash).toBe(true)
    expect(core.store.getter(directionalFillFeedbackAtom).message).toBe('Flash filled.')

    // Multi-column selection is rejected without sending RPC
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 1, col: 1 } })
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 3, col: 2 }, extend: true })
    expect(await core.store.setter(fillSelectionAtom, 'flash')).toBe(false)
    expect(core.store.getter(directionalFillFeedbackAtom).error).toBe(
      'Select a single column for Flash Fill.',
    )
    expect(payloads).toHaveLength(1)
  })
})
