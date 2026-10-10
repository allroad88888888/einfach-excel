import { expect, test, vi } from 'vitest'
import {
  applySelectionFormatAtom, createSpreadsheetUi, fontSizePanelAtom, runFontSizeAtom,
  runVisibleProjectionAtom, selectCellAtom, selectionAtom, setSelectionBoundsAtom,
  setRustWorkbookConnectionAtom, startCellEditingFromProjectionAtom,
  viewportSizeOverridesAtom,
  type SpreadsheetCellFormat, type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup(fontSize?: number) {
  let format: SpreadsheetCellFormat = { fontSize, italic: true }
  let revision = 1
  const project = (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    revision, window: request.window,
    cells: [{ row: 0, col: 0, displayValue: 'Source', format }],
  })
  const write = vi.fn(async (
    request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
  ) => {
    format = { ...format, ...request.format }
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

test.each([
  [undefined, 'increase', 14], [undefined, 'decrease', 11],
  [13, 'increase', 14], [13, 'decrease', 12], [23, 'increase', 24], [23, 'decrease', 22],
  [1, 'increase', 2], [256, 'increase', 512], [512, 'decrease', 256],
] as const)('size %s %s writes the next size %s once', async (current, action, expected) => {
  const { store, write } = await setup(current)
  expect(await store.setter(runFontSizeAtom, action)).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.calls[0]![0]).toMatchObject({ format: { fontSize: expected }, writeMode: 'patch' })
  expect(Object.keys(write.mock.calls[0]![0].format!)).toEqual(['fontSize'])
})

test.each([[1, 'decrease'], [512, 'increase']] as const)('size %s %s is a no-op at the boundary',
  async (current, action) => {
    const { store, write } = await setup(current)
    expect(await store.setter(runFontSizeAtom, action)).toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(store.getter(fontSizePanelAtom).error).toBeNull()
  })

test.each(['1', '13', '23', '512'])('custom %s is written only on apply', async (draft) => {
  const { store, write } = await setup(16)
  await store.setter(runFontSizeAtom, 'open')
  expect(store.getter(fontSizePanelAtom).draft).toBe('16')
  await store.setter(runFontSizeAtom, { type: 'draft', value: draft })
  expect(write).not.toHaveBeenCalled()
  expect(await store.setter(runFontSizeAtom, 'apply')).toBe(true)
  expect(write.mock.calls[0]![0].format).toEqual({ fontSize: Number(draft) })
  expect(store.getter(fontSizePanelAtom).witness).toBeNull()
})

test.each(['', '0', '-1', '12.5', '513', 'NaN', 'Infinity', 'large'])(
  'invalid draft %s stays open without a write', async (draft) => {
    const { store, write } = await setup()
    await store.setter(runFontSizeAtom, 'open')
    await store.setter(runFontSizeAtom, { type: 'draft', value: draft })
    expect(await store.setter(runFontSizeAtom, 'apply')).toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(store.getter(fontSizePanelAtom)).toMatchObject({ draft, busy: false })
    expect(store.getter(fontSizePanelAtom).error).toContain('whole-number')
    expect(store.getter(fontSizePanelAtom).witness).not.toBeNull()
  })

test.each([0, -1, 12.5, 513, NaN, Infinity])('both entry points reject invalid size %s', async (value) => {
  const { store, write } = await setup()
  expect(await store.setter(runFontSizeAtom, { type: 'set', value })).toBe(false)
  expect(await store.setter(applySelectionFormatAtom, { type: 'font-size', value })).toBe('blocked')
  expect(write).not.toHaveBeenCalled()
})

test.each(['range', 'row', 'column'] as const)('custom size retains %s scope', async (kind) => {
  const { store, write } = await setup()
  store.setter(selectionAtom, kind === 'row'
    ? { kind, sheetId: 's', rowAnchor: 1, rowFocus: 2 }
    : kind === 'column' ? { kind, sheetId: 's', colAnchor: 1, colFocus: 2 }
      : { kind, sheetId: 's', anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } })
  await store.setter(runFontSizeAtom, 'open')
  await store.setter(runFontSizeAtom, { type: 'draft', value: '23' })
  expect(await store.setter(runFontSizeAtom, 'apply')).toBe(true)
  expect(write.mock.calls[0]![0].scope).toBe(kind === 'range' ? 'cell' : kind)
})

test('cancel and changed selection never apply an old draft', async () => {
  const { store, write } = await setup()
  await store.setter(runFontSizeAtom, 'open')
  await store.setter(runFontSizeAtom, { type: 'draft', value: '23' })
  await store.setter(runFontSizeAtom, 'close')
  expect(write).not.toHaveBeenCalled()
  await store.setter(runFontSizeAtom, 'open')
  expect(store.getter(fontSizePanelAtom).draft).toBe('12')
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  expect(await store.setter(runFontSizeAtom, 'apply')).toBe(false)
  expect(store.getter(fontSizePanelAtom).error).toContain('selection changed')
  expect(write).not.toHaveBeenCalled()
})

test('rejection keeps the custom draft and retries without resetting it', async () => {
  const { store, write } = await setup()
  write.mockRejectedValueOnce(new Error('native error'))
  await store.setter(runFontSizeAtom, 'open')
  await store.setter(runFontSizeAtom, { type: 'draft', value: '23' })
  expect(await store.setter(runFontSizeAtom, 'apply')).toBe(false)
  expect(store.getter(fontSizePanelAtom)).toMatchObject({ draft: '23', busy: false })
  expect(store.getter(fontSizePanelAtom).error).toContain('retrying')
  expect(await store.setter(runFontSizeAtom, 'apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(2)
})

test.each([['increase', '14'], ['decrease', '11']] as const)(
  'failed %s opens the same dialog with attempted size %s', async (action, draft) => {
    const { store, write } = await setup()
    write.mockRejectedValueOnce(new Error('native error'))
    expect(await store.setter(runFontSizeAtom, action)).toBe(false)
    expect(store.getter(fontSizePanelAtom)).toMatchObject({ draft, busy: false })
    expect(store.getter(fontSizePanelAtom).witness).not.toBeNull()
    expect(await store.setter(runFontSizeAtom, 'apply')).toBe(true)
    expect(write.mock.calls[1]![0].format).toEqual({ fontSize: Number(draft) })
  },
)

test('pending notifies subscribers and blocks duplicate changes', async () => {
  const { store, write } = await setup()
  let release!: () => void
  const original = write.getMockImplementation()!
  write.mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => { release = resolve })
    return original(...args)
  })
  const notify = vi.fn()
  const unsubscribe = store.sub(fontSizePanelAtom, notify)
  const pending = store.setter(runFontSizeAtom, 'increase')
  await Promise.resolve()
  expect(notify).toHaveBeenCalled()
  expect(store.getter(fontSizePanelAtom).busy).toBe(true)
  expect(await store.setter(runFontSizeAtom, 'decrease')).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
  release()
  expect(await pending).toBe(true)
  expect(store.getter(fontSizePanelAtom).busy).toBe(false)
  unsubscribe()
})

test('replacing the connection releases pending without publishing an old error', async () => {
  const { store, write } = await setup()
  let release!: () => void
  write.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => { release = resolve })
    throw new Error('old connection')
  })
  const pending = store.setter(runFontSizeAtom, 'increase')
  store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection())
  release()
  expect(await pending).toBe(false)
  expect(store.getter(fontSizePanelAtom)).toMatchObject({ busy: false, error: null, witness: null })
})

test('editing blocks opening and quick writes', async () => {
  const { store, write } = await setup()
  store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } })
  expect(await store.setter(runFontSizeAtom, 'open')).toBe(false)
  expect(await store.setter(runFontSizeAtom, 'increase')).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test.each([[37, 52], [512, 622]])('font %s publishes offscreen native height %s', async (font, height) => {
  const { store, write } = await setup()
  store.setter(setSelectionBoundsAtom, { rowCount: 1001, colCount: 10 })
  store.setter(selectionAtom, { kind: 'column', sheetId: 's', colAnchor: 1, colFocus: 1 })
  const original = write.getMockImplementation()!
  write.mockImplementationOnce(async (...args) => ({
    ...await original(...args),
    sizes: { rowHeights: [{ rowIndex: 1000, heightPx: height }], colWidths: [] },
  }))
  expect(await store.setter(runFontSizeAtom, { type: 'set', value: font })).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s?.[1000]).toBe(height)
})
