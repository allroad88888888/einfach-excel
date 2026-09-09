import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, directionalFillFeedbackAtom, dispatchGridCellKeyboardInputAtom,
  fillSelectionAtom, keyboardModeAtom, projectionSnapshotAtom, runVisibleProjectionAtom,
  selectCellAtom, setSelectionBoundsAtom, setSheetProtectionAtom, viewportSizeOverridesAtom,
  setRustWorkbookConnectionAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest, addSelectionRegionAtom,
} from '../src'

type Input = RustWorkbookCommands['range.fill']['payload']
const result = (p: Input): RustWorkbookCommands['range.fill']['result'] => ({
  acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 2 },
  projection: { ...p.projection, cells: [], revision: 2 },
  sizes: { rowHeights: [{ rowIndex: 50, heightPx: 60 }], colWidths: [] },
})
async function setup() {
  const fill = vi.fn(async (p: Input) => result(p))
  const request = vi.fn(async (command: string, p: unknown) => command === 'range.fill'
    ? fill(p as Input)
    : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 })
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 1 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 50, col: 2 }, extend: true })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 }, reason: 'viewport',
  })
  return { store, fill, request }
}

test.each(['down', 'right'] as const)('%s sends one mutation and publishes native sizes', async (direction) => {
  const { store, fill, request } = await setup()
  expect(await store.setter(fillSelectionAtom, direction)).toBe(true)
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill.mock.calls[0]![0].request).toMatchObject({
    direction, sheetId: 's', range: { rowStart: 0, rowEnd: 50, colStart: 1, colEnd: 2 },
  })
  expect(request).toHaveBeenCalledTimes(2)
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(2)
  expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s?.['50']).toBe(60)
})

test('invalid geometry and protection stop before transport', async () => {
  const { store, fill } = await setup()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  expect(await store.setter(fillSelectionAtom, 'down')).toBe(false)
  expect(await store.setter(fillSelectionAtom, 'right')).toBe(false)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 2 }, extend: true })
  store.setter(setSheetProtectionAtom, {
    sheetId: 's', state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await store.setter(fillSelectionAtom, 'down')).toBe(false)
  expect(store.getter(directionalFillFeedbackAtom).error).toContain('Unprotect')
  expect(fill).not.toHaveBeenCalled()
})

test('native failure and invalid acknowledgement cannot publish, then retry succeeds', async () => {
  const { store, fill } = await setup()
  const before = store.getter(projectionSnapshotAtom)
  const sizes = store.getter(viewportSizeOverridesAtom)
  fill.mockRejectedValueOnce(new Error('Merged target'))
  expect(await store.setter(fillSelectionAtom, 'down')).toBe(false)
  expect(store.getter(directionalFillFeedbackAtom)).toMatchObject({ busy: false, error: 'Merged target' })
  fill.mockImplementationOnce(async (p) => ({
    ...result(p), acknowledgement: { sheetId: 'wrong', requestId: 0, revision: 2 },
  }))
  expect(await store.setter(fillSelectionAtom, 'down')).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(viewportSizeOverridesAtom)).toBe(sizes)
  expect(await store.setter(fillSelectionAtom, 'down')).toBe(true)
})

test('noncontiguous regions are rejected instead of filling their bounding rectangle', async () => {
  const { store, fill } = await setup()
  store.setter(addSelectionRegionAtom, { region: {
    kind: 'cell', sheetId: 's', anchor: { row: 70, col: 5 }, focus: { row: 72, col: 5 },
  } })
  expect(await store.setter(fillSelectionAtom, 'down')).toBe(false)
  expect(store.getter(directionalFillFeedbackAtom).error).toContain('continuous')
  expect(fill).not.toHaveBeenCalled()
})

test('pending request blocks a second fill; disposed connection cannot publish', async () => {
  const { store, fill } = await setup()
  let finish!: (value: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const before = store.getter(projectionSnapshotAtom)
  const pending = store.setter(fillSelectionAtom, 'down')
  expect(await store.setter(fillSelectionAtom, 'right')).toBe(false)
  expect(fill).toHaveBeenCalledTimes(1)
  store.setter(setRustWorkbookConnectionAtom, null)
  finish(result(fill.mock.calls[0]![0]))
  expect(await pending).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(directionalFillFeedbackAtom).busy).toBe(false)
})

test.each(['ctrlKey', 'metaKey'] as const)('%s D/R use the same command', async (modifier) => {
  const { store, fill } = await setup()
  for (const [key, direction] of [['d', 'down'], ['R', 'right']]) {
    const intent = store.setter(dispatchGridCellKeyboardInputAtom, {
      sheetId: 's', cell: { row: 0, col: 1 }, allowEditing: true,
      keyboard: { key: key!, [modifier]: true },
    })
    expect(intent).toEqual({ type: 'range.fill', direction })
    await vi.waitFor(() => expect(store.getter(directionalFillFeedbackAtom).busy).toBe(false))
    expect(fill.mock.lastCall![0].request.direction).toBe(direction)
  }
  expect(fill).toHaveBeenCalledTimes(2)
})

test('retained projection, editing, composition and modified browser chords never fill', async () => {
  const { store, fill } = await setup()
  const dispatch = (keyboard: { key: string; ctrlKey?: boolean; shiftKey?: boolean;
    altKey?: boolean; isComposing?: boolean }, allowEditing = true) =>
    store.setter(dispatchGridCellKeyboardInputAtom, {
      sheetId: 's', cell: { row: 0, col: 1 }, allowEditing, keyboard,
    })
  dispatch({ key: 'd', ctrlKey: true }, false)
  dispatch({ key: 'd', ctrlKey: true, shiftKey: true })
  dispatch({ key: 'r', ctrlKey: true, altKey: true })
  dispatch({ key: 'd', ctrlKey: true, isComposing: true })
  store.setter(keyboardModeAtom, 'editing')
  dispatch({ key: 'd', ctrlKey: true })
  expect(fill).not.toHaveBeenCalled()
})
