import { expect, test } from 'vitest'
import { setRustWorkbookConnectionAtom, setSheetProtectionAtom, projectionSnapshotAtom,
  type RustWorkbookConnection } from '../../src'
import { setupNote } from './fixture'

test('open reads native text; cancel discards draft with no mutation', async () => {
  const { run, panel, request } = setupNote('original\n第二行')
  expect(await run('open')).toBe(true)
  expect(panel()).toMatchObject({ loaded: true, existing: true, text: 'original\n第二行' })
  await run({ text: 'discard' }); await run('close')
  expect(panel().open).toBe(false)
  expect(request).toHaveBeenCalledExactlyOnceWith('notes.read', { sheetId: 's', row: 1, col: 1, revision: 1 })
})

test('save sends one normalized native command and publishes returned marker', async () => {
  const { run, store, request, panel } = setupNote()
  await run('open'); await run({ text: 'first\r\n第二行' }); expect(await run('save')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['notes.change', { sheetId: 's', row: 1, col: 1,
    text: 'first\n第二行', revision: 1 }])
  expect(request.mock.calls[1][1]).not.toHaveProperty('value')
  expect(store.getter(projectionSnapshotAtom).result?.cells[0]).toMatchObject({ formula: '=1+2', noteIndicator: true })
  expect(panel().open).toBe(false)
})

test('blank and over-limit drafts are recoverable; explicit deletion ignores invalid draft', async () => {
  const { run, panel, request } = setupNote('existing')
  await run('open')
  for (const text of [' \n\t', 'a\0b', '🙂'.repeat(32768)]) {
    await run({ text }); expect(await run('save')).toBe(false)
    expect(panel()).toMatchObject({ open: true, text, busy: false })
    expect(panel().error).not.toBe('')
  }
  expect(request).toHaveBeenCalledTimes(1)
  expect(await run('remove')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['notes.change', { text: null }])
})

test('stale revision and protected cell reject writes before transport', async () => {
  const { run, panel, project, request, store } = setupNote('original')
  await run('open'); project(3)
  expect(await run('save')).toBe(false); expect(panel().error).toContain('Reopen')
  await run('close'); project(); await run('open')
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await run('save')).toBe(false)
  expect(request.mock.calls.every(([command]) => command === 'notes.read')).toBe(true)
})

test('native errors retain editable draft; invalid acknowledgements cannot publish', async () => {
  const { run, panel, request, store } = setupNote()
  await run('open'); await run({ text: 'retry' })
  request.mockRejectedValueOnce(new Error('Native write failed.'))
  expect(await run('save')).toBe(false)
  expect(panel()).toMatchObject({ text: 'retry', busy: false, error: 'Native write failed.' })
  request.mockResolvedValueOnce({ changed: true, projection: { revision: 99 } })
  expect(await run('save')).toBe(false)
  expect(panel().error).toContain('mismatched')
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(1)
})

test('cancelled read and replaced connection ignore late native replies', async () => {
  const { run, panel, request, store } = setupNote()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = run('open')
  expect(panel()).toMatchObject({ phase: 'loading', busy: true })
  expect(await run('close')).toBe(true)
  finish({ text: 'late', revision: 1 }); expect(await pending).toBe(false)
  expect(panel().open).toBe(false)
  await run('open'); await run({ text: 'pending' })
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const saving = run('save')
  expect(await run('save')).toBe(false); expect(await run('close')).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, { request: request as RustWorkbookConnection['request'], dispose() {} })
  finish({ changed: true, projection: { revision: 2 } }); expect(await saving).toBe(false)
  expect(panel().open).toBe(false)
})

test('offscreen selection never reads a note from a different cell', async () => {
  const { run, select, request } = setupNote()
  select(90); expect(await run('open')).toBe(false); expect(request).not.toHaveBeenCalled()
})
