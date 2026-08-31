import { describe, expect, jest, test } from '@jest/globals'
import type * as WorkerPost from '../src/adapter/worker-post'
import {
  NORMALIZED_WIRE_PAYLOAD_METHOD,
  classifyWorkerWireMessage,
  createWorkerWireTelemetry,
  estimateNormalizedWirePayloadBytes,
} from '../src/adapter/worker-wire-telemetry'

describe('worker normalized payload telemetry', () => {
  test('uses a stable UTF-8 estimate instead of object insertion order', () => {
    const first = estimateNormalizedWirePayloadBytes({ cmd: 'read', id: 1, label: '格' })
    const second = estimateNormalizedWirePayloadBytes({ label: '格', id: 1, cmd: 'read' })

    expect(first).toBe(second)
    expect(first).toBeGreaterThan(0)
    expect(estimateNormalizedWirePayloadBytes({ value: undefined })).toBe(2)
    expect(estimateNormalizedWirePayloadBytes({ value: Number.NaN })).toBeNull()
  })

  test('classifies the request, response, error, and dirty wire shapes', () => {
    expect(classifyWorkerWireMessage({ id: 1, cmd: 'readRange' })).toBe('request')
    expect(classifyWorkerWireMessage({ id: 1, ok: true, result: [] })).toBe('response')
    expect(classifyWorkerWireMessage({ id: 1, ok: false, error: { code: 'NOPE' } })).toBe('error')
    expect(classifyWorkerWireMessage({ event: 'cellsDirty', cells: [] })).toBe('dirty')
  })

  test('keeps direction and kind totals for actual message objects', () => {
    const telemetry = createWorkerWireTelemetry()
    const request = { id: 1, cmd: 'readRange', sheet: 0 }
    const response = { id: 1, ok: true, result: { cells: [] } }
    const error = { id: 2, ok: false, error: { code: 'NOPE', message: 'nope' } }
    const dirty = { event: 'cellsDirty', cells: [{ sheet: 0, addr: 'A1' }] }

    telemetry.record('host-to-worker', request)
    telemetry.record('worker-to-host', response)
    telemetry.record('worker-to-host', error)
    telemetry.record('worker-to-host', dirty)

    const snapshot = telemetry.snapshot()
    expect(snapshot.method).toBe(NORMALIZED_WIRE_PAYLOAD_METHOD)
    expect(snapshot.total.messageCount).toBe(4)
    expect(snapshot.total.normalizedPayloadBytes).toBe(
      [request, response, error, dirty].reduce(
        (total, message) => total + (estimateNormalizedWirePayloadBytes(message) ?? 0),
        0,
      ),
    )
    expect(snapshot.byDirection['host-to-worker'].request.messageCount).toBe(1)
    expect(snapshot.byDirection['worker-to-host'].response.messageCount).toBe(1)
    expect(snapshot.byDirection['worker-to-host'].error.messageCount).toBe(1)
    expect(snapshot.byDirection['worker-to-host'].dirty.messageCount).toBe(1)
  })

  test('marks non-JSON-like message values as unmeasurable', () => {
    const telemetry = createWorkerWireTelemetry()
    telemetry.record('host-to-worker', { id: 1, cmd: 'bad', value: () => undefined })

    expect(telemetry.snapshot().total).toEqual({
      messageCount: 1,
      normalizedPayloadBytes: 0,
      unmeasurableMessageCount: 1,
    })
  })

  test('records inbound requests plus worker-post response, error, and dirty messages', () => {
    const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
    const listeners: Array<(event: MessageEvent) => void> = []
    const posted: unknown[] = []
    const scope = {
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        listeners.push(listener)
      },
      postMessage(message: unknown) {
        posted.push(message)
      },
    }
    Object.defineProperty(globalThis, 'self', { configurable: true, value: scope })

    try {
      let workerPost: typeof WorkerPost | undefined
      jest.isolateModules(() => {
        // `worker-post` binds `self` at module initialization, so it must load
        // inside this isolated Worker-scope fixture.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        workerPost = require('../src/adapter/worker-post') as typeof WorkerPost
      })
      const post = workerPost!

      listeners[0]!({ data: { id: 1, cmd: 'readRange' } } as MessageEvent)
      post.postResponse(1, { cells: [] })
      post.postError(2, { code: 'NOPE', message: 'nope' })
      post.postDirty([{ sheet: 0, addr: 'a1' }])

      const snapshot = post.workerWireTelemetry.snapshot()
      expect(posted).toEqual([
        { id: 1, ok: true, result: { cells: [] } },
        { id: 2, ok: false, error: { code: 'NOPE', message: 'nope' } },
        { event: 'cellsDirty', cells: [{ sheet: 0, addr: 'A1' }] },
      ])
      expect(snapshot.byDirection['host-to-worker'].request.messageCount).toBe(1)
      expect(snapshot.byDirection['worker-to-host'].response.messageCount).toBe(1)
      expect(snapshot.byDirection['worker-to-host'].error.messageCount).toBe(1)
      expect(snapshot.byDirection['worker-to-host'].dirty.messageCount).toBe(1)
    } finally {
      if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf)
      else Reflect.deleteProperty(globalThis, 'self')
    }
  })
})
