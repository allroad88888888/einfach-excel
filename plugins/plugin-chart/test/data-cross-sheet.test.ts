import { expect, test } from 'vitest'
import { chartGridsAtom, loadChartGridAtom } from '../src/core'
import { chartDrawing, num, setupChartRust, text } from './rust-fixture'

const area = { startRow: 0, startCol: 0, endRow: 1, endCol: 1 }
const cells = () => [text(0, 0, 'Name'), text(0, 1, 'Sales'), text(1, 0, 'East'), num(1, 1, 7)]

test('a chart reads an area on another sheet from that sheet', async () => {
  const { store, reads } = setupChartRust(cells())
  await store.setter(loadChartGridAtom, chartDrawing('c', [{ ...area, sheetId: 't' }, area]))
  const sheets = reads().map(([, payload]) => (payload as { request: { sheetId: string } })
    .request.sheetId)
  expect(sheets).toEqual(['t', 's'])
  expect(store.getter(chartGridsAtom).c?.status).toBe('ready')
})

test('an area on a deleted sheet is #REF! without reading', async () => {
  const { store, reads } = setupChartRust(cells())
  await store.setter(loadChartGridAtom, chartDrawing('c', [{ ...area, sheetId: 'gone' }]))
  expect(store.getter(chartGridsAtom).c)
    .toMatchObject({ status: 'error', error: 'The chart data worksheet was deleted.' })
  expect(reads()).toHaveLength(0)
})

test('moving the same cells to another sheet is a different region and reads again', async () => {
  const { store, reads } = setupChartRust(cells())
  await store.setter(loadChartGridAtom, chartDrawing('c', [area]))
  await store.setter(loadChartGridAtom, chartDrawing('c', [{ ...area, sheetId: 't' }]))
  expect(reads()).toHaveLength(2)
})
