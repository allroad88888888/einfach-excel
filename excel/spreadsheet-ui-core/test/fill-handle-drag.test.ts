import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, dragFillHandleAtom, fillHandleDragAtom, directionalFillFeedbackAtom,
  runVisibleProjectionAtom, selectCellAtom, selectionSnapshotAtom, setSelectionBoundsAtom,
  setSheetProtectionAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest } from '../src'

type Input = RustWorkbookCommands['range.fill']['payload']
const result = (p: Input): RustWorkbookCommands['range.fill']['result'] => ({
  acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
  projection: { ...p.projection, cells: [], revision: 1 }, sizes: { rowHeights: [], colWidths: [] },
})
async function setup() {
  const fill = vi.fn(async (p: Input) => result(p))
  const { store } = createSpreadsheetUi({ connection: {
    request: (async (cmd: string, p: unknown) => cmd === 'range.fill' ? fill(p as Input)
      : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
    ) as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 3 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 4, col: 3 }, extend: true })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }, reason: 'viewport',
  })
  const command = (action: Parameters<typeof dragFillHandleAtom.write>[2]) =>
    store.setter(dragFillHandleAtom, action)
  await command({ type: 'start', copy: false })
  return { store, fill, command }
}

test.each([
  ['down', { row: 8, col: 3 }, { rowStart: 3, rowEnd: 8, colStart: 3, colEnd: 3 }],
  ['up', { row: 1, col: 3 }, { rowStart: 1, rowEnd: 4, colStart: 3, colEnd: 3 }],
  ['right', { row: 4, col: 6 }, { rowStart: 3, rowEnd: 4, colStart: 3, colEnd: 6 }],
  ['left', { row: 4, col: 0 }, { rowStart: 3, rowEnd: 4, colStart: 0, colEnd: 3 }],
] as const)('%s previews without writes, then submits one RPC and selects result', async (direction, coord, range) => {
  const { store, fill, command } = await setup()
  const sourceRange = store.getter(selectionSnapshotAtom).range
  await command({ type: 'move', coord })
  expect(store.getter(fillHandleDragAtom)).toMatchObject({ direction, range })
  expect(store.getter(selectionSnapshotAtom).range).toEqual(sourceRange)
  expect(fill).not.toHaveBeenCalled()
  await command({ type: 'finish', copy: false })
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill.mock.lastCall![0].request).toMatchObject({
    direction, sourceRange, range, auto: true,
  })
  expect(store.getter(selectionSnapshotAtom).range).toEqual(range)
  expect(store.getter(fillHandleDragAtom)).toBeNull()
})

test('copy modifier is live and pointer release decides final mode', async () => {
  const { store, fill, command } = await setup()
  await command({ type: 'move', coord: { row: 8, col: 3 } })
  await command({ type: 'copy', copy: true })
  expect(store.getter(fillHandleDragAtom)?.copy).toBe(true)
  await command({ type: 'finish', copy: true })
  expect(fill.mock.lastCall![0].request.auto).toBe(false)
})

test('cancel, no movement, invalid coordinates and changed sheet never write', async () => {
  const { store, fill, command } = await setup()
  await command({ type: 'finish', copy: false })
  await command({ type: 'start', copy: false })
  for (const coord of [{ row: -1, col: 3 }, { row: 100, col: 3 }, { row: 1.5, col: 0 }])
    await command({ type: 'move', coord })
  expect(store.getter(fillHandleDragAtom)?.direction).toBeNull()
  await command({ type: 'move', coord: { row: 8, col: 3 } })
  await command({ type: 'cancel' })
  await command({ type: 'finish', copy: false })
  await command({ type: 'start', copy: false })
  await command({ type: 'move', coord: { row: 8, col: 3 } })
  store.setter(selectCellAtom, { sheetId: 'other', coord: { row: 3, col: 3 } })
  await command({ type: 'finish', copy: false })
  expect(fill).not.toHaveBeenCalled()
})

test('native rejection and protection keep the original selection', async () => {
  const { store, fill, command } = await setup()
  const before = store.getter(selectionSnapshotAtom).range
  await command({ type: 'move', coord: { row: 8, col: 3 } })
  fill.mockRejectedValueOnce(new Error('Merged target'))
  await command({ type: 'finish', copy: false })
  expect(store.getter(directionalFillFeedbackAtom).error).toBe('Merged target')
  expect(store.getter(selectionSnapshotAtom).range).toEqual(before)
  await command({ type: 'start', copy: false })
  await command({ type: 'move', coord: { row: 8, col: 3 } })
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  await command({ type: 'finish', copy: false })
  expect(fill).toHaveBeenCalledTimes(1)
  expect(store.getter(selectionSnapshotAtom).range).toEqual(before)
})

test('pending write cannot start another drag or steal a newer selection', async () => {
  const { store, fill, command } = await setup()
  let finish!: (p: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await command({ type: 'move', coord: { row: 8, col: 3 } })
  const pending = command({ type: 'finish', copy: false })
  await command({ type: 'start', copy: false })
  expect(store.getter(fillHandleDragAtom)).toBeNull()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 50, col: 0 } })
  finish(result(fill.mock.lastCall![0]))
  await pending
  expect(store.getter(selectionSnapshotAtom).activeCell.row).toBe(50)
  expect(fill).toHaveBeenCalledTimes(1)
})
