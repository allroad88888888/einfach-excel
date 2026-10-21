import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, dragFillHandleAtom, fillHandleDragAtom, directionalFillFeedbackAtom,
  runVisibleProjectionAtom, selectCellAtom, selectionSnapshotAtom, setSelectionBoundsAtom,
  setSheetProtectionAtom, viewportSizeOverridesAtom, type RustWorkbookCommands,
  type RustWorkbookConnection,
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
  fill.mockRejectedValueOnce(new Error('This worksheet is protected.'))
  await command({ type: 'finish', copy: false })
  expect(fill).toHaveBeenCalledTimes(2)
  expect(store.getter(directionalFillFeedbackAtom).error).toBe('This worksheet is protected.')
  expect(store.getter(selectionSnapshotAtom).range).toEqual(before)
})

test('native permits dragging from a locked source into an editable destination', async () => {
  const { store, fill, command } = await setup()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected',
    unlockedRanges: [{ rowStart: 5, rowEnd: 8, colStart: 3, colEnd: 3 }] } })
  await command({ type: 'move', coord: { row: 8, col: 3 } })
  await command({ type: 'finish', copy: false })
  expect(fill).toHaveBeenCalledTimes(1)
  expect(store.getter(directionalFillFeedbackAtom).error).toBe('')
  expect(store.getter(selectionSnapshotAtom).range)
    .toEqual({ rowStart: 3, rowEnd: 8, colStart: 3, colEnd: 3 })
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

test.each([false, true])('double-click submits one native extent command (copy=%s)', async (copy) => {
  const { store, fill, command } = await setup()
  const source = store.getter(selectionSnapshotAtom).range
  fill.mockImplementationOnce(async p => ({ ...result(p), acknowledgement: {
    ...result(p).acknowledgement, affectedRange: { ...source, rowStart: 5, rowEnd: 11 },
  } }))
  await command({ type: 'extend-down', copy })
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill.mock.lastCall![0].request).toMatchObject({
    sourceRange: source, range: source, adjacent: { rowLimit: 100 }, auto: !copy,
  })
  expect(store.getter(selectionSnapshotAtom).range).toEqual({ ...source, rowEnd: 11 })
  expect(store.getter(fillHandleDragAtom)).toBeNull()
})

test('double-click rejection preserves source and can retry with a validated native end', async () => {
  const { store, fill, command } = await setup()
  const source = store.getter(selectionSnapshotAtom).range
  fill.mockRejectedValueOnce(new Error('No adjacent continuous data to fill.'))
  await command({ type: 'extend-down', copy: false })
  expect(store.getter(selectionSnapshotAtom).range).toEqual(source)
  expect(store.getter(directionalFillFeedbackAtom).error).toContain('No adjacent')
  // 超出工作表的 ACK 不得扩大选区或发布错误投影。
  fill.mockImplementationOnce(async p => ({ ...result(p), acknowledgement: {
    ...result(p).acknowledgement, affectedRange: { ...source, rowStart: 5, rowEnd: 100 },
  } }))
  await command({ type: 'extend-down', copy: false })
  expect(store.getter(selectionSnapshotAtom).range).toEqual(source)
  expect(store.getter(directionalFillFeedbackAtom).error).toContain('mismatched fill range')
  fill.mockImplementationOnce(async p => ({ ...result(p), acknowledgement: {
    ...result(p).acknowledgement, affectedRange: { ...source, rowStart: 5, rowEnd: 11 },
  } }))
  await command({ type: 'extend-down', copy: false })
  expect(store.getter(selectionSnapshotAtom).range.rowEnd).toBe(11)
})

test('pending adjacent fill rejects duplicate clicks and never steals a newer selection', async () => {
  const { store, fill, command } = await setup()
  const source = store.getter(selectionSnapshotAtom).range
  let finish!: (p: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = command({ type: 'extend-down', copy: false })
  await command({ type: 'extend-down', copy: false })
  expect(fill).toHaveBeenCalledTimes(1)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 50, col: 0 } })
  const p = fill.mock.lastCall![0]
  finish({ ...result(p), acknowledgement: { ...result(p).acknowledgement,
    affectedRange: { ...source, rowStart: 5, rowEnd: 11 } } })
  await pending
  expect(store.getter(selectionSnapshotAtom).activeCell.row).toBe(50)
})

test('adjacent fill preserves source heights when sizes describe only destination rows', async () => {
  const { store, fill, command } = await setup()
  const source = store.getter(selectionSnapshotAtom).range
  store.setter(viewportSizeOverridesAtom, { rowHeightsBySheet: { s: { '3': 60 } },
    colWidthsBySheet: {} })
  fill.mockImplementationOnce(async p => ({ ...result(p), acknowledgement: {
    ...result(p).acknowledgement, affectedRange: { ...source, rowStart: 5, rowEnd: 11 },
  } }))
  await command({ type: 'extend-down', copy: false })
  expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s?.['3']).toBe(60)
})
