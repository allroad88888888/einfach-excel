import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  clearWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  runNativeOutlineAtom,
  nativeOutlineAtom,
  nativeOutlineFeedbackAtom,
  viewportGeometrySizesAtom,
  viewportSizeOverridesAtom,
  setSheetProtectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import { applySheetVisibility, validSheetVisibility } from '../src/viewport/hidden-state'
import { nativeOutlineProjectionBackingAtom } from '../src/outline/native-state'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'

type Input = RustWorkbookCommands['outline.change']['payload']
const visibility = {
  manualRows: [2],
  manualColumns: [2],
  filterRows: [],
  outline: { rows: [{ start: 1, end: 3, collapsed: true }], columns: [] },
  outlineRows: [1, 2, 3],
}
async function setup() {
  const project = (input: VisibleProjectionRequest) => ({ ...input, cells: [], revision: 1 })
  const change = vi.fn(async (input: Input) => ({
    changed: true,
    projection: { ...project(input.projection), revision: 2, visibility },
  }))
  const request = vi.fn(async (command: string, input: unknown) =>
    command === 'outline.change'
      ? change(input as Input)
      : project((input as { request: VisibleProjectionRequest }).request),
  )
  const { store } = createSpreadsheetUi({
    connection: {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', index: 0, name: 'Test', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { 1: 80 } },
    colWidthsBySheet: {},
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  })
  return { store, change, request }
}

test.each(['row', 'column'] as const)(
  '%s grouping is one versioned native request plus returned projection',
  async (axis) => {
    const { store, change, request } = await setup()
    expect(await store.setter(runNativeOutlineAtom, { axis, action: { kind: 'group' } })).toBe(true)
    expect(change).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(2)
    expect(change.mock.calls[0][0]).toMatchObject({
      sheetId: 's',
      revision: 1,
      axis,
      action: { kind: 'group', start: 1, end: 1 },
    })
    expect(store.getter(nativeOutlineAtom)).toEqual(visibility.outline)
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s[1]).toBe(80)
    expect(store.getter(viewportGeometrySizesAtom).rowHeightsBySheet.s[1]).toBe(0)
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 's', row: 4, col: 1 })
  },
)

test('expand clears only outline visibility, identical reads keep geometry stable, disposal clears groups', async () => {
  const { store } = await setup()
  await store.setter(runNativeOutlineAtom, {
    axis: 'row',
    action: { kind: 'show-level', level: 1 },
  })
  const before = store.getter(viewportGeometrySizesAtom)
  applySheetVisibility(store.getter, store.setter, 's', structuredClone(visibility))
  expect(store.getter(viewportGeometrySizesAtom)).toBe(before)
  applySheetVisibility(store.getter, store.setter, 's', {
    ...visibility,
    outline: { rows: [{ start: 1, end: 3, collapsed: false }], columns: [] },
    outlineRows: [],
  })
  expect(store.getter(viewportGeometrySizesAtom).rowHeightsBySheet.s).toMatchObject({ 1: 80, 2: 0 })
  expect(store.getter(viewportGeometrySizesAtom).rowHeightsBySheet.s[3]).toBeUndefined()
  store.setter(clearWorkbookDocumentAtom)
  expect(store.getter(nativeOutlineProjectionBackingAtom)).toEqual({})
})

test('pending work has no optimistic model and rejects a second mutation', async () => {
  const { store, change } = await setup()
  let finish!: (value: Awaited<ReturnType<typeof change>>) => void
  change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = store.setter(runNativeOutlineAtom, { axis: 'row', action: { kind: 'group' } })
  expect(store.getter(nativeOutlineAtom).rows).toEqual([])
  expect(
    await store.setter(runNativeOutlineAtom, { axis: 'column', action: { kind: 'group' } }),
  ).toBe(false)
  const input = change.mock.calls[0][0]
  finish({ changed: true, projection: { ...input.projection, cells: [], revision: 2, visibility } })
  expect(await pending).toBe(true)
  expect(change).toHaveBeenCalledTimes(1)
  expect(store.getter(nativeOutlineFeedbackAtom).busy).toBe(false)
})

test('protection, malformed results and native errors preserve geometry and allow retry', async () => {
  const { store, change } = await setup()
  const action = { axis: 'row', action: { kind: 'group' } } as const
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await store.setter(runNativeOutlineAtom, action)).toBe(false)
  expect(change).not.toHaveBeenCalled()
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'open', unlockedRanges: [] },
  })
  change.mockRejectedValueOnce(new Error('Too many groups'))
  expect(await store.setter(runNativeOutlineAtom, action)).toBe(false)
  expect(store.getter(nativeOutlineFeedbackAtom).error).toBe('Too many groups')
  change.mockImplementationOnce(async (input) => ({
    changed: true,
    projection: {
      ...input.projection,
      cells: [],
      revision: 2,
      visibility: { ...visibility, outlineRows: [3, 1] },
    },
  }))
  expect(await store.setter(runNativeOutlineAtom, action)).toBe(false)
  expect(store.getter(nativeOutlineAtom).rows).toEqual([])
  expect(await store.setter(runNativeOutlineAtom, action)).toBe(true)
})

test('outline wire bounds and boot definition copies are checked without a second engine', () => {
  for (const bad of [
    { ...visibility, outlineRows: [1, 1] },
    { ...visibility, outlineColumns: [16384] },
    { ...visibility, outline: { rows: [{ start: 4, end: 3, collapsed: false }], columns: [] } },
  ])
    expect(validSheetVisibility(bad)).toBe(false)
  const group = { start: 1, end: 3, collapsed: false }
  const definition = snapshotRustWorkbookDefinition({
    title: 'Test',
    sheets: [
      {
        id: 's',
        name: 'Sheet',
        rowCount: 100,
        colCount: 8,
        outline: { rows: [group], columns: [] },
      },
    ],
    createImportChunks: () => [],
  })
  group.end = 99
  expect(definition.sheets[0].outline!.rows[0].end).toBe(3)
  expect(Object.isFrozen(definition.sheets[0].outline!.rows[0])).toBe(true)
})

test.each(['selection', 'clear'] as const)(
  'late native outline response does not overwrite a newer %s intent',
  async (intent) => {
    const { store, change } = await setup()
    let finish!: (value: Awaited<ReturnType<typeof change>>) => void
    change.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = store.setter(runNativeOutlineAtom, {
      axis: 'row', action: { kind: 'group' },
    })
    if (intent === 'clear') store.setter(clearWorkbookDocumentAtom)
    else store.setter(selectCellAtom, { sheetId: 's', coord: { row: 8, col: 6 } })
    const input = change.mock.calls[0][0]
    finish({
      changed: true,
      projection: { ...input.projection, cells: [], revision: 2, visibility },
    })
    expect(await pending).toBe(intent !== 'clear')
    expect(store.getter(nativeOutlineFeedbackAtom)).toEqual({ busy: false, error: '' })
    if (intent === 'clear') {
      expect(store.getter(nativeOutlineProjectionBackingAtom)).toEqual({})
    } else {
      expect(store.getter(nativeOutlineAtom)).toEqual(visibility.outline)
      expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
        sheetId: 's', row: 8, col: 6,
      })
    }
  },
)
