import { expect, test, vi } from 'vitest'
import { createHostWorkbookConnection } from '../../src/host/connection'
import type { WorkbookHooks } from '../../src/host/hooks'
import type { WorkerLike } from '../../src/rust-worker/types'

function setup(beforeChange: WorkbookHooks['beforeChange']) {
  const postMessage = vi.fn()
  const connection = createHostWorkbookConnection(() => ({ postMessage,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn(),
  } as WorkerLike), beforeChange)
  return { connection, postMessage }
}
const input = { type: 'clear' as const, sheetId: 'other', mode: 'all' as const,
  range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } }

test('cancel receives an immutable snapshot and never enters the worker queue', async () => {
  const hook = vi.fn(event => {
    expect(Object.isFrozen(event.payload.range)).toBe(true)
    expect(event.payload).not.toBe(input)
    return false
  })
  const r = setup(hook)
  await expect(r.connection.request('host.execute', input)).rejects.toThrow('HOST_COMMAND_CANCELLED')
  expect(hook).toHaveBeenCalledWith(expect.objectContaining({ source: 'api', command: 'host.execute' }))
  expect(r.postMessage).not.toHaveBeenCalled()
  expect(Object.isFrozen(input)).toBe(false)
  r.connection.dispose()
})

test('throwing and asynchronous hooks cannot submit a mutation', async () => {
  for (const hook of [() => { throw new Error('veto') }, () => Promise.resolve(true)]) {
    const r = setup(hook as WorkbookHooks['beforeChange'])
    await expect(r.connection.request('host.execute', input)).rejects.toThrow()
    expect(r.postMessage).not.toHaveBeenCalled()
    r.connection.dispose()
  }
})

test('read queries bypass before-change hooks and disposal rejects their pending transport', async () => {
  const hook = vi.fn(() => false), r = setup(hook)
  const request = r.connection.request('host.readRanges', { targets: [] })
  expect(hook).not.toHaveBeenCalled()
  expect(r.postMessage).toHaveBeenCalledOnce()
  r.connection.dispose()
  await expect(request).rejects.toThrow()
})
