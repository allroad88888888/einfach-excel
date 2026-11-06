import { expect, test, vi } from 'vitest'
import type { SheetDrawing, WorkbookApi, WorkbookChangeEvent } from '@einfach-excel/spreadsheet-ui-core'
import { createChartApi, type ChartChangeEvent } from '../src/core'

type Cell = readonly [number, number, string, number?]
/** 只实现图表门面用到的几个方法；目录与单元格在内存里，写入即生效。 */
function fakeWorkbook(cells: Record<string, readonly Cell[]> = {}) {
  const catalogs = new Map<string, SheetDrawing[]>([['a', []], ['b', []]])
  const listeners = new Set<(event: WorkbookChangeEvent | null) => void>()
  const emit = (sheetId: string) => listeners.forEach((listener) => listener({ connectionId: 'c',
    operationId: 'o', revision: 1, source: 'api', kind: 'host.drawing-set',
    changes: [{ sheetId, ranges: [] }] }))
  const ok = { status: 'ok' as const, changed: true, revision: 1, sheets: [] }
  const api = {
    getDocument: () =>
      ({ sheets: [...catalogs.keys()].map((id) => ({ id, name: id.toUpperCase() })) }),
    readDrawings: vi.fn(async (sheetId: string) => catalogs.has(sheetId)
      ? { status: 'ok', drawings: catalogs.get(sheetId)! }
      : { status: 'error', error: { code: 'INVALID_SHEET', message: 'gone' } }),
    readDisplay: vi.fn(async ({ sheetId }: { sheetId: string }) => ({ status: 'ok', snapshot: {
      cells: (cells[sheetId] ?? []).map(([row, col, displayValue, numericValue]) => ({ row, col,
        displayValue, ...(numericValue === undefined ? {} : { valueKind: 'number', numericValue }) })),
    } })),
    setDrawing: vi.fn(async ({ sheetId, drawing }: { sheetId: string; drawing: SheetDrawing }) => {
      const list = catalogs.get(sheetId)!
      const at = list.findIndex((entry) => entry.id === drawing.id)
      if (at < 0) list.push(drawing)
      else list.splice(at, 1, drawing)
      emit(sheetId)
      return ok
    }),
    removeDrawing: vi.fn(async ({ sheetId, id }: { sheetId: string; id: string }) => {
      catalogs.set(sheetId, catalogs.get(sheetId)!.filter((entry) => entry.id !== id))
      emit(sheetId)
      return ok
    }),
    orderDrawing: vi.fn(async () => ok),
    onChange: (listener: (event: WorkbookChangeEvent | null) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return { api: api as unknown as WorkbookApi, raw: api, catalogs, emit }
}

const SALES: readonly Cell[] = [[0, 0, 'Region'], [0, 1, 'Sales'], [1, 0, 'North'],
  [1, 1, '3', 3], [2, 0, 'South'], [2, 1, '5', 5]]

test('insert reads the data, guesses headers, recommends a type and writes one object', async () => {
  const { api, raw } = fakeWorkbook({ b: SALES })
  const charts = createChartApi(api)
  const result = await charts.insert({ sheetId: 'b', data: 'A1:B3', spec: { title: 'Q1' },
    anchor: { width: 300 } })
  expect(result).toMatchObject({ status: 'ok', chart: { id: 'chart-1', sheetId: 'b', data: 'A1:B3',
    anchor: { row: 0, col: 3, width: 300 }, spec: { type: 'pie', title: 'Q1', headerRow: true } } })
  expect(raw.setDrawing).toHaveBeenCalledOnce()
  expect(await charts.insert({ sheetId: 'b', data: 'A1:B3', type: 'line' }))
    .toMatchObject({ status: 'ok', chart: { id: 'chart-2', spec: { type: 'line' } } })
})

test('insert rejects bad ranges, misaligned areas and duplicate ids before writing', async () => {
  const { api, raw } = fakeWorkbook({ b: SALES })
  const charts = createChartApi(api)
  expect(await charts.insert({ sheetId: 'b', data: 'Z' }))
    .toMatchObject({ status: 'error', error: { code: 'INVALID_RANGE' } })
  expect(await charts.insert({ sheetId: 'b', data: 'A1:B3,D1:D9' }))
    .toMatchObject({ status: 'error', error: { code: 'INVALID_CHART_DATA' } })
  await charts.insert({ sheetId: 'b', data: 'A1:B3', id: 'sales' })
  expect(await charts.insert({ sheetId: 'b', data: 'A1:B3', id: 'sales' }))
    .toMatchObject({ status: 'error', error: { code: 'DUPLICATE_OBJECT_ID' } })
  expect(raw.setDrawing).toHaveBeenCalledOnce()
})

test('data on another sheet is named by sheet and read from that sheet', async () => {
  const { api, raw, catalogs } = fakeWorkbook({ b: SALES })
  const charts = createChartApi(api)
  expect(await charts.insert({ sheetId: 'a', data: 'B!A1:B3', type: 'column' })).toMatchObject({
    status: 'ok', chart: { sheetId: 'a', data: 'B!A1:B3', anchor: { row: 0, col: 3 } } })
  expect(raw.readDisplay).toHaveBeenCalledWith(expect.objectContaining({ sheetId: 'b' }))
  expect(catalogs.get('a')![0]!.refs).toEqual([{ startRow: 0, startCol: 0, endRow: 2, endCol: 1,
    sheetId: 'b' }])
  // 写成所在表的名字等同于同表引用。
  expect(await charts.update('a', 'chart-1', { data: 'A!A1:B3' }))
    .toMatchObject({ status: 'ok', chart: { data: 'A1:B3' } })
  expect(await charts.insert({ sheetId: 'a', data: 'Nope!A1:B3' }))
    .toMatchObject({ status: 'error', error: { code: 'INVALID_RANGE' } })
})

test('update, remove and order only touch chart objects', async () => {
  const { api, raw, catalogs } = fakeWorkbook({ b: SALES })
  const charts = createChartApi(api)
  await charts.insert({ sheetId: 'b', data: 'A1:B3', type: 'column' })
  catalogs.get('b')!.push({ id: 'pic', kind: 'image', refs: [], payload: {},
    anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 10, height: 10 } })
  expect(await charts.update('b', 'chart-1', { spec: { title: 'New' }, data: 'A1:B2',
    anchor: { row: 5 } })).toMatchObject({ status: 'ok',
    chart: { data: 'A1:B2', anchor: { row: 5, col: 3 }, spec: { type: 'column', title: 'New' } } })
  expect(await charts.update('b', 'chart-1', { data: '??' }))
    .toMatchObject({ status: 'error', error: { code: 'INVALID_RANGE' } })
  expect(await charts.remove('b', 'pic'))
    .toMatchObject({ status: 'error', error: { code: 'CHART_NOT_FOUND' } })
  expect(await charts.order('b', 'chart-1', true)).toEqual({ status: 'ok' })
  expect(raw.orderDrawing).toHaveBeenCalledWith({ sheetId: 'b', id: 'chart-1', toFront: true })
  expect(await charts.remove('b', 'chart-1')).toEqual({ status: 'ok' })
  expect(await charts.list()).toEqual({ status: 'ok', charts: [] })
})

test('list reads every sheet in tab order and get finds one chart', async () => {
  const { api } = fakeWorkbook({ a: SALES, b: SALES })
  const charts = createChartApi(api)
  await charts.insert({ sheetId: 'b', data: 'A1:B3' })
  await charts.insert({ sheetId: 'a', data: 'A1:B3' })
  const listed = await charts.list()
  expect(listed.status === 'ok' && listed.charts.map((chart) => chart.sheetId)).toEqual(['a', 'b'])
  expect(await charts.get('a', 'chart-1')).toMatchObject({ status: 'ok', chart: { sheetId: 'a' } })
  expect(await charts.get('a', 'missing'))
    .toMatchObject({ status: 'error', error: { code: 'CHART_NOT_FOUND' } })
})

test('onChange reports insert, update and remove per chart until unsubscribed', async () => {
  const { api, catalogs, emit } = fakeWorkbook({ b: SALES })
  const charts = createChartApi(api)
  const seen: ChartChangeEvent[] = []
  const stop = charts.onChange((event) => seen.push(event))
  await charts.insert({ sheetId: 'b', data: 'A1:B3' })
  await charts.update('b', 'chart-1', { spec: { title: 'T' } })
  // 未改动图表的变化（如编辑单元格）不产生图表事件。
  emit('b')
  await charts.remove('b', 'chart-1')
  await vi.waitFor(() => expect(seen).toHaveLength(3))
  expect(seen.map((event) => [event.type, event.id, event.chart?.spec.title]))
    .toEqual([['insert', 'chart-1', ''], ['update', 'chart-1', 'T'], ['remove', 'chart-1', undefined]])
  // 删表：目录里不再有这张表时，其图表报为删除。
  await charts.insert({ sheetId: 'b', data: 'A1:B3' })
  await vi.waitFor(() => expect(seen).toHaveLength(4))
  catalogs.delete('b')
  emit('a')
  await vi.waitFor(() => expect(seen.at(-1)).toMatchObject({ type: 'remove', sheetId: 'b' }))
  stop()
  catalogs.set('b', [])
  await charts.insert({ sheetId: 'b', data: 'A1:B3' })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(seen).toHaveLength(5)
})
