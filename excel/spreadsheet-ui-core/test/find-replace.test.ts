import { expect, test } from 'vitest'
import { findHarness, findRange } from './support/find-replace-harness'
import {
  activeWorkbookSheetAtom,
  selectionSnapshotAtom,
  setRustWorkbookConnectionAtom,
  viewportMetricsAtom,
} from '../src'

test('next and previous wrap through native match positions and move selection', async () => {
  const r = await findHarness()
  await r.run('next')
  expect(r.state().result).toMatchObject({ index: 0, total: 2, current: { row: 5, col: 1 } })
  expect(r.store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 5, col: 1 })
  await r.run('previous')
  expect(r.state().result?.index).toBe(1)
  await r.run('next')
  expect(r.state().result?.index).toBe(0)
  expect(r.find.mock.calls.map(([input]) => input.offset)).toEqual([0, 1, 0])
  expect(r.replace).not.toHaveBeenCalled()
})

test('selection scope retains the original range after result navigation', async () => {
  const r = await findHarness()
  await r.run({ form: { scope: 'current-selection' } })
  await r.run('next')
  await r.run('next')
  expect(r.find.mock.calls.map(([input]) => input.targets)).toEqual([
    [{ sheetId: 's', range: findRange }],
    [{ sheetId: 's', range: findRange }],
  ])
})

test('workbook scope navigates to a different sheet with its own canvas bounds', async () => {
  const r = await findHarness()
  await r.run({ form: { scope: 'workbook' } })
  r.find.mockResolvedValueOnce({
    revision: 0,
    total: 1,
    matches: [{ sheetId: 'other', row: 900, col: 10, start: 2, end: 5 }],
  })
  expect(await r.run('next')).toBe(true)
  expect(r.store.getter(activeWorkbookSheetAtom)?.id).toBe('other')
  expect(r.store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 900, col: 10 })
  expect(r.store.getter(viewportMetricsAtom)).toMatchObject({
    sheetId: 'other',
    rowCount: 1000,
    colCount: 16,
  })
  expect(r.store.getter(viewportMetricsAtom).scrollTop).toBeGreaterThan(20000)
  expect(r.find.mock.calls[0][0].targets).toHaveLength(2)
})

test('query options invalidate positions but editing the replacement keeps the current match', async () => {
  const r = await findHarness()
  await r.run('next')
  const found = r.state().result
  await r.run({ form: { replacement: 'changed' } })
  expect(r.state().result).toBe(found)
  await r.run({ form: { caseSensitive: true, wholeCell: true, lookIn: 'values' } })
  expect(r.state().result).toBeNull()
  await r.run('next')
  expect(r.find.mock.lastCall![0].query).toEqual({
    needle: 'old',
    caseSensitive: true,
    wholeCell: true,
    lookIn: 'values',
  })
})

test('empty query, no results and native errors have distinct visible feedback', async () => {
  const r = await findHarness()
  await r.run({ form: { needle: '' } })
  expect(await r.run('next')).toBe(false)
  expect(r.state().error).toContain('Enter text')
  expect(r.find).not.toHaveBeenCalled()
  await r.run({ form: { needle: 'none' } })
  r.find.mockResolvedValueOnce({ total: 0, matches: [], revision: 0 })
  await r.run('next')
  expect(r.state().notice).toBe('No matches found.')
  r.find.mockRejectedValueOnce(new Error('Disconnected'))
  await r.run('next')
  expect(r.state().error).toBe('Disconnected')
  expect(r.state().busy).toBeNull()
})

test('closing and reopening rejects an older pending result without a ticket counter', async () => {
  const r = await findHarness()
  let resolve!: (value: Awaited<ReturnType<typeof r.find>>) => void
  r.find.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const pending = r.run('next')
  expect(r.state().busy).toBe('find')
  await Promise.resolve()
  expect(r.find).toHaveBeenCalledTimes(1)
  await r.run('close')
  await r.run({ open: 'find' })
  resolve({ revision: 0, total: 1, matches: [{ sheetId: 's', row: 99, col: 0, start: 0, end: 3 }] })
  expect(await pending).toBe(false)
  expect(r.state().result).toBeNull()
  expect(r.state().busy).toBeNull()
  expect(r.store.getter(selectionSnapshotAtom).activeCell.row).not.toBe(99)
})

test('editing query during a pending find accepts only the new query result', async () => {
  const r = await findHarness()
  let resolve!: (value: Awaited<ReturnType<typeof r.find>>) => void
  r.find.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const previous = r.run('next')
  await Promise.resolve()
  expect(r.find).toHaveBeenCalledTimes(1)
  await r.run({ form: { needle: 'new' } })
  await r.run('next')
  const found = r.state().result
  resolve({ revision: 0, total: 500, matches: [] })
  await previous
  expect(r.state().result).toBe(found)
})

test('disposed connection cannot publish a pending result into another workbook', async () => {
  const r = await findHarness()
  let resolve!: (value: Awaited<ReturnType<typeof r.find>>) => void
  r.find.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const pending = r.run('next')
  await Promise.resolve()
  expect(r.find).toHaveBeenCalledTimes(1)
  r.store.setter(setRustWorkbookConnectionAtom, null)
  resolve({ revision: 0, total: 0, matches: [] })
  expect(await pending).toBe(false)
  expect(r.state().result).toBeNull()
})

test('a shrinking result set repositions instead of remaining past its last match', async () => {
  const r = await findHarness()
  await r.run('next')
  r.find.mockResolvedValueOnce({ revision: 1, total: 1, matches: [] })
  r.find.mockResolvedValueOnce({
    revision: 1,
    total: 1,
    matches: [{ sheetId: 's', row: 7, col: 1, start: 0, end: 3 }],
  })
  await r.run('next')
  expect(r.state().result).toMatchObject({ index: 0, total: 1, current: { row: 7 } })
})
