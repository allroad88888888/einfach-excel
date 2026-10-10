import { expect, test, vi } from 'vitest'
import {
  applySelectionFormatAtom, createSpreadsheetUi, runVisibleProjectionAtom, selectionAtom,
  setSelectionBoundsAtom,
  type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup(kind: 'cell' | 'range' | 'row' | 'column') {
  const project = (request: VisibleProjectionRequest, revision = 1) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    revision, window: request.window, cells: [],
  })
  const write = vi.fn(async (
    request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 2 },
    projection: project(projection, 2),
  }))
  const core = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    readVisibleProjection: async (request) => project(request), setRangeFormat: write,
  }) })
  core.store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
  core.store.setter(selectionAtom, kind === 'row'
    ? { kind, sheetId: 's', rowAnchor: 1, rowFocus: 3 }
    : kind === 'column'
      ? { kind, sheetId: 's', colAnchor: 2, colFocus: 4 }
      : { kind, sheetId: 's', anchor: { row: 1, col: 2 }, focus: { row: 3, col: 4 } })
  await core.store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }, reason: 'viewport',
  })
  return { store: core.store, write }
}

for (const [type, field] of [['fill-color', 'bgColor'], ['text-color', 'fgColor']] as const) {
  test.each(['cell', 'range', 'row', 'column'] as const)(
    `${type} preserves the %s target scope and uses one Rust patch`, async (kind) => {
      const { store, write } = await setup(kind)
      expect(await store.setter(applySelectionFormatAtom, { type, value: '#ABCDEF' }))
        .toBe('completed')
      expect(write).toHaveBeenCalledTimes(1)
      expect(write.mock.calls[0]![0]).toMatchObject({
        scope: kind === 'range' ? 'cell' : kind,
        format: { [field]: '#abcdef' }, writeMode: 'patch',
      })
      expect(await store.setter(applySelectionFormatAtom, { type, value: null })).toBe('completed')
      expect(write).toHaveBeenCalledTimes(2)
      expect(write.mock.calls[1]![0]).toMatchObject({
        scope: kind === 'range' ? 'cell' : kind,
        format: {}, clearFormatFields: [field], writeMode: 'patch',
      })
    },
  )
  test.each(['', 'red', '#xyz123', '#fff', '#12345678', 'var(--color)', 'url(example)'])(
    `${type} rejects invalid color %s before transport`, async (value) => {
      const { store, write } = await setup('cell')
      expect(await store.setter(applySelectionFormatAtom, { type, value })).toBe('blocked')
      expect(write).not.toHaveBeenCalled()
    },
  )
}
