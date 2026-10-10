import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, runTextColumnsPanelAtom, textColumnsPanelAtom, runVisibleProjectionAtom,
  setSelectionAtom, setSelectionBoundsAtom, selectionSnapshotAtom, setSheetProtectionAtom,
  setRustWorkbookConnectionAtom, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '../src'
import type {
  RustTextColumnsRequest, RustTextColumnsApplyRequest,
} from '../src/rust-workbook/text-columns-commands'
import type { TextColumnsPanelAction } from '../src/text-to-columns/native-panel'

const source = { rowStart: 0, colStart: 0, rowEnd: 1, colEnd: 0 }
const target = { rowStart: 0, colStart: 2, rowEnd: 1, colEnd: 3 }
const project = (request: VisibleProjectionRequest) => ({ ...request, revision: 7, cells: [] })
async function setup() {
  const preview = vi.fn(async (_: RustTextColumnsRequest) => ({
    target, sample: [['001', '北京']], sampleTruncated: false, overwrittenCells: 0, revision: 7,
  }))
  const write = vi.fn(async (input: RustTextColumnsApplyRequest) => ({
    target, changedCells: 4, projection: { ...project(input.projection), revision: 8 },
  }))
  const read = vi.fn(async (request: VisibleProjectionRequest) => project(request))
  const connection: RustWorkbookConnection = {
    dispose: vi.fn(),
    request: vi.fn(async (command: string, input: unknown) => {
      if (command === 'textColumns.preview') return preview(input as RustTextColumnsRequest)
      if (command === 'textColumns.apply') return write(input as RustTextColumnsApplyRequest)
      return read((input as { request: VisibleProjectionRequest }).request)
    }) as RustWorkbookConnection['request'],
  }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(setSelectionAtom, { kind: 'range', sheetId: 's',
    anchor: { row: 0, col: 0 }, focus: { row: 1, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 7 }, reason: 'viewport',
  })
  const run = (action: TextColumnsPanelAction) =>
    store.setter(runTextColumnsPanelAtom, action)
  return { store, preview, write, read, run }
}

test('open previews complete selection, draft needs explicit refresh, apply uses the same native request', async () => {
  const { store, preview, write, read, run } = await setup()
  await run('open')
  expect(preview).toHaveBeenCalledWith({ sheetId: 's', source, destination: { row: 0, col: 0 },
    mode: { kind: 'delimited', delimiters: [','], mergeConsecutive: false, qualifier: '"' } })
  await run({ type: 'draft', patch: { destination: 'C1' } })
  expect(store.getter(textColumnsPanelAtom).preview).toBeNull()
  expect(await run('apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
  await run('preview')
  expect(await run('apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.lastCall![0]).toMatchObject({
    ...preview.mock.lastCall![0], expectedRevision: 7,
  })
  expect(read).toHaveBeenCalledTimes(1)
  expect(store.getter(selectionSnapshotAtom).range).toEqual(target)
  expect(store.getter(textColumnsPanelAtom).target).toBeNull()
})

test('overwrite confirmation is required and every preview or draft invalidates it', async () => {
  const { store, preview, write, run } = await setup()
  preview.mockResolvedValue({ target, sample: [], sampleTruncated: false,
    overwrittenCells: 2, revision: 7 })
  await run('open')
  expect(await run('apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
  await run({ type: 'overwrite', value: true })
  await run('preview')
  expect(store.getter(textColumnsPanelAtom).overwrite).toBe(false)
  await run({ type: 'overwrite', value: true })
  await run('apply')
  expect(write.mock.lastCall![0].overwrite).toBe(true)
})

test.each(['', '0', '5,2', '2,2', '1.5', '4294967296'])('invalid fixed positions %s do not send a request', async (breakpoints) => {
  const { preview, write, run } = await setup()
  await run('open')
  await run({ type: 'draft', patch: { kind: 'fixedWidth', breakpoints } })
  expect(await run('preview')).toBe(false)
  expect(preview).toHaveBeenCalledTimes(1)
  expect(write).not.toHaveBeenCalled()
})

test('fixed positions and multiple Unicode delimiters are options, not a JS data splitter', async () => {
  const { preview, run } = await setup()
  await run('open')
  await run({ type: 'delimiter', value: ';', enabled: true })
  await run({ type: 'draft', patch: { otherDelimiter: '、', mergeConsecutive: true, qualifier: null } })
  await run('preview')
  expect(preview.mock.lastCall![0].mode).toEqual({ kind: 'delimited',
    delimiters: [',', ';', '、'], mergeConsecutive: true, qualifier: null })
  await run({ type: 'draft', patch: { kind: 'fixedWidth', breakpoints: '2, 5' } })
  await run('preview')
  expect(preview.mock.lastCall![0].mode).toEqual({ kind: 'fixedWidth', breakpoints: [2, 5] })
})

test.each(['close', 'draft'] as const)('late preview cannot replace a %s action', async (action) => {
  const { store, preview, run } = await setup()
  const result = { target, sample: [], sampleTruncated: false, overwrittenCells: 0, revision: 7 }
  let finish!: (value: typeof result) => void
  preview.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const pending = run('open')
  await run(action === 'close' ? 'close' : { type: 'draft', patch: { destination: 'D1' } })
  const state = store.getter(textColumnsPanelAtom)
  finish(result)
  await pending
  expect(store.getter(textColumnsPanelAtom)).toBe(state)
})

test('locked output is blocked before writing even if the source itself is unlocked', async () => {
  const { store, write, run } = await setup()
  await run('open')
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [source] } })
  expect(await run('apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
  expect(store.getter(textColumnsPanelAtom).error).toContain('locked')
})

test.each(['selection', 'connection'] as const)('changed %s prevents apply', async (kind) => {
  const { store, write, run } = await setup()
  await run('open')
  if (kind === 'selection') store.setter(setSelectionAtom, { kind: 'cell', sheetId: 's',
    anchor: { row: 5, col: 0 }, focus: { row: 5, col: 0 } })
  else store.setter(setRustWorkbookConnectionAtom, { request: vi.fn(), dispose: vi.fn() })
  expect(await run('apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test('pending apply blocks duplicate submissions and errors require a new preview', async () => {
  const { store, write, run } = await setup()
  let reject!: (error: Error) => void
  write.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
  await run('open')
  const pending = run('apply')
  expect(await run('apply')).toBe(false)
  expect(await run('close')).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
  reject(new Error('The workbook changed. Preview again.'))
  expect(await pending).toBe(false)
  expect(store.getter(textColumnsPanelAtom)).toMatchObject({ preview: null, status: 'idle', overwrite: false })
  expect(await run('apply')).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
})
