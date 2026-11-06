import { describe, expect, test } from 'vitest'
import {
  refreshSheetDrawingsAtom, selectDrawingAtom, selectedDrawingAtom, sheetDrawingsAtom,
  startEditingAtom, drawingErrorAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import {
  chartSettingsAtom, dismissChartErrorAtom, insertChartAtom, insertChartFeedbackAtom,
  openChartSettingsAtom, selectedChartAtom, updateChartSettingsAtom, DEFAULT_CHART_HEIGHT,
  DEFAULT_CHART_WIDTH, parseChartSpec,
} from '../src/core'
import {
  chartDrawing, num, publishProjection, select, setupChartRust, switchSheet, text,
} from './rust-fixture'

const data = () => [text(0, 0, 'Name'), text(0, 1, 'Sales'), text(1, 0, 'East'), num(1, 1, 10),
  text(2, 0, 'West'), num(2, 1, 20), text(3, 0, 'North'), num(3, 1, 30)]
const A1B4 = { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 1 }
const refsOfA1B4 = { startRow: 0, startCol: 0, endRow: 3, endCol: 1 }

describe('insertChartAtom', () => {
  test('inserts one chart right of the selection with a layout guessed from the data', async () => {
    const { store, writes, request } = setupChartRust(data())
    select(store, A1B4)
    expect(await store.setter(insertChartAtom, 'column')).toBe(true)
    expect(request.mock.calls.filter(([name]) => name === 'drawings.set')).toHaveLength(1)
    const [call] = writes('drawings.set')
    expect(call).toMatchObject({ sheetId: 's', projection: { kind: 'visible-window' } })
    expect(call.drawing).toMatchObject({ id: 'chart-1', kind: 'chart', refs: [refsOfA1B4],
      anchor: { row: 0, col: 3, offsetX: 0, offsetY: 0, width: DEFAULT_CHART_WIDTH,
        height: DEFAULT_CHART_HEIGHT },
      payload: { type: 'column', seriesIn: 'columns', headerRow: true, headerCol: true } })
  })

  test('selects the new chart and clears the feedback', async () => {
    const { store } = setupChartRust(data())
    select(store, A1B4)
    await store.setter(insertChartAtom, 'line')
    expect(store.getter(selectedDrawingAtom)?.id).toBe('chart-1')
    expect(store.getter(selectedChartAtom)?.id).toBe('chart-1')
    expect(store.getter(insertChartFeedbackAtom)).toEqual({ error: null, busy: false })
  })

  test("'recommended' picks the type from the data shape (one positive series → pie)", async () => {
    const { store, writes } = setupChartRust(data())
    select(store, A1B4)
    await store.setter(insertChartAtom, 'recommended')
    expect(writes('drawings.set')[0].drawing.payload.type).toBe('pie')
  })

  test("'recommended' falls back to a clustered column for a plain table", async () => {
    const rows = [text(0, 1, 'A'), text(0, 2, 'B'), text(1, 0, 'x'), num(1, 1, 1), num(1, 2, -2),
      text(2, 0, 'y'), num(2, 1, 3), num(2, 2, 4)]
    const { store, writes } = setupChartRust(rows)
    select(store, { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 })
    await store.setter(insertChartAtom, 'recommended')
    expect(writes('drawings.set')[0].drawing.payload.type).toBe('column')
  })

  test('a multi-area selection becomes one chart with every area as a ref', async () => {
    const { store, writes, reads } = setupChartRust([text(2, 0, 'x'), num(3, 0, 1), num(4, 0, 2),
      text(2, 3, 'y'), num(3, 3, 5), num(4, 3, 6)])
    select(store, { rowStart: 2, rowEnd: 4, colStart: 0, colEnd: 0 },
      { rowStart: 2, rowEnd: 4, colStart: 3, colEnd: 3 })
    expect(await store.setter(insertChartAtom, 'column')).toBe(true)
    expect(reads()).toHaveLength(2)
    expect(writes('drawings.set')[0].drawing).toMatchObject({
      refs: [{ startRow: 2, startCol: 0, endRow: 4, endCol: 0 },
        { startRow: 2, startCol: 3, endRow: 4, endCol: 3 }],
      anchor: { row: 2, col: 5 } })
  })

  test('picks an id that is not already used on the sheet', async () => {
    const { store, rust, writes } = setupChartRust(data())
    rust.drawings = [chartDrawing('chart-2', [refsOfA1B4])]
    await store.setter(refreshSheetDrawingsAtom)
    select(store, A1B4)
    await store.setter(insertChartAtom, 'column')
    expect(writes('drawings.set')[0].drawing.id).toBe('chart-3')
    expect(store.getter(sheetDrawingsAtom).map((entry) => entry.id)).toEqual(['chart-2', 'chart-3'])
  })

  test('a selection of more than 10,000 cells is an error and sends nothing', async () => {
    const { store, request } = setupChartRust(data())
    select(store, { rowStart: 0, rowEnd: 200, colStart: 0, colEnd: 49 })
    request.mockClear()
    expect(await store.setter(insertChartAtom, 'column')).toBe(false)
    expect(store.getter(insertChartFeedbackAtom).error)
      .toBe('Choose at most 10,000 cells for a chart.')
    expect(request).not.toHaveBeenCalled()
    store.setter(dismissChartErrorAtom)
    expect(store.getter(insertChartFeedbackAtom).error).toBeNull()
  })

  test('a single cell, or areas that cannot line up, are errors', async () => {
    const { store, request } = setupChartRust(data())
    request.mockClear()
    select(store, { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 })
    expect(await store.setter(insertChartAtom, 'column')).toBe(false)
    expect(store.getter(insertChartFeedbackAtom).error)
      .toBe('Select the chart data first, including headers.')
    select(store, { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 },
      { rowStart: 5, rowEnd: 9, colStart: 0, colEnd: 2 })
    expect(await store.setter(insertChartAtom, 'column')).toBe(false)
    expect(store.getter(insertChartFeedbackAtom).error).toBe('The chart areas must line up.')
    expect(request).not.toHaveBeenCalled()
  })

  test('a failed data read is reported and nothing is inserted', async () => {
    const { store, rust, writes } = setupChartRust(data())
    select(store, A1B4)
    rust.failRead = 'engine down'
    expect(await store.setter(insertChartAtom, 'column')).toBe(false)
    expect(store.getter(insertChartFeedbackAtom).error).toContain('engine down')
    expect(store.getter(insertChartFeedbackAtom).busy).toBe(false)
    expect(writes('drawings.set')).toHaveLength(0)
  })

  test('a Rust rejection (for example a protected sheet) is carried back as the error', async () => {
    const { store, rust } = setupChartRust(data())
    select(store, A1B4)
    rust.failDrawings = 'The sheet is protected.'
    expect(await store.setter(insertChartAtom, 'column')).toBe(false)
    expect(store.getter(drawingErrorAtom)).toBe('The sheet is protected.')
    expect(store.getter(insertChartFeedbackAtom))
      .toEqual({ error: 'The sheet is protected.', busy: false })
    expect(store.getter(selectedDrawingAtom)).toBeNull()
  })

  test('a second insert while the first is still reading is ignored', async () => {
    const { store, rust, writes } = setupChartRust(data())
    select(store, A1B4)
    rust.defer = true
    const first = store.setter(insertChartAtom, 'column')
    expect(store.getter(insertChartFeedbackAtom).busy).toBe(true)
    expect(await store.setter(insertChartAtom, 'column')).toBe(false)
    rust.defer = false
    rust.release.forEach((release) => release())
    expect(await first).toBe(true)
    expect(writes('drawings.set')).toHaveLength(1)
    expect(store.getter(insertChartFeedbackAtom).busy).toBe(false)
  })

  test('does nothing while a cell is being edited', async () => {
    const { store, request } = setupChartRust(data())
    select(store, A1B4)
    store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell',
      draft: 'Name' })
    request.mockClear()
    expect(await store.setter(insertChartAtom, 'column')).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  test('does not insert when the user switched sheets while reading', async () => {
    const { store, rust, writes } = setupChartRust(data())
    select(store, A1B4)
    rust.defer = true
    const pending = store.setter(insertChartAtom, 'column')
    switchSheet(store, 't')
    rust.release.forEach((release) => release())
    expect(await pending).toBe(false)
    expect(writes('drawings.set')).toHaveLength(0)
  })
})

async function withChart() {
  const setup = setupChartRust(data())
  setup.rust.drawings = [chartDrawing('chart-1', [refsOfA1B4], { payload: { type: 'line', title: 'T' } }),
    { ...chartDrawing('img-1', []), kind: 'image' }]
  await setup.store.setter(refreshSheetDrawingsAtom)
  setup.request.mockClear()
  return setup
}

describe('chart settings', () => {
  test('is closed until a chart is opened; only charts can be opened', async () => {
    const { store } = await withChart()
    expect(store.getter(chartSettingsAtom)).toEqual({ open: false })
    expect(store.setter(openChartSettingsAtom, 'img-1')).toBe(false)
    expect(store.setter(openChartSettingsAtom, 'missing')).toBe(false)
    expect(store.setter(openChartSettingsAtom)).toBe(false)
    expect(store.getter(chartSettingsAtom).open).toBe(false)
  })

  test('opening by id, or from the selected chart, exposes its spec and range text', async () => {
    const { store } = await withChart()
    expect(store.setter(openChartSettingsAtom, 'chart-1')).toBe(true)
    const panel = store.getter(chartSettingsAtom)
    expect(panel).toMatchObject({ open: true, rangeDraft: 'A1:B4', error: null, busy: false,
      spec: { type: 'line', title: 'T' } })
    store.setter(updateChartSettingsAtom, { type: 'close' })
    store.setter(selectDrawingAtom, 'chart-1')
    expect(store.setter(openChartSettingsAtom)).toBe(true)
    expect(store.getter(chartSettingsAtom).open).toBe(true)
  })

  test('a spec change is exactly one drawings.set that keeps position and refs', async () => {
    const { store, writes, request } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    expect(await store.setter(updateChartSettingsAtom,
      { type: 'spec', patch: { legend: 'bottom', title: 'Revenue' } })).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    const [call] = writes('drawings.set')
    expect(call.drawing).toMatchObject({ id: 'chart-1', refs: [refsOfA1B4],
      anchor: { row: 0, col: 5, width: DEFAULT_CHART_WIDTH } })
    expect(parseChartSpec(call.drawing.payload))
      .toMatchObject({ type: 'line', legend: 'bottom', title: 'Revenue' })
    const panel = store.getter(chartSettingsAtom)
    expect(panel).toMatchObject({ open: true, busy: false })
    expect(panel.open && panel.spec.legend).toBe('bottom')
  })

  test('typing a range draft only edits the text; nothing is sent', async () => {
    const { store, request } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    expect(await store.setter(updateChartSettingsAtom, { type: 'rangeDraft', text: 'C1:D4' })).toBe(true)
    expect(store.getter(chartSettingsAtom)).toMatchObject({ rangeDraft: 'C1:D4', error: null })
    expect(request).not.toHaveBeenCalled()
  })

  test('an unparseable draft reports an error and sends nothing', async () => {
    const { store, request } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    await store.setter(updateChartSettingsAtom, { type: 'rangeDraft', text: 'not a range' })
    expect(await store.setter(updateChartSettingsAtom, { type: 'applyRange' })).toBe(false)
    expect(store.getter(chartSettingsAtom)).toMatchObject({ error: 'Enter a range such as B2:D10.' })
    // Typing again clears the message.
    await store.setter(updateChartSettingsAtom, { type: 'rangeDraft', text: 'A1' })
    expect(store.getter(chartSettingsAtom)).toMatchObject({ error: null })
    expect(request).not.toHaveBeenCalled()
  })

  test('a parseable but unusable draft is rejected with the area message', async () => {
    const { store, request } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    await store.setter(updateChartSettingsAtom, { type: 'rangeDraft', text: 'A1' })
    expect(await store.setter(updateChartSettingsAtom, { type: 'applyRange' })).toBe(false)
    expect(store.getter(chartSettingsAtom))
      .toMatchObject({ error: 'Select the chart data first, including headers.' })
    await store.setter(updateChartSettingsAtom, { type: 'rangeDraft', text: 'A1:B3,C1:C9' })
    await store.setter(updateChartSettingsAtom, { type: 'applyRange' })
    expect(store.getter(chartSettingsAtom)).toMatchObject({ error: 'The chart areas must line up.' })
    expect(request).not.toHaveBeenCalled()
  })

  test('applying a range sends the normalized refs and rewrites the text', async () => {
    const { store, writes } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    await store.setter(updateChartSettingsAtom, { type: 'rangeDraft', text: ' $d$4 : b2 ' })
    expect(await store.setter(updateChartSettingsAtom, { type: 'applyRange' })).toBe(true)
    expect(writes('drawings.set')).toHaveLength(1)
    expect(writes('drawings.set')[0].drawing.refs)
      .toEqual([{ startRow: 1, startCol: 1, endRow: 3, endCol: 3 }])
    expect(store.getter(chartSettingsAtom)).toMatchObject({ rangeDraft: 'B2:D4', busy: false })
  })

  test('a Rust failure leaves the panel open, not busy, and reports through drawingErrorAtom', async () => {
    const { store, rust } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    rust.failDrawings = 'The sheet is protected.'
    expect(await store.setter(updateChartSettingsAtom, { type: 'spec', patch: { gridlines: false } }))
      .toBe(false)
    expect(store.getter(chartSettingsAtom)).toMatchObject({ open: true, busy: false })
    expect(store.getter(drawingErrorAtom)).toBe('The sheet is protected.')
  })

  test('close hides the panel; updates are ignored while it is closed', async () => {
    const { store, request } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    expect(await store.setter(updateChartSettingsAtom, { type: 'close' })).toBe(true)
    expect(store.getter(chartSettingsAtom)).toEqual({ open: false })
    expect(await store.setter(updateChartSettingsAtom, { type: 'spec', patch: { title: 'x' } }))
      .toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  test('switching sheets closes the panel for the new sheet', async () => {
    const { store } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    switchSheet(store, 't')
    expect(store.getter(chartSettingsAtom)).toEqual({ open: false })
  })

  test('the panel closes by itself when its chart is deleted', async () => {
    const { store, rust } = await withChart()
    store.setter(openChartSettingsAtom, 'chart-1')
    expect(store.getter(chartSettingsAtom).open).toBe(true)
    rust.drawings = []
    rust.revision = 5
    publishProjection(store, 's', 5)
    await store.setter(refreshSheetDrawingsAtom)
    expect(store.getter(chartSettingsAtom)).toEqual({ open: false })
  })
})
