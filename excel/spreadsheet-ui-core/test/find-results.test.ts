import { expect, test } from 'vitest'
import { selectionSnapshotAtom } from '../src'
import { findHarness } from './support/find-replace-harness'

test('find all uses a bounded page and retains the full native count', async () => {
  const r = await findHarness()
  r.find.mockImplementation(async ({ offset, limit }) => ({
    revision: 0,
    total: 250,
    matches: Array.from({ length: Math.min(limit, 250 - offset) }, (_, i) => ({
      sheetId: 'other',
      row: offset + i,
      col: 0,
      start: 0,
      end: 3,
    })),
  }))
  await r.run({ form: { wildcards: true, needle: 'a*', scope: 'workbook' } })
  await r.run('find-all')
  expect(r.find.mock.lastCall![0]).toMatchObject({
    offset: 0,
    limit: 100,
    query: { wildcards: true },
  })
  expect(r.state().result?.total).toBe(250)
  expect(r.state().result?.page?.matches).toHaveLength(100)
  await r.run({ page: 200 })
  expect(r.state().result?.page?.offset).toBe(200)
  expect(r.state().result?.page?.matches).toHaveLength(50)
  await r.run({ match: 249 })
  expect(r.find.mock.lastCall![0]).toMatchObject({ offset: 249, limit: 1 })
  expect(r.store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 'other', row: 249, col: 0 })
  expect(r.state().result?.page?.matches).toHaveLength(50)
})

test('a changed workbook rejects a stale result click instead of navigating to a different cell', async () => {
  const r = await findHarness()
  await r.run('find-all')
  const selected = r.store.getter(selectionSnapshotAtom).activeCell
  r.find.mockResolvedValueOnce({
    total: 2,
    revision: 1,
    matches: [{ sheetId: 's', row: 99, col: 0, start: 0, end: 3 }],
  })
  expect(await r.run({ match: 1 })).toBe(false)
  expect(r.state().error).toContain('Find all again')
  expect(r.state().result).toBeNull()
  expect(r.store.getter(selectionSnapshotAtom).activeCell).toEqual(selected)
})

test('query changes clear the list; replacement changes retain it until the write finishes', async () => {
  const r = await findHarness()
  await r.run('find-all')
  const page = r.state().result?.page
  await r.run({ form: { replacement: 'x' } })
  expect(r.state().result?.page).toBe(page)
  await r.run('replace-current')
  expect(r.state().result).toBeNull()
  await r.run('find-all')
  await r.run({ form: { wildcards: true } })
  expect(r.state().result).toBeNull()
})

test('result positions must be valid and closing discards a pending page', async () => {
  const r = await findHarness()
  for (const page of [-1, NaN, Infinity, 0.5]) expect(await r.run({ page })).toBe(false)
  expect(r.find).not.toHaveBeenCalled()
  expect(await r.run({ match: 0 })).toBe(false)
  let resolve!: (value: Awaited<ReturnType<typeof r.find>>) => void
  r.find.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const pending = r.run('find-all')
  await Promise.resolve()
  await r.run('close')
  resolve({ total: 0, matches: [], revision: 0 })
  expect(await pending).toBe(false)
  expect(r.state().result).toBeNull()
})
