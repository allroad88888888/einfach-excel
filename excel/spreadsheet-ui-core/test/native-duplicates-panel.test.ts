import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, nativeDuplicatesPanelAtom, runNativeDuplicatesPanelAtom,
  runVisibleProjectionAtom, selectionSnapshotAtom, setSelectionAtom, setSelectionBoundsAtom,
  setSheetProtectionAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '../src'
import type { NativeDuplicatesAction } from '../src/remove-duplicates/native-panel'
import type { RustRemoveDuplicatesApplyRequest, RustRemoveDuplicatesPreviewRequest } from '../src/rust-workbook/remove-duplicates-commands'
import { sheetHiddenRowsBackingAtom, viewportHiddenColsBackingAtom } from '../src/viewport/hidden-state'

const range = { rowStart: 0, colStart: 0, rowEnd: 4, colEnd: 2 }
const counts = { scannedRows: 4, removedRows: 2, uniqueRows: 2, excludedRows: 0,
  headers: ['Key', 'Group', 'ID'], sampleOffset: 0,
  sample: [{ row: 3, firstRow: 1, values: ['a'] }], sampleTruncated: false, revision: 7 }
async function setup() {
  const preview = vi.fn(async (_: RustRemoveDuplicatesPreviewRequest) => counts)
  const write = vi.fn(async (input: RustRemoveDuplicatesApplyRequest) => ({ ...counts,
    projection: { ...input.projection, revision: 8, cells: [] } }))
  const read = vi.fn(async (request: VisibleProjectionRequest) => ({
    ...request, revision: 7, cells: [],
  }))
  const connection: RustWorkbookConnection = { dispose: vi.fn(),
    request: vi.fn(async (command: string, input: unknown) => {
      if (command === 'duplicates.preview') return preview(input as RustRemoveDuplicatesPreviewRequest)
      if (command === 'duplicates.apply') return write(input as RustRemoveDuplicatesApplyRequest)
      return read((input as { request: VisibleProjectionRequest }).request)
    }) as RustWorkbookConnection['request'] }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(setSelectionAtom, { kind: 'range', sheetId: 's',
    anchor: { row: 0, col: 0 }, focus: { row: 4, col: 2 } })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's',
    window: { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 7 }, reason: 'viewport' })
  const run = (action: NativeDuplicatesAction) => store.setter(runNativeDuplicatesPanelAtom, action)
  return { store, preview, write, read, run }
}

test('preview reads full selection and only confirmed native removal publishes one result', async () => {
  const { store, preview, write, read, run } = await setup()
  await run('open')
  expect(preview).toHaveBeenCalledWith({ sheetId: 's', range, columns: [0, 1, 2],
    hasHeader: true, comparison: 'ignoreCase' })
  expect(await run('apply')).toBe(false)
  await run({ type: 'confirm', value: true })
  expect(await run('apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.lastCall![0]).toMatchObject({
    ...preview.mock.lastCall![0], expectedRevision: 7,
  })
  expect(read).toHaveBeenCalledTimes(1)
  expect(store.getter(nativeDuplicatesPanelAtom).target).toBeNull()
})

test('draft changes clear preview and consent; header and text options travel together', async () => {
  const { store, preview, write, run } = await setup()
  await run('open')
  await run({ type: 'confirm', value: true })
  await run({ type: 'draft', patch: { columns: [0, 1], hasHeader: false, comparison: 'trimIgnoreCase' } })
  expect(store.getter(nativeDuplicatesPanelAtom)).toMatchObject({ preview: null, confirmed: false })
  expect(await run('apply')).toBe(false)
  expect(preview).toHaveBeenCalledTimes(1)
  await run('preview')
  await run({ type: 'confirm', value: true })
  await run('apply')
  expect(write.mock.lastCall![0]).toMatchObject({ columns: [0, 1], hasHeader: false, comparison: 'trimIgnoreCase' })
})

test('empty key selection does not dispatch and is correctable', async () => {
  const { store, preview, run } = await setup()
  await run('open')
  await run({ type: 'draft', patch: { columns: [] } })
  expect(await run('preview')).toBe(false)
  expect(preview).toHaveBeenCalledTimes(1)
  expect(store.getter(nativeDuplicatesPanelAtom).error).toMatch(/at least one/)
  await run({ type: 'draft', patch: { columns: [1] } })
  expect(await run('preview')).toBe(true)
})

test('zero duplicates never dispatches mutation, even after a forged confirmation', async () => {
  const { preview, write, run } = await setup()
  preview.mockResolvedValue({ ...counts, removedRows: 0 })
  await run('open')
  await run({ type: 'confirm', value: true })
  expect(await run('apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test('closing discards options and ignores a late preview', async () => {
  const { store, preview, run } = await setup()
  let resolve!: (value: typeof counts) => void
  preview.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  const opening = run('open')
  await run('close')
  resolve(counts)
  await opening
  expect(store.getter(nativeDuplicatesPanelAtom).target).toBeNull()
  await run('open')
  expect(store.getter(nativeDuplicatesPanelAtom).draft).toEqual({
    columns: [0, 1, 2], hasHeader: true, comparison: 'ignoreCase' })
})

test('changed selection cannot reuse an earlier preview', async () => {
  const { store, write, run } = await setup()
  await run('open')
  await run({ type: 'confirm', value: true })
  store.setter(setSelectionAtom, { kind: 'cell', sheetId: 's',
    anchor: { row: 6, col: 0 }, focus: { row: 6, col: 0 } })
  expect(await run('apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test('protected ranges reject before deletion', async () => {
  const { store, write, run } = await setup()
  await run('open')
  await run({ type: 'confirm', value: true })
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await run('apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test('pending apply cannot be submitted twice, edited or cancelled', async () => {
  const { store, write, run } = await setup()
  let resolve!: (value: Awaited<ReturnType<typeof write>>) => void
  write.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  await run('open')
  await run({ type: 'confirm', value: true })
  const pending = run('apply')
  expect(await run('apply')).toBe(false)
  expect(await run('close')).toBe(false)
  expect(await run({ type: 'draft', patch: { hasHeader: false } })).toBe(false)
  resolve({ ...counts,
    projection: { ...write.mock.lastCall![0].projection, revision: 8, cells: [] } })
  expect(await pending).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(store.getter(nativeDuplicatesPanelAtom).target).toBeNull()
})

test('rejected mutation clears consent and demands a fresh preview before retry', async () => {
  const { store, write, run } = await setup()
  write.mockRejectedValueOnce(new Error('revision changed'))
  await run('open')
  await run({ type: 'confirm', value: true })
  expect(await run('apply')).toBe(false)
  expect(store.getter(nativeDuplicatesPanelAtom)).toMatchObject({
    preview: null, confirmed: false, error: 'revision changed' })
  expect(await run('apply')).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
})

test('paging pins the native revision, drops deletion consent and replaces rather than appends samples', async () => {
  const { store, preview, write, run } = await setup()
  preview.mockResolvedValueOnce({ ...counts, removedRows: 43 })
  await run('open')
  await run({ type: 'confirm', value: true })
  preview.mockResolvedValueOnce({ ...counts, removedRows: 43, sampleOffset: 20,
    sample: [{ row: 23, firstRow: 1, values: ['second page'] }] })
  expect(await run({ type: 'page', offset: 20 })).toBe(true)
  expect(preview.mock.lastCall![0]).toMatchObject({ sampleOffset: 20, expectedRevision: 7 })
  expect(store.getter(nativeDuplicatesPanelAtom)).toMatchObject({ confirmed: false,
    preview: { sampleOffset: 20, sample: [{ row: 23 }] } })
  expect(write).not.toHaveBeenCalled()
  await run('preview')
  expect(preview.mock.lastCall![0]).not.toHaveProperty('sampleOffset')
  expect(preview.mock.lastCall![0]).not.toHaveProperty('expectedRevision')
})

for (const [occurrence, row] of [['duplicate', 3], ['first', 1]] as const)
  test(`locating the ${occurrence} record revalidates revision then closes without deletion`, async () => {
    const { store, preview, write, run } = await setup()
    await run('open')
    expect(await run({ type: 'locate', row: 3, occurrence })).toBe(true)
    expect(preview.mock.lastCall![0]).toMatchObject({ sampleOffset: 0, expectedRevision: 7 })
    expect(store.getter(selectionSnapshotAtom).selection.anchor).toEqual({ row, col: 0 })
    expect(store.getter(nativeDuplicatesPanelAtom).target).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

test('invalid pages and forged result rows never dispatch; stale navigation leaves selection untouched', async () => {
  const { store, preview, write, run } = await setup()
  await run('open')
  await run({ type: 'confirm', value: true })
  for (const offset of [-1, 0.5, NaN, 2]) expect(await run({ type: 'page', offset })).toBe(false)
  expect(await run({ type: 'page', offset: null } as unknown as NativeDuplicatesAction)).toBe(false)
  expect(await run({ type: 'locate', row: 99, occurrence: 'first' })).toBe(false)
  expect(preview).toHaveBeenCalledTimes(1)
  const before = store.getter(selectionSnapshotAtom)
  preview.mockRejectedValueOnce(new Error('The workbook changed'))
  expect(await run({ type: 'locate', row: 3, occurrence: 'duplicate' })).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toBe(before)
  expect(store.getter(nativeDuplicatesPanelAtom)).toMatchObject({ preview: null, confirmed: false,
    error: 'The workbook changed' })
  expect(write).not.toHaveBeenCalled()
})

test('a late page cannot reopen a cancelled dialog', async () => {
  const { store, preview, run } = await setup()
  await run('open')
  let resolve!: (value: typeof counts) => void
  preview.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  const paging = run({ type: 'page', offset: 1 })
  await run('close')
  resolve({ ...counts, sampleOffset: 1 })
  expect(await paging).toBe(false)
  expect(store.getter(nativeDuplicatesPanelAtom).target).toBeNull()
})

for (const axis of ['row', 'column'] as const)
  test(`locating a hidden ${axis} leaves visibility and selection untouched`, async () => {
    const { store, write, run } = await setup()
    const hidden = axis === 'row' ? sheetHiddenRowsBackingAtom : viewportHiddenColsBackingAtom
    const visibility = { s: [axis === 'row' ? 3 : 0] }
    store.setter(hidden, visibility)
    await run('open')
    const selection = store.getter(selectionSnapshotAtom)
    expect(await run({ type: 'locate', row: 3, occurrence: 'duplicate' })).toBe(false)
    expect(store.getter(hidden)).toBe(visibility)
    expect(store.getter(selectionSnapshotAtom)).toBe(selection)
    expect(store.getter(nativeDuplicatesPanelAtom).error).toMatch(/Unhide/)
    expect(write).not.toHaveBeenCalled()
  })

for (const action of [{ type: 'page', offset: 1 },
  { type: 'locate', row: 3, occurrence: 'first' }] as const)
  test(`a late ${action.type} response cannot override a changed selection`, async () => {
    const { store, preview, write, run } = await setup()
    await run('open')
    let resolve!: (value: typeof counts) => void
    preview.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const reading = run(action)
    store.setter(setSelectionAtom, { kind: 'cell', sheetId: 's',
      anchor: { row: 8, col: 2 }, focus: { row: 8, col: 2 } })
    resolve(counts)
    expect(await reading).toBe(false)
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 8, col: 2 })
    expect(store.getter(nativeDuplicatesPanelAtom)).toMatchObject({
      preview: null, confirmed: false, error: expect.stringMatching(/selection or workbook changed/),
    })
    expect(write).not.toHaveBeenCalled()
  })

test('an absent revalidated result never navigates to the old sample coordinate', async () => {
  const { store, preview, run } = await setup()
  await run('open')
  const selection = store.getter(selectionSnapshotAtom)
  preview.mockResolvedValueOnce({ ...counts, sample: [] })
  expect(await run({ type: 'locate', row: 3, occurrence: 'first' })).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toBe(selection)
  expect(store.getter(nativeDuplicatesPanelAtom).error).toMatch(/result changed/)
})
