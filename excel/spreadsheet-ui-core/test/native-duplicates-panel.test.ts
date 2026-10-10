import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, nativeDuplicatesPanelAtom, runNativeDuplicatesPanelAtom,
  runVisibleProjectionAtom, setSelectionAtom, setSelectionBoundsAtom, setSheetProtectionAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '../src'
import type { NativeDuplicatesAction } from '../src/remove-duplicates/native-panel'
import type { RustRemoveDuplicatesApplyRequest, RustRemoveDuplicatesRequest } from '../src/rust-workbook/remove-duplicates-commands'

const range = { rowStart: 0, colStart: 0, rowEnd: 4, colEnd: 2 }
const counts = { scannedRows: 4, removedRows: 2, uniqueRows: 2, excludedRows: 0,
  headers: ['Key', 'Group', 'ID'], sample: [], sampleTruncated: false, revision: 7 }
async function setup() {
  const preview = vi.fn(async (_: RustRemoveDuplicatesRequest) => counts)
  const write = vi.fn(async (input: RustRemoveDuplicatesApplyRequest) => ({ ...counts,
    projection: { ...input.projection, revision: 8, cells: [] } }))
  const read = vi.fn(async (request: VisibleProjectionRequest) => ({
    ...request, revision: 7, cells: [],
  }))
  const connection: RustWorkbookConnection = { dispose: vi.fn(),
    request: vi.fn(async (command: string, input: unknown) => {
      if (command === 'duplicates.preview') return preview(input as RustRemoveDuplicatesRequest)
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
