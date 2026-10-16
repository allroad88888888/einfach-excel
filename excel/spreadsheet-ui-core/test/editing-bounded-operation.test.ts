import { afterEach, expect, test, vi } from 'vitest'
import {
  DEFAULT_EDITING_COMMIT_TIMEOUT_MS, editingErrorMessage,
  normalizeEditingTimeout, runBoundedEditingOperation,
} from '../src/editing/bounded-operation'
import { deferred } from './editing-test-support'

afterEach(() => vi.useRealTimers())

test.each([undefined, null, 0, -1, NaN, Infinity, -Infinity, '25', {}, true])(
  'invalid editing deadline %j uses the finite default', (value) => {
    expect(normalizeEditingTimeout(value)).toBe(DEFAULT_EDITING_COMMIT_TIMEOUT_MS)
  },
)
test.each([0.5, 1, 25, 30_000])('valid deadline %s is not silently changed', (value) => {
  expect(normalizeEditingTimeout(value)).toBe(value)
})

test.each(['fulfilled', 'sync-rejected', 'async-rejected'] as const)(
  '%s settles exactly once and removes its timer', async (mode) => {
    vi.useFakeTimers()
    const error = new Error('worker failed')
    const launch = vi.fn(() => {
      if (mode === 'sync-rejected') throw error
      return mode === 'async-rejected' ? Promise.reject(error) : Promise.resolve('result')
    })
    const result = await runBoundedEditingOperation(launch, 20)
    expect(result).toEqual(mode === 'fulfilled'
      ? { kind: 'fulfilled', value: 'result' } : { kind: 'rejected', error })
    expect(Object.isFrozen(result)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(launch).toHaveBeenCalledOnce()
  },
)

test.each(['resolve', 'reject'] as const)('timeout observes late %s without settling twice or leaking timers', async (late) => {
  vi.useFakeTimers()
  const native = deferred<string>()
  const settled = vi.fn()
  const pending = runBoundedEditingOperation(() => native.promise, 25).then((result) => {
    settled(result)
    return result
  })
  await vi.advanceTimersByTimeAsync(24)
  expect(settled).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  const result = await pending
  expect(result).toEqual({ kind: 'timeout' })
  expect(Object.isFrozen(result)).toBe(true)
  if (late === 'resolve') native.resolve('late value')
  else native.reject(new Error('late rejection'))
  await vi.advanceTimersByTimeAsync(100)
  expect(settled).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

test('an earlier native failure does not consume a later operation deadline', async () => {
  vi.useFakeTimers()
  await runBoundedEditingOperation(() => Promise.reject(new Error('first')), 10)
  const native = deferred<string>()
  const next = runBoundedEditingOperation(() => native.promise, 50)
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(49)
  native.resolve('retry succeeded')
  expect(await next).toEqual({ kind: 'fulfilled', value: 'retry succeeded' })
  expect(vi.getTimerCount()).toBe(0)
})

test.each([new Error('native failed'), 'native failed', null, 42])('error feedback safely formats %j', (error) => {
  expect(editingErrorMessage(error)).toBe(error instanceof Error ? error.message : String(error))
})

test('throwing error accessors and coercion cannot break settlement feedback', () => {
  const hostile = new Error('hidden')
  Object.defineProperty(hostile, 'message', { get() { throw new Error('bad accessor') } })
  expect(editingErrorMessage(hostile)).toBe('Unknown editing transport failure.')
  expect(editingErrorMessage({ toString() { throw new Error('bad coercion') } }))
    .toBe('Unknown editing transport failure.')
  expect(editingErrorMessage({ toString: () => 'custom failure' })).toBe('custom failure')
})
