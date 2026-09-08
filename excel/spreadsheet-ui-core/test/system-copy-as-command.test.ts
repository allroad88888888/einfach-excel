import { describe, expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  selectCellAtom,
  setSelectionAtom,
  runVisibleProjectionAtom,
  runSystemClipboardAtom,
  systemClipboardFeedbackAtom,
  projectionSnapshotAtom,
  startCellEditingFromProjectionAtom,
  type RustClipboardExportRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const read = vi.fn(async (request: VisibleProjectionRequest) => ({ ...request, cells: [] }))
  const exportRange = vi.fn(async (_request: RustClipboardExportRequest) => ({
    text: 'exported',
    rows: 10,
    cols: 2,
  }))
  const { store } = createSpreadsheetUi({
    connection: createTestRustWorkbookConnection({
      readVisibleProjection: read,
      exportClipboard: exportRange,
    }),
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', index: 0, name: 'Test', rowCount: 1001, colCount: 16 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 31, colStart: 0, colEnd: 5 },
  })
  return { store, read, exportRange }
}

describe('system Copy As command', () => {
  test.each(['text', 'markdown', 'html'] as const)(
    '%s exports the full selection once without replacing the screen projection',
    async (format) => {
      const { store, read, exportRange } = await setup()
      store.setter(setSelectionAtom, {
        kind: 'range',
        sheetId: 's',
        anchor: { row: 0, col: 0 },
        focus: { row: 1000, col: 1 },
      })
      const before = store.getter(projectionSnapshotAtom)
      const write = vi.fn(async (data) => {
        expect(await data).toMatchObject({ text: 'exported' })
      })
      expect(
        await store.setter(runSystemClipboardAtom, { operation: 'copy-as', format, write }),
      ).toBe(true)
      expect(exportRange).toHaveBeenCalledTimes(1)
      expect(exportRange).toHaveBeenCalledWith({
        sheetId: 's',
        format,
        range: {
          rowStart: 0,
          rowEnd: 1000,
          colStart: 0,
          colEnd: 1,
        },
      })
      expect(write).toHaveBeenCalledTimes(1)
      expect(read).toHaveBeenCalledTimes(1)
      expect(store.getter(projectionSnapshotAtom)).toBe(before)
      expect(store.getter(systemClipboardFeedbackAtom).error).toBe(false)
    },
  )

  test('browser rejection reports failure and leaves the projection intact', async () => {
    const { store } = await setup()
    const before = store.getter(projectionSnapshotAtom)
    expect(
      await store.setter(runSystemClipboardAtom, {
        operation: 'copy-as',
        format: 'html',
        write: async () => {
          throw new Error('Permission denied')
        },
      }),
    ).toBe(false)
    expect(store.getter(systemClipboardFeedbackAtom)).toMatchObject({
      busy: false,
      error: true,
      message: 'Permission denied',
    })
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
  })

  test('editing prevents exporting an uncommitted draft', async () => {
    const { store, exportRange } = await setup()
    store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } })
    expect(
      await store.setter(runSystemClipboardAtom, {
        operation: 'copy-as',
        format: 'text',
        write: async () => {},
      }),
    ).toBe(false)
    expect(exportRange).not.toHaveBeenCalled()
  })
})
