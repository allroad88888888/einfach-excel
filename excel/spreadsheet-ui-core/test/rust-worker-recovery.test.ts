import { describe, expect, test, vi } from 'vitest'
import { createWorkerTransport, rpcError } from '../src/rust-worker/transport'

/** 使用真实事件分派，只替换 Worker 的外部传输边界。 */
function setup() {
  const events = new EventTarget()
  const worker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
    terminate: vi.fn(),
  }
  const transport = createWorkerTransport<{
    ping: { payload: string; result: string }
  }>(() => worker)
  const reply = (data: unknown) => events.dispatchEvent(new MessageEvent('message', { data }))
  return { events, worker, transport, reply }
}

describe('Worker RPC settlement and recovery', () => {
  test('out-of-order replies settle only their matching request', async () => {
    const { transport, worker, reply } = setup()
    const first = transport.request('ping', 'first')
    const second = transport.request('ping', 'second')
    expect(worker.postMessage.mock.calls.map(([request]) => request)).toEqual([
      { id: 1, command: 'ping', payload: 'first' },
      { id: 2, command: 'ping', payload: 'second' },
    ])
    reply({ id: 2, ok: true, result: 'second result' })
    reply({ id: 1, ok: true, result: 'first result' })
    await expect(Promise.all([first, second])).resolves.toEqual(['first result', 'second result'])
    transport.dispose()
  })

  test('unknown, malformed and duplicate envelopes do not consume another request', async () => {
    const { transport, reply } = setup()
    const first = transport.request('ping', 'first')
    for (const data of [null, {}, { id: '1', ok: true }, { id: 1 }, { id: 99, ok: true }]) {
      reply(data)
    }
    reply({ id: 1, ok: true, result: 'first' })
    await expect(first).resolves.toBe('first')
    const second = transport.request('ping', 'second')
    reply({ id: 1, ok: true, result: 'duplicate' })
    reply({ id: 2, ok: true, result: 'second' })
    await expect(second).resolves.toBe('second')
    transport.dispose()
  })

  test.each([undefined, { cell: 'A1' }])('business failure preserves detail %j and permits retry',
    async (detail) => {
      const { transport, reply } = setup()
      const failed = expect(transport.request('ping', 'first')).rejects.toMatchObject({
        message: 'Denied', code: 'PROTECTED', ...(detail === undefined ? {} : { detail }),
      })
      reply({ id: 1, ok: false, error: { message: 'Denied', code: 'PROTECTED', detail } })
      await failed
      const retry = transport.request('ping', 'retry')
      reply({ id: 2, ok: true, result: 'ready' })
      await expect(retry).resolves.toBe('ready')
      transport.dispose()
    })

  test('a synchronous post failure removes only that request and permits explicit retry', async () => {
    const { transport, worker, reply } = setup()
    worker.postMessage.mockImplementationOnce(() => { throw new Error('Cannot clone') })
    await expect(transport.request('ping', 'first')).rejects.toThrow('Cannot clone')
    const retry = transport.request('ping', 'retry')
    reply({ id: 1, ok: true, result: 'stale' })
    reply({ id: 2, ok: true, result: 'ready' })
    await expect(retry).resolves.toBe('ready')
    transport.dispose()
  })

  test.each(['error', 'messageerror'])('%s rejects all pending work and fails closed', async (type) => {
    const { transport, worker, events, reply } = setup()
    const first = expect(transport.request('ping', 'first')).rejects.toThrow(
      type === 'error' ? 'Worker crashed' : 'Worker messageerror',
    )
    const second = expect(transport.request('ping', 'second')).rejects.toThrow()
    events.dispatchEvent(type === 'error'
      ? new ErrorEvent(type, { message: 'Worker crashed' })
      : new MessageEvent(type))
    await Promise.all([first, second])
    reply({ id: 1, ok: true, result: 'late result' })
    await expect(transport.request('ping', 'not retried')).rejects.toThrow()
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    transport.dispose()
  })

  test('dispose rejects pending requests, removes every listener and terminates exactly once',
    async () => {
      const { transport, worker } = setup()
      const pending = expect(transport.request('ping', 'first')).rejects.toThrow('disposed')
      transport.dispose()
      transport.dispose()
      await pending
      await expect(transport.request('ping', 'late')).rejects.toThrow('disposed')
      expect(worker.postMessage).toHaveBeenCalledTimes(1)
      expect(worker.terminate).toHaveBeenCalledTimes(1)
      expect(worker.removeEventListener.mock.calls).toEqual(worker.addEventListener.mock.calls)
    })

  test('a fresh connection works after the previous Worker fails', async () => {
    const old = setup()
    old.events.dispatchEvent(new ErrorEvent('error', { message: 'Crashed' }))
    await expect(old.transport.request('ping', 'old')).rejects.toThrow('Crashed')
    old.transport.dispose()
    const fresh = setup()
    const result = fresh.transport.request('ping', 'new')
    fresh.reply({ id: 1, ok: true, result: 'ready' })
    await expect(result).resolves.toBe('ready')
    fresh.transport.dispose()
  })

  test('factory failure is propagated without an automatic replacement Worker', () => {
    const factory = vi.fn(() => { throw new Error('Cannot start Worker') })
    expect(() => createWorkerTransport(factory)).toThrow('Cannot start Worker')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  test('error serialization keeps native code and optional detail without extra wrappers', () => {
    expect(rpcError('failed')).toEqual({ code: 'WORKER_ERROR', message: 'failed' })
    expect(rpcError(new Error('failed'))).toEqual({ code: 'WORKER_ERROR', message: 'failed' })
    expect(rpcError(Object.assign(new Error('Denied'), {
      code: 'PROTECTED', detail: { cell: 'A1' },
    }))).toEqual({ code: 'PROTECTED', message: 'Denied', detail: { cell: 'A1' } })
  })
})
