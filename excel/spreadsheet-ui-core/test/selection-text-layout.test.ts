import { expect, test, vi } from 'vitest'
import {
  applySelectionFormatAtom, createSpreadsheetUi, runVisibleProjectionAtom, selectCellAtom,
  runTextLayoutAtom, textLayoutFeedbackAtom, selectionAtom, setSelectionBoundsAtom,
  setRustWorkbookConnectionAtom, startCellEditingFromProjectionAtom,
  type SelectionFormatAction, type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const project = (request: VisibleProjectionRequest, revision = 1) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    revision, window: request.window,
    cells: [{ row: 0, col: 0, displayValue: 'Source',
      format: { bold: true, align: 'right' as const, bgColor: '#93c47d' } }],
  })
  const write = vi.fn(async (
    request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 2 },
    projection: project(projection, 2),
  }))
  const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    readVisibleProjection: async (request) => project(request), setRangeFormat: write,
  }) })
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }, reason: 'viewport',
  })
  return { store, write }
}

test.each(['default', 'left', 'center', 'right'] as const)(
  'horizontal %s writes only the chosen field, without cycling or copying other styles', async (value) => {
    const { store, write } = await setup()
    expect(await store.setter(applySelectionFormatAtom, { type: 'horizontal-alignment', value }))
      .toBe('completed')
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]![0]).toMatchObject({ format: { align: value }, writeMode: 'patch' })
    expect(Object.keys(write.mock.calls[0]![0].format!)).toEqual(['align'])
  },
)

test.each(['top', 'center', 'bottom', null] as const)(
  'vertical %s writes only its field, and default explicitly clears inheritance', async (value) => {
    const { store, write } = await setup()
    await store.setter(applySelectionFormatAtom, { type: 'vertical-alignment', value })
    expect(write.mock.calls[0]![0].format).toEqual(value === null ? {} : { verticalAlign: value })
    expect(write.mock.calls[0]![0].clearFormatFields)
      .toEqual(value === null ? ['verticalAlign'] : undefined)
  },
)

test.each([-90, -45, -12, 0, 15, 45, 90, 'vertical'] as const)(
  'rotation %s is passed to Rust unchanged', async (value) => {
    const { store, write } = await setup()
    expect(await store.setter(applySelectionFormatAtom, { type: 'text-rotation', value }))
      .toBe('completed')
    expect(write.mock.calls[0]![0].format).toEqual({ rotation: value })
  },
)

test.each([
  { type: 'horizontal-alignment', value: 'diagonal' },
  { type: 'vertical-alignment', value: 'middle' },
  ...[-91, 91, 12.5, NaN, Infinity, '45', 'invalid'].map((value) => ({
    type: 'text-rotation', value,
  })),
])('invalid layout $type=$value does not send a mutation', async (input) => {
  const { store, write } = await setup()
  expect(await store.setter(applySelectionFormatAtom, input as SelectionFormatAction)).toBe('blocked')
  expect(write).not.toHaveBeenCalled()
})

for (const action of [
  { type: 'horizontal-alignment', value: 'left' },
  { type: 'vertical-alignment', value: 'bottom' },
  { type: 'text-rotation', value: 90 },
] as const) {
  test.each(['range', 'row', 'column'] as const)(
    `${action.type} preserves the %s selection scope`, async (kind) => {
      const { store, write } = await setup()
      store.setter(selectionAtom, kind === 'row'
        ? { kind, sheetId: 's', rowAnchor: 1, rowFocus: 2 }
        : kind === 'column'
          ? { kind, sheetId: 's', colAnchor: 1, colFocus: 2 }
          : { kind, sheetId: 's', anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } })
      expect(await store.setter(runTextLayoutAtom, action)).toBe(true)
      expect(write).toHaveBeenCalledTimes(1)
      expect(write.mock.calls[0]![0].scope).toBe(kind === 'range' ? 'cell' : kind)
    },
  )
}

test('pending is published before acknowledgement and blocks duplicate selections', async () => {
  const { store, write } = await setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const original = write.getMockImplementation()!
  write.mockImplementationOnce(async (...args) => { await gate; return original(...args) })
  const notify = vi.fn()
  const unsubscribe = store.sub(textLayoutFeedbackAtom, notify)
  const pending = store.setter(runTextLayoutAtom, { type: 'text-rotation', value: 90 })
  await Promise.resolve()
  expect(notify).toHaveBeenCalled()
  expect(store.getter(textLayoutFeedbackAtom).busy).toBe(true)
  expect(await store.setter(runTextLayoutAtom, { type: 'text-rotation', value: -90 })).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
  release()
  expect(await pending).toBe(true)
  expect(store.getter(textLayoutFeedbackAtom)).toEqual({ busy: false, error: null })
  unsubscribe()
})

test('rejection is visible and the next explicit choice can retry', async () => {
  const { store, write } = await setup()
  write.mockRejectedValueOnce(new Error('transport error'))
  const action = { type: 'horizontal-alignment', value: 'left' } as const
  expect(await store.setter(runTextLayoutAtom, action)).toBe(false)
  expect(store.getter(textLayoutFeedbackAtom).error).toContain('Check the cell')
  expect(await store.setter(runTextLayoutAtom, action)).toBe(true)
  expect(write).toHaveBeenCalledTimes(2)
  expect(store.getter(textLayoutFeedbackAtom)).toEqual({ busy: false, error: null })
})

test('replacement connection releases pending state without publishing the old error', async () => {
  const { store, write } = await setup()
  let release!: () => void
  write.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => { release = resolve })
    throw new Error('old connection')
  })
  const pending = store.setter(runTextLayoutAtom, { type: 'vertical-alignment', value: 'top' })
  store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection())
  release()
  expect(await pending).toBe(false)
  expect(store.getter(textLayoutFeedbackAtom)).toEqual({ busy: false, error: null })
})

test('editing blocks layout changes before transport', async () => {
  const { store, write } = await setup()
  store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } })
  expect(await store.setter(runTextLayoutAtom, { type: 'text-rotation', value: 45 })).toBe(false)
  expect(write).not.toHaveBeenCalled()
})
