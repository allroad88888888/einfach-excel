import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from '@jest/globals'
import {
  createWorkerTransport,
  type WorkerLike,
} from '../src/rust-worker'
import { createRustWorkbookConnection } from '../src/rust-workbook'

const RUST_WORKER_ROOT = join(process.cwd(), 'excel/spreadsheet-ui-core/src/rust-worker')

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : entry.endsWith('.ts')
        ? [path]
        : []
  })
}

describe('Rust Worker ownership boundary', () => {
  test('publishes transport separately from the typed workbook connection', () => {
    expect(typeof createWorkerTransport).toBe('function')
    expect(typeof createRustWorkbookConnection).toBe('function')
  })

  test('keeps transport limited to RPC and disposal', () => {
    const listeners = new Set<(event: MessageEvent) => void>()
    const worker: WorkerLike = {
      postMessage() {},
      addEventListener(_type, listener) {
        listeners.add(listener)
      },
      removeEventListener(_type, listener) {
        listeners.delete(listener)
      },
      terminate() {},
    }
    const transport = createWorkerTransport(() => worker)

    expect(Object.keys(transport).sort()).toEqual(['dispose', 'request'])
    transport.dispose()
    expect(listeners.size).toBe(0)
  })

  test('registers a request before posting it to the Worker', async () => {
    let onMessage: ((event: MessageEvent) => void) | undefined
    const worker: WorkerLike = {
      postMessage(message) {
        const request = message as { id: number }
        onMessage?.({ data: { id: request.id, ok: true, result: 'ready' } } as MessageEvent)
      },
      addEventListener(type, listener) {
        if (type === 'message') onMessage = listener
      },
      removeEventListener() {},
      terminate() {},
    }
    const transport = createWorkerTransport<{
      ping: { payload: undefined; result: string }
    }>(() => worker)

    await expect(transport.request('ping', undefined)).resolves.toBe('ready')
    transport.dispose()
  })

  test('does not recreate the removed adapter bucket', () => {
    expect(existsSync(join(RUST_WORKER_ROOT, 'adapter'))).toBe(false)
    expect(existsSync(join(RUST_WORKER_ROOT, 'backend'))).toBe(false)
    expect(existsSync(join(RUST_WORKER_ROOT, 'runtime'))).toBe(false)
  })

  test('keeps the transport directory flat and small', () => {
    expect(sourceFiles(RUST_WORKER_ROOT)).toHaveLength(3)
  })

  test('depends on Rust/WASM and UI-core contracts without importing framework runtimes', () => {
    const forbiddenImport =
      /from ['"](?:solid-js|react|@einfach\/solid|@einfach\/react|@einfach\/excel-core-ts)(?:\/[^'"]*)?['"]/
    const offenders = sourceFiles(RUST_WORKER_ROOT).flatMap((path) =>
      forbiddenImport.test(readFileSync(path, 'utf8')) ? [path] : [],
    )

    expect(offenders).toEqual([])
  })

  test('keeps the package root free of side-effectful Worker exports', () => {
    const root = readFileSync(
      join(process.cwd(), 'excel/spreadsheet-ui-core/src/index.ts'),
      'utf8',
    )

    expect(root).not.toContain("from './rust-worker")
    expect(root).not.toContain('worker-runtime')
  })
})
