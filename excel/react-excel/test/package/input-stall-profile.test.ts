import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginInputStallProfile } from '../../e2e/support/input-stall-profile'

function deferred() {
  let resolve!: (value?: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(
  start: Promise<unknown> = Promise.resolve({}),
  stop: Promise<unknown> = Promise.resolve({
    profile: { startTime: 1, endTime: 1001, nodes: [], samples: [] },
  }),
) {
  const calls: string[] = [], records: string[] = []
  const session = {
    send: vi.fn(async (method: string) => {
      calls.push(method)
      if (method === 'Profiler.start') return start
      if (method === 'Profiler.stop') return stop
      return {}
    }),
    detach: vi.fn(async () => { calls.push('detach') }),
  }
  const destroy = vi.fn(async () => { calls.push('destroy') })
  const capture = beginInputStallProfile(session, destroy, kind => records.push(kind), {
    windowMs: 50, observeMs: 10, deadlineMs: 100, destroyMs: 10,
  })
  return { capture, calls, records, session, destroy }
}
afterEach(() => { vi.useRealTimers() })

describe('bounded diagnostic CPU profile cleanup', () => {
  it('acknowledges start then automatically stops once at the window deadline', async () => {
    vi.useFakeTimers()
    const f = fixture()
    expect(await f.capture.ready).toBe(true)
    await vi.advanceTimersByTimeAsync(51)
    expect(f.calls.filter(x => x === 'Profiler.stop')).toHaveLength(1)
    const result = await f.capture.finish()
    expect(result.status).toBe('stopped')
    expect(result.cleanupConfirmed).toBe(true)
    expect(f.calls).toEqual(['Profiler.enable', 'Profiler.setSamplingInterval',
      'Profiler.start', 'Profiler.stop', 'Profiler.disable', 'detach'])
    await f.capture.finish()
    expect(f.destroy).not.toHaveBeenCalled()
    expect(f.calls.filter(x => x === 'Profiler.stop')).toHaveLength(1)
  })
  it('stops a late start after its ack instead of skipping cleanup', async () => {
    vi.useFakeTimers()
    const start = deferred(), f = fixture(start.promise)
    await vi.advanceTimersByTimeAsync(11)
    expect(await f.capture.ready).toBe(false)
    expect(f.calls).not.toContain('Profiler.stop')
    start.resolve({})
    const result = await f.capture.finish()
    expect(result.status).toBe('stopped')
    expect(f.calls.indexOf('Profiler.stop')).toBeGreaterThan(f.calls.indexOf('Profiler.start'))
    expect(f.calls.filter(x => x === 'Profiler.stop')).toHaveLength(1)
    expect(f.destroy).not.toHaveBeenCalled()
  })
  it('releases a rejected start without claiming a profile', async () => {
    vi.useFakeTimers()
    const start = deferred(), f = fixture(start.promise)
    start.reject(new Error('start rejected'))
    expect(await f.capture.ready).toBe(false)
    expect((await f.capture.finish()).status).toBe('not-started')
    expect(f.calls).not.toContain('Profiler.stop')
    expect(f.session.detach).toHaveBeenCalledOnce()
  })
  it('destroys only its target when start never returns, with no queued retries', async () => {
    vi.useFakeTimers()
    const f = fixture(deferred().promise)
    await vi.advanceTimersByTimeAsync(101)
    expect(await f.capture.ready).toBe(false)
    expect(await f.capture.finish()).toEqual({ status: 'destroyed', cleanupConfirmed: true })
    expect(f.destroy).toHaveBeenCalledOnce()
    expect(f.calls).not.toContain('Profiler.stop')
    expect(f.calls.filter(x => x === 'Profiler.start')).toHaveLength(1)
  })
  it('destroys the target if stop is rejected', async () => {
    vi.useFakeTimers()
    const stop = deferred(), f = fixture(Promise.resolve({}), stop.promise)
    expect(await f.capture.ready).toBe(true)
    const result = f.capture.finish()
    stop.reject(new Error('target destroyed'))
    expect(await result).toEqual({ status: 'destroyed', cleanupConfirmed: true })
    expect(f.destroy).toHaveBeenCalledOnce()
  })
  it('bounds a never-returning stop by target destruction', async () => {
    vi.useFakeTimers()
    const f = fixture(Promise.resolve({}), deferred().promise)
    expect(await f.capture.ready).toBe(true)
    const result = f.capture.finish()
    await vi.advanceTimersByTimeAsync(101)
    expect((await result).status).toBe('destroyed')
    expect(f.calls.filter(x => x === 'Profiler.stop')).toHaveLength(1)
    expect(f.session.detach).toHaveBeenCalledOnce()
  })
  it('does not call an unconfirmed destruction a successful cleanup', async () => {
    vi.useFakeTimers()
    const f = fixture(deferred().promise)
    f.destroy.mockImplementation(() => deferred().promise as Promise<void>)
    await vi.advanceTimersByTimeAsync(111)
    expect(await f.capture.finish()).toEqual({ status: 'unconfirmed', cleanupConfirmed: false })
  })
})
