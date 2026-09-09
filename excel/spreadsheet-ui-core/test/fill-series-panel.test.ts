import { expect, test, vi } from 'vitest'
import {
  configureFillSeriesAtom, createSpreadsheetUi, directionalFillFeedbackAtom, fillSeriesPanelAtom,
  runVisibleProjectionAtom, selectCellAtom, setSelectionBoundsAtom, setSheetProtectionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '../src'

type Input = RustWorkbookCommands['range.fill']['payload']
const result = (p: Input): RustWorkbookCommands['range.fill']['result'] => ({
  acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
  projection: { ...p.projection, cells: [], revision: 1 },
  sizes: { rowHeights: [], colWidths: [] },
})
async function setup() {
  const fill = vi.fn(async (p: Input) => result(p))
  const request = vi.fn(async (cmd: string, p: unknown) => cmd === 'range.fill'
    ? fill(p as Input)
    : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 })
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 9, col: 0 }, extend: true })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 }, reason: 'viewport',
  })
  await store.setter(configureFillSeriesAtom, 'open')
  return { store, fill, request }
}

test.each(['number', 'text-number', 'linear-trend'] as const)('%s reuses one fill RPC', async (kind) => {
  const { store, fill, request } = await setup()
  await store.setter(configureFillSeriesAtom, { field: 'kind', value: kind })
  await store.setter(configureFillSeriesAtom, { field: 'sourceCount', value: '4' })
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(true)
  expect(fill.mock.lastCall![0].request).toMatchObject({
    direction: 'down', series: { kind, sourceCount: 4 },
  })
  expect(fill).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledTimes(2)
  expect(store.getter(fillSeriesPanelAtom).target).toBeNull()
})

test('invalid count, wrong direction, changed selection and cancel never write', async () => {
  const { store, fill } = await setup()
  for (const value of ['', '1', '2.5', '10', 'Infinity']) {
    await store.setter(configureFillSeriesAtom, { field: 'sourceCount', value })
    expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(false)
  }
  await store.setter(configureFillSeriesAtom, { field: 'sourceCount', value: '2' })
  await store.setter(configureFillSeriesAtom, { field: 'direction', value: 'right' })
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(false)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 50, col: 0 } })
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(false)
  expect(store.getter(fillSeriesPanelAtom).error).toContain('selection changed')
  expect(await store.setter(configureFillSeriesAtom, 'close')).toBe(true)
  expect(fill).not.toHaveBeenCalled()
})

test('native failure keeps choices for retry and protection uses the common guard', async () => {
  const { store, fill } = await setup()
  fill.mockRejectedValueOnce(new Error('Samples are not equally spaced'))
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(false)
  expect(store.getter(fillSeriesPanelAtom)).toMatchObject({
    kind: 'number', sourceCount: '2', error: 'Samples are not equally spaced',
  })
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(true)
  await store.setter(configureFillSeriesAtom, 'open')
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(false)
  expect(store.getter(fillSeriesPanelAtom).error).toContain('Unprotect')
  expect(fill).toHaveBeenCalledTimes(2)
})

test('pending fill prevents editing options, dismissal and duplicate submission', async () => {
  const { store, fill } = await setup()
  let finish!: (r: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(configureFillSeriesAtom, 'apply')
  expect(store.getter(directionalFillFeedbackAtom).busy).toBe(true)
  expect(await store.setter(configureFillSeriesAtom, 'close')).toBe(false)
  expect(await store.setter(configureFillSeriesAtom, { field: 'sourceCount', value: '3' })).toBe(false)
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(false)
  finish(result(fill.mock.calls[0]![0]))
  expect(await pending).toBe(true)
  expect(store.getter(fillSeriesPanelAtom).target).toBeNull()
})

test.each(['weekday-name', 'month-name', 'custom-list', 'date'] as const)(
  '%s accepts one source and sends only user options to Rust', async (kind) => {
    const { store, fill } = await setup()
    await store.setter(configureFillSeriesAtom, { field: 'kind', value: kind })
    expect(store.getter(fillSeriesPanelAtom).sourceCount).toBe('1')
    if (kind === 'custom-list') await store.setter(configureFillSeriesAtom, {
      field: 'listText', value: ' Low \r\nMedium\r\nHigh\n',
    })
    expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(true)
    expect(fill.mock.lastCall![0].request.series).toEqual({ kind, sourceCount: 1,
      ...(kind === 'custom-list' ? { customValues: ['Low', 'Medium', 'High'] } : {}),
    })
    expect(fill).toHaveBeenCalledTimes(1)
    await store.setter(configureFillSeriesAtom, 'open')
    if (kind === 'custom-list') expect(store.getter(fillSeriesPanelAtom).listText).toContain('Medium')
  },
)

test('custom list text budget rejects before transport', async () => {
  const { store, fill } = await setup()
  await store.setter(configureFillSeriesAtom, { field: 'kind', value: 'custom-list' })
  await store.setter(configureFillSeriesAtom, { field: 'listText', value: 'x'.repeat(16385) })
  expect(await store.setter(configureFillSeriesAtom, 'apply')).toBe(false)
  expect(store.getter(fillSeriesPanelAtom).error).toContain('16384')
  expect(fill).not.toHaveBeenCalled()
})
