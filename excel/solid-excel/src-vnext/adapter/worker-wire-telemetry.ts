/**
 * The repeatable, normalized byte estimate for worker messages. It is not a
 * structured-clone transfer-size measurement: browser clone metadata and
 * transport framing are not exposed to application code.
 */

export const NORMALIZED_WIRE_PAYLOAD_METHOD = 'canonical-json-utf8-v1'

export type WorkerWireDirection = 'host-to-worker' | 'worker-to-host'

export type WorkerWireMessageKind =
  | 'request'
  | 'response'
  | 'error'
  | 'dirty'
  | 'hydrated'
  | 'unclassified'

export interface WorkerWireTelemetryBucket {
  messageCount: number
  normalizedPayloadBytes: number
  unmeasurableMessageCount: number
}

export interface WorkerWireTelemetrySnapshot {
  method: typeof NORMALIZED_WIRE_PAYLOAD_METHOD
  total: WorkerWireTelemetryBucket
  byDirection: Record<WorkerWireDirection, Record<WorkerWireMessageKind, WorkerWireTelemetryBucket>>
}

const DIRECTIONS: WorkerWireDirection[] = ['host-to-worker', 'worker-to-host']
const KINDS: WorkerWireMessageKind[] = [
  'request',
  'response',
  'error',
  'dirty',
  'hydrated',
  'unclassified',
]

function emptyBucket(): WorkerWireTelemetryBucket {
  return { messageCount: 0, normalizedPayloadBytes: 0, unmeasurableMessageCount: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalJson(value: unknown, stack = new WeakSet<object>()): string | null {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : null
  if (Array.isArray(value)) {
    const entries: string[] = []
    for (const entry of value) {
      const normalized = canonicalJson(entry, stack)
      if (normalized === null) return null
      entries.push(normalized)
    }
    return `[${entries.join(',')}]`
  }
  if (!isRecord(value) || stack.has(value)) return null

  stack.add(value)
  const entries: string[] = []
  for (const key of Object.keys(value).sort()) {
    const entry = value[key]
    if (entry === undefined) continue
    const normalized = canonicalJson(entry, stack)
    if (normalized === null) {
      stack.delete(value)
      return null
    }
    entries.push(`${JSON.stringify(key)}:${normalized}`)
  }
  stack.delete(value)
  return `{${entries.join(',')}}`
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

/** Returns null for shapes outside the JSON-like worker wire contract. */
export function estimateNormalizedWirePayloadBytes(value: unknown): number | null {
  const normalized = canonicalJson(value)
  return normalized === null ? null : utf8ByteLength(normalized)
}

export function classifyWorkerWireMessage(value: unknown): WorkerWireMessageKind {
  if (!isRecord(value)) return 'unclassified'
  if (typeof value.id === 'number' && typeof value.cmd === 'string') return 'request'
  if (typeof value.id === 'number' && value.ok === true) return 'response'
  if (typeof value.id === 'number' && value.ok === false) return 'error'
  if (value.event === 'cellsDirty') return 'dirty'
  if (value.event === 'cellsHydrated') return 'hydrated'
  return 'unclassified'
}

function copyBucket(bucket: WorkerWireTelemetryBucket): WorkerWireTelemetryBucket {
  return { ...bucket }
}

export function createWorkerWireTelemetry() {
  const total = emptyBucket()
  const buckets = new Map<string, WorkerWireTelemetryBucket>()
  for (const direction of DIRECTIONS) {
    for (const kind of KINDS) buckets.set(`${direction}:${kind}`, emptyBucket())
  }

  function record(direction: WorkerWireDirection, value: unknown): void {
    const kind = classifyWorkerWireMessage(value)
    const bytes = estimateNormalizedWirePayloadBytes(value)
    const bucket = buckets.get(`${direction}:${kind}`)!
    bucket.messageCount += 1
    total.messageCount += 1
    if (bytes === null) {
      bucket.unmeasurableMessageCount += 1
      total.unmeasurableMessageCount += 1
      return
    }
    bucket.normalizedPayloadBytes += bytes
    total.normalizedPayloadBytes += bytes
  }

  function reset(): void {
    Object.assign(total, emptyBucket())
    for (const bucket of buckets.values()) Object.assign(bucket, emptyBucket())
  }

  function snapshot(): WorkerWireTelemetrySnapshot {
    const byDirection = {} as WorkerWireTelemetrySnapshot['byDirection']
    for (const direction of DIRECTIONS) {
      const byKind = {} as Record<WorkerWireMessageKind, WorkerWireTelemetryBucket>
      for (const kind of KINDS) byKind[kind] = copyBucket(buckets.get(`${direction}:${kind}`)!)
      byDirection[direction] = byKind
    }
    return { method: NORMALIZED_WIRE_PAYLOAD_METHOD, total: copyBucket(total), byDirection }
  }

  return { record, reset, snapshot }
}
