import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, numberFormatPanelAtom, runNumberFormatPanelAtom,
  runVisibleProjectionAtom, selectCellAtom, selectionAtom, setSelectionBoundsAtom,
  setRustWorkbookConnectionAtom, startCellEditingFromProjectionAtom,
  type SpreadsheetNumberFormat, type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup(numberFormat?: SpreadsheetNumberFormat) {
  let format = { numberFormat, italic: true }
  let revision = 1
  const project = (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    revision, window: request.window,
    cells: [{ row: 0, col: 0, displayValue: '12.5', numericValue: 12.5, format }],
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
    previewNumberFormat: async () => '12.50',
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
  [undefined, { category: 'number', digits: '2', thousands: false, symbol: '$' }],
  [{ kind: 'decimal', digits: 3, thousands: true }, { category: 'number', digits: '3', thousands: true }],
  [{ kind: 'percentage' }, { category: 'percent', digits: '0' }],
  [{ kind: 'currency', symbol: '€', digits: 1 }, { category: 'currency', digits: '1', symbol: '€' }],
  [{ kind: 'currency', symbol: '' }, { category: 'currency', symbol: '', digits: '2' }],
  [{ kind: 'date', pattern: 'yyyy-mm-dd' }, { category: 'date', datePattern: 'yyyy-mm-dd' }],
  [{ kind: 'text' }, { category: 'text' }],
  [{ kind: 'scientific', digits: 3 }, { category: 'scientific', digits: '3' }],
  [{ kind: 'fraction', denominator: 16 }, { category: 'fraction', denominator: '16' }],
  [{ kind: 'fraction' }, { category: 'fraction', denominator: 'one-digit' }],
  [{ kind: 'time', pattern: '[h]:mm:ss' }, { category: 'time', pattern: '[h]:mm:ss' }],
] as const)('opens from projection %j without writing', async (format, expected) => {
  const { store, write } = await setup(format)
  expect(await store.setter(runNumberFormatPanelAtom, 'open')).toBe(true)
  expect(store.getter(numberFormatPanelAtom).draft).toMatchObject(expected)
  expect(write).not.toHaveBeenCalled()
  await store.setter(runNumberFormatPanelAtom, 'close')
  expect(store.getter(numberFormatPanelAtom).target).toBeNull()
})

test.each([
  [{ category: 'number', digits: '0', thousands: false }, { kind: 'number', digits: 0, thousands: false }],
  [{ category: 'number', digits: '15', thousands: true }, { kind: 'number', digits: 15, thousands: true }],
  [{ category: 'percent', digits: '3', thousands: true }, { kind: 'percent', digits: 3 }],
  [{ category: 'currency', digits: '1', symbol: '¥' }, { kind: 'currency', digits: 1, symbol: '¥' }],
  [{ category: 'currency', digits: '0', symbol: '' }, { kind: 'currency', digits: 0, symbol: '' }],
  [{ category: 'currency', digits: '2', symbol: 'USD ' }, { kind: 'currency', digits: 2, symbol: 'USD ' }],
  [{ category: 'scientific', digits: '4' }, { kind: 'scientific', digits: 4 }],
  [{ category: 'fraction', denominator: 'two-digit', digits: '' }, { kind: 'fraction', denominator: 'two-digit' }],
  [{ category: 'fraction', denominator: '16' }, { kind: 'fraction', denominator: 16 }],
  [{ category: 'fraction', denominator: '4294967295' }, { kind: 'fraction', denominator: 4294967295 }],
  [{ category: 'time', pattern: 'h:mm AM/PM', digits: '' }, { kind: 'time', pattern: 'h:mm AM/PM' }],
  [{ category: 'date', datePattern: 'dd-mmm-yy', digits: '' }, { kind: 'date', pattern: 'dd-mmm-yy' }],
  [{ category: 'text', digits: '' }, { kind: 'text' }],
] as const)('applies draft %j with a single format-only mutation', async (patch, expected) => {
  const { store, write } = await setup()
  await store.setter(runNumberFormatPanelAtom, 'open')
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch })
  expect(write).not.toHaveBeenCalled()
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.calls[0]![0]).toMatchObject({ format: { numberFormat: expected }, writeMode: 'patch' })
  expect(Object.keys(write.mock.calls[0]![0].format!)).toEqual(['numberFormat'])
  expect(store.getter(numberFormatPanelAtom).target).toBeNull()
})

test.each(['', '-1', '1.5', '16', 'Infinity', 'NaN', '1e1', ' 2 '])(
  'invalid decimal places %s stay editable without writing', async (digits) => {
    const { store, write } = await setup()
    await store.setter(runNumberFormatPanelAtom, 'open')
    await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { digits } })
    expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
    expect(store.getter(numberFormatPanelAtom)).toMatchObject({ busy: false, draft: { digits } })
    expect(store.getter(numberFormatPanelAtom).error).toContain('0 to 15')
    expect(write).not.toHaveBeenCalled()
  },
)

test.each(['x'.repeat(17), '\n', '\u0000', '\u007f'])(
  'invalid currency symbol %j never reaches Rust', async (symbol) => {
    const { store, write } = await setup()
    await store.setter(runNumberFormatPanelAtom, 'open')
    await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'currency', symbol } })
    expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
    expect(store.getter(numberFormatPanelAtom).error).toContain('16 characters')
    expect(write).not.toHaveBeenCalled()
  },
)

test.each(['range', 'row', 'column', 'all'] as const)('format settings preserve %s scope', async (kind) => {
  const { store, write } = await setup()
  store.setter(selectionAtom, kind === 'row' ? { kind, sheetId: 's', rowAnchor: 1, rowFocus: 2 }
    : kind === 'column' ? { kind, sheetId: 's', colAnchor: 1, colFocus: 2 }
      : kind === 'all' ? { kind, sheetId: 's' }
        : { kind, sheetId: 's', anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } })
  await store.setter(runNumberFormatPanelAtom, 'open')
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(true)
  expect(write.mock.calls[0]![0].scope).toBe(kind === 'range' || kind === 'all' ? 'cell' : kind)
})

test.each(['selection', 'connection'] as const)('changed %s blocks stale dialog before write', async (change) => {
  const { store, write } = await setup()
  await store.setter(runNumberFormatPanelAtom, 'open')
  if (change === 'selection') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  else store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection())
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(store.getter(numberFormatPanelAtom).error).toContain('changed')
  expect(write).not.toHaveBeenCalled()
})

test('cancel discards drafts and reopening reads the projection', async () => {
  const { store, write } = await setup({ kind: 'percent', digits: 1 })
  await store.setter(runNumberFormatPanelAtom, 'open')
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { digits: '5' } })
  await store.setter(runNumberFormatPanelAtom, 'close')
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  await store.setter(runNumberFormatPanelAtom, 'open')
  expect(store.getter(numberFormatPanelAtom).draft.digits).toBe('1')
  expect(write).not.toHaveBeenCalled()
})

test('rejected writes keep the complete draft for retry', async () => {
  const { store, write } = await setup()
  write.mockRejectedValueOnce(new Error('native error'))
  await store.setter(runNumberFormatPanelAtom, 'open')
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'currency', symbol: '€' } })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(store.getter(numberFormatPanelAtom)).toMatchObject({ busy: false, draft: { symbol: '€' } })
  expect(store.getter(numberFormatPanelAtom).error).toContain('retrying')
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(2)
})

test.each([false, true])('pending publishes busy, guards controls; connection replaced: %s', async (replace) => {
  const { store, write } = await setup()
  let release!: () => void
  const original = write.getMockImplementation()!
  write.mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => { release = resolve })
    return original(...args)
  })
  await store.setter(runNumberFormatPanelAtom, 'open')
  const notify = vi.fn()
  const unsubscribe = store.sub(numberFormatPanelAtom, notify)
  const pending = store.setter(runNumberFormatPanelAtom, 'apply')
  await Promise.resolve()
  expect(notify).toHaveBeenCalled()
  expect(store.getter(numberFormatPanelAtom).busy).toBe(true)
  for (const action of ['close', 'open', 'apply'] as const)
    expect(await store.setter(runNumberFormatPanelAtom, action)).toBe(false)
  expect(await store.setter(runNumberFormatPanelAtom, {
    type: 'draft', patch: { digits: '5' },
  })).toBe(false)
  if (replace) store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection())
  release()
  expect(await pending).toBe(!replace)
  expect(write).toHaveBeenCalledTimes(1)
  expect(store.getter(numberFormatPanelAtom)).toMatchObject({
    busy: false, error: null, target: null,
  })
  unsubscribe()
})

test('editing prevents both opening and applying a previously opened dialog', async () => {
  const { store, write } = await setup()
  await store.setter(runNumberFormatPanelAtom, 'open')
  store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  await store.setter(runNumberFormatPanelAtom, 'close')
  expect(await store.setter(runNumberFormatPanelAtom, 'open')).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test.each(['0', '-1', '1.5', '4294967296', 'bad', ''])('fraction rejects denominator %j', async (denominator) => {
  const { store, write } = await setup()
  await store.setter(runNumberFormatPanelAtom, 'open')
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'fraction', denominator } })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(store.getter(numberFormatPanelAtom).error).toContain('denominator')
  expect(write).not.toHaveBeenCalled()
})

test('unsupported time pattern is retained for correction, never silently downgraded', async () => {
  const { store, write } = await setup({ kind: 'time', pattern: 'not supported' })
  await store.setter(runNumberFormatPanelAtom, 'open')
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { pattern: 'hh:mm:ss' } })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(true)
})
