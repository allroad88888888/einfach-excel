import { expect, test } from 'vitest'
import { projectionSnapshotAtom, setSheetProtectionAtom, setRustWorkbookConnectionAtom,
  type RustWorkbookConnection } from '../../src'
import { setupComment, firstThread } from './fixture'

test('open reads one native thread and close discards draft without a write', async () => {
  const { run, panel, request } = setupComment(firstThread())
  expect(await run('open')).toBe(true)
  expect(panel()).toMatchObject({ loaded: true, thread: firstThread() })
  await run({ body: 'discard' }); await run('close')
  expect(panel().open).toBe(false)
  expect(request).toHaveBeenCalledExactlyOnceWith('comments.read', { sheetId: 's', row: 1, col: 1, revision: 1 })
})

test('create reply resolve reopen each send one native command and keep authored history', async () => {
  const { run, panel, request, store } = setupComment()
  await run('open'); await run({ author: ' Alice ' }); await run({ body: 'first\r\n第二行' })
  expect(await run('post')).toBe(true)
  expect(panel()).toMatchObject({ open: true, body: '', thread: { resolved: false } })
  expect(request.mock.calls[1]).toMatchObject(['comments.change', { change: {
    action: 'create', author: 'Alice', body: 'first\n第二行' }, row: 1, col: 1, revision: 1 }])
  await run({ author: 'Bob' }); await run({ body: 'reply' }); expect(await run('post')).toBe(true)
  expect(request.mock.calls[2]).toMatchObject(['comments.change', { change: { action: 'reply', author: 'Bob', body: 'reply' } }])
  expect(await run('resolve')).toBe(true)
  expect(panel().thread?.resolved).toBe(true)
  await run({ body: 'blocked' }); expect(await run('post')).toBe(false)
  expect(await run('reopen')).toBe(true)
  expect(panel().thread?.entries).toHaveLength(4)
  expect(store.getter(projectionSnapshotAtom).result?.cells[0]).toMatchObject({ formula: '=1+2', commentIndicator: true })
  expect(request).toHaveBeenCalledTimes(5)
})

test('missing author invalid body and protected cells remain retryable without transport', async () => {
  const { run, panel, request, store } = setupComment()
  await run('open'); await run({ body: 'text' })
  expect(await run('post')).toBe(false); expect(panel().error).toContain('display name')
  await run({ author: 'Alice' })
  for (const body of [' \n\u0085', 'a\0b', '🙂'.repeat(32768)]) {
    await run({ body }); expect(await run('post')).toBe(false); expect(panel().body).toBe(body)
  }
  await run({ body: 'valid' })
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await run('post')).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})

test('stale revision invalid acknowledgement and native failure preserve drafts', async () => {
  const { run, panel, request, project, store } = setupComment()
  await run('open')
  await run({ author: 'A' })
  await run({ body: 'retry' })
  project(3)
  expect(await run('post')).toBe(false)
  expect(panel().error).toContain('Reopen')
  await run('close')
  project()
  await run('open')
  await run({ body: 'retry' })
  request.mockRejectedValueOnce(new Error('Native write failed.'))
  expect(await run('post')).toBe(false)
  expect(panel().error).toBe('Native write failed.')
  request.mockResolvedValueOnce({
    changed: true,
    thread: firstThread(),
    projection: { revision: 99 },
  })
  expect(await run('post')).toBe(false)
  expect(panel().error).toContain('mismatched')
  expect(panel().body).toBe('retry')
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(1)
})

test('cancelled read and replaced connection discard late responses and prevent duplicate saves', async () => {
  const { run, panel, request, store } = setupComment()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const reading = run('open')
  expect(panel()).toMatchObject({ phase: 'loading', busy: true })
  expect(await run('close')).toBe(true)
  finish({ thread: firstThread(), revision: 1 })
  expect(await reading).toBe(false)
  await run('open')
  await run({ author: 'A' })
  await run({ body: 'pending' })
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const saving = run('post')
  expect(await run('post')).toBe(false)
  expect(await run('close')).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'],
    dispose() {},
  })
  finish({ changed: true, thread: firstThread(), projection: { revision: 2 } })
  expect(await saving).toBe(false)
  expect(panel().open).toBe(false)
})

test('offscreen selection cannot open a thread at a different native address', async () => {
  const { run, request, select } = setupComment()
  select(90)
  expect(await run('open')).toBe(false)
  expect(request).not.toHaveBeenCalled()
})

test('a valid but unrelated returned thread cannot replace the requested discussion', async () => {
  const { run, request, panel, store } = setupComment(firstThread())
  await run('open')
  await run({ author: 'Bob' })
  await run({ body: 'requested reply' })
  request.mockImplementationOnce(async (_command, payload) => {
    const input = payload as { projection: object }
    return {
      changed: true,
      thread: firstThread(),
      projection: { ...input.projection, cells: [], revision: 2 },
    }
  })
  expect(await run('post')).toBe(false)
  expect(panel()).toMatchObject({
    error: 'Rust returned a mismatched comment result.',
    body: 'requested reply',
  })
  expect(panel().thread).toEqual(firstThread())
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(1)
})
