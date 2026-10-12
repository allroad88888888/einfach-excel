import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, borderPanelAtom, runBorderPanelAtom, BORDER_PRESETS, BORDER_STYLES,
  runVisibleProjectionAtom, selectCellAtom, selectionAtom, setSelectionBoundsAtom,
  setRustWorkbookConnectionAtom, startCellEditingFromProjectionAtom,
  type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'
import { writeTrackedMutation } from '../src/rust-workbook/tracked-mutation'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

async function setup() {
  let revision = 1
  const project = (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    revision, window: request.window,
    cells: [{ row: 0, col: 0, displayValue: 'A', format: {
      bold: true, borders: { bottom: { style: 'double' as const, color: '#c00000' } },
    } }],
  })
  const write = vi.fn(async (
    request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
  ) => {
    revision += 1
    return { acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision },
      projection: project(projection) }
  })
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

test('opens from native projection, cancel only discards draft', async () => {
  const { store, write } = await setup()
  await store.setter(runBorderPanelAtom, 'open')
  expect(store.getter(borderPanelAtom).draft).toEqual({ preset: 'outside', style: 'double', color: '#c00000' })
  await store.setter(runBorderPanelAtom, { type: 'draft', patch: { color: '#123abc' } })
  await store.setter(runBorderPanelAtom, 'close')
  expect(store.getter(borderPanelAtom).target).toBeNull()
  expect(write).not.toHaveBeenCalled()
})

test.each(BORDER_PRESETS)('%s sends one native range, never per-cell JS writes', async (preset) => {
  const { store, write } = await setup()
  await store.setter(runBorderPanelAtom, 'open')
  await store.setter(runBorderPanelAtom, { type: 'draft', patch: { preset } })
  expect(await store.setter(runBorderPanelAtom, 'apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.calls[0]![0]).toMatchObject({
    format: {}, borderPatch: { preset, style: 'double', color: '#c00000' }, scope: 'cell', writeMode: 'patch',
  })
})

test.each(BORDER_STYLES)('%s preserves style and normalizes hex once', async (style) => {
  const { store, write } = await setup()
  await store.setter(runBorderPanelAtom, 'open')
  await store.setter(runBorderPanelAtom, { type: 'draft', patch: { style, color: '#AB12CD' } })
  await store.setter(runBorderPanelAtom, 'apply')
  expect(write.mock.calls[0]![0].borderPatch).toMatchObject({ style, color: '#ab12cd' })
})

test.each(['red', '#123', '#gggggg', '#12345678', '', 'url(x)'])('invalid color %s never writes', async (color) => {
  const { store, write } = await setup()
  await store.setter(runBorderPanelAtom, 'open')
  await store.setter(runBorderPanelAtom, { type: 'draft', patch: { color } })
  expect(await store.setter(runBorderPanelAtom, 'apply')).toBe(false)
  expect(store.getter(borderPanelAtom).error).toContain('#RRGGBB')
  expect(write).not.toHaveBeenCalled()
})

test.each(['range', 'row', 'column', 'all'] as const)('%s borders stay in the finite selection', async (kind) => {
  const { store, write } = await setup()
  store.setter(selectionAtom, { ...store.getter(selectionAtom), kind })
  await store.setter(runBorderPanelAtom, 'open')
  await store.setter(runBorderPanelAtom, 'apply')
  expect(write.mock.calls[0]![0].scope).toBe('cell')
})

test.each(['selection', 'connection'] as const)('%s changes invalidate an open draft', async (change) => {
  const { store, write } = await setup()
  await store.setter(runBorderPanelAtom, 'open')
  if (change === 'selection') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  else store.setter(setRustWorkbookConnectionAtom, null)
  expect(await store.setter(runBorderPanelAtom, 'apply')).toBe(false)
  expect(store.getter(borderPanelAtom).error).toContain('changed')
  expect(write).not.toHaveBeenCalled()
})

test('editing blocks opening; native rejection leaves an editable draft', async () => {
  const { store, write } = await setup()
  write.mockRejectedValueOnce(new Error('rejected'))
  await store.setter(runBorderPanelAtom, 'open')
  expect(await store.setter(runBorderPanelAtom, 'apply')).toBe(false)
  expect(store.getter(borderPanelAtom)).toMatchObject({ busy: false, error: expect.stringContaining('confirm') })
  expect(await store.setter(runBorderPanelAtom, 'apply')).toBe(true)
  store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } })
  expect(await store.setter(runBorderPanelAtom, 'open')).toBe(false)
})

test('duplicate apply cannot send another write while one is pending', async () => {
  const { store, write } = await setup()
  const original = write.getMockImplementation()!
  let release!: () => void
  write.mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => { release = resolve })
    return original(...args)
  })
  await store.setter(runBorderPanelAtom, 'open')
  const pending = store.setter(runBorderPanelAtom, 'apply')
  expect(store.getter(borderPanelAtom).busy).toBe(true)
  expect(await store.setter(runBorderPanelAtom, 'apply')).toBe(false)
  expect(await store.setter(runBorderPanelAtom, 'close')).toBe(false)
  release()
  await pending
  expect(write).toHaveBeenCalledTimes(1)
})

test('transport delegates border history extent to the single native operation', () => {
  const border = vi.fn(), begin = vi.fn(), finish = vi.fn(), format = vi.fn()
  const workbook = { patch_range_borders: border, history_begin: begin, history_finish: finish,
    patch_format_selection: format } as unknown as WasmWorkbook
  const range = { rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 3 }
  const borderPatch = { preset: 'outside', style: 'double', color: '#123abc' } as const
  writeTrackedMutation(workbook, 0, { kind: 'set-format-range', sheetId: 's', range,
    format: {}, scope: 'row', writeMode: 'patch', borderPatch })
  expect(border.mock.calls).toEqual([[0, 2, 1, 4, 3, borderPatch]])
  expect(begin).not.toHaveBeenCalled()
  expect(finish).not.toHaveBeenCalled()
  expect(format).not.toHaveBeenCalled()
})
