import { expect, test } from 'vitest'
import { findHarness } from './support/find-replace-harness'
import { projectionSnapshotAtom, setSheetProtectionAtom, viewportSizeOverridesAtom } from '../src'

test('current replacement sends one native mutation with its original UTF-16 position', async () => {
  const r = await findHarness()
  await r.run('next')
  const count = r.request.mock.calls.length
  expect(await r.run('replace-current')).toBe(true)
  expect(r.replace).toHaveBeenCalledTimes(1)
  expect(r.request).toHaveBeenCalledTimes(count + 1)
  expect(r.replace.mock.lastCall![0]).toMatchObject({
    current: { sheetId: 's', row: 5, col: 1, start: 0, end: 3 },
    expectedRevision: 0,
    replacement: 'new',
  })
  expect(r.state().result).toBeNull()
  expect(r.state().notice).toContain('Replaced 1 occurrence(s) in 1 cell(s)')
  expect(r.store.getter(projectionSnapshotAtom).result?.revision).toBe(1)
  expect(r.store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s?.['89']).toBe(60)
})

test('all replaces the query without a current page or preliminary fake search', async () => {
  const r = await findHarness()
  await r.run({ form: { scope: 'workbook' } })
  expect(await r.run('replace-all')).toBe(true)
  expect(r.find).not.toHaveBeenCalled()
  expect(r.replace.mock.lastCall![0]).not.toHaveProperty('current')
  expect(r.replace.mock.lastCall![0].targets).toHaveLength(2)
})

test('current replacement requires a found position and protected targets cannot write', async () => {
  const r = await findHarness()
  expect(await r.run('replace-current')).toBe(false)
  expect(r.replace).not.toHaveBeenCalled()
  r.store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await r.run('replace-all')).toBe(false)
  expect(r.state().error).toContain('Unprotect')
  expect(r.replace).not.toHaveBeenCalled()
})

test('native rejection clears the stale cursor and allows an explicit corrected attempt', async () => {
  const r = await findHarness()
  await r.run('next')
  r.replace.mockRejectedValueOnce(new Error('The workbook changed. Find again before replacing.'))
  expect(await r.run('replace-current')).toBe(false)
  expect(r.state().result).toBeNull()
  expect(r.state().error).toContain('Find again')
  expect(r.store.getter(projectionSnapshotAtom).result?.revision).toBe(0)
  await r.run('next')
  expect(await r.run('replace-current')).toBe(true)
})

test('busy mutation cannot be sent twice, closed, or redirected by changing the form', async () => {
  const r = await findHarness()
  let resolve!: (value: Awaited<ReturnType<typeof r.replace>>) => void
  r.replace.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const pending = r.run('replace-all')
  expect(r.state().busy).toBe('replace')
  expect(await r.run('replace-all')).toBe(false)
  expect(await r.run('close')).toBe(false)
  expect(await r.run({ form: { needle: 'different' } })).toBe(false)
  const input = r.replace.mock.calls[0][0]
  resolve({
    cells: 0,
    occurrences: 0,
    projection: { ...input.projection, revision: 0, cells: [] },
    sizes: { rowHeights: [], colWidths: [] },
  })
  expect(await pending).toBe(true)
  expect(r.replace).toHaveBeenCalledTimes(1)
  expect(r.state().busy).toBeNull()
})

test('a mismatched mutation projection never overwrites the current view', async () => {
  const r = await findHarness()
  r.replace.mockImplementationOnce(async (input) => ({
    cells: 1,
    occurrences: 1,
    projection: { ...input.projection, sheetId: 'wrong', revision: 1, cells: [] },
    sizes: { rowHeights: [], colWidths: [] },
  }))
  expect(await r.run('replace-all')).toBe(false)
  expect(r.state().error).toContain('mismatched')
  expect(r.store.getter(projectionSnapshotAtom).result?.sheetId).toBe('s')
})
