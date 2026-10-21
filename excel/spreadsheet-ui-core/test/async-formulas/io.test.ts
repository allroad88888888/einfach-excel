import { afterEach, expect, test, vi } from 'vitest'
import { createAsyncFormulaIo } from '../../src/rust-workbook/async-formulas/io'
import type { PendingAsyncFormulaCall } from '../../src/rust-workbook/async-formulas/commands'

afterEach(() => vi.useRealTimers())
const json = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json' },
})
function setup(calls: PendingAsyncFormulaCall[], fetcher: typeof fetch) {
  const pending = [...calls]
  const workbook = {
    read_custom_formulas: () => '[]',
    registerCustomFormulaAsync: vi.fn(), drainAsyncCustomRequests: () => pending.splice(0),
    resolveAsyncCustomCall: vi.fn(() => true),
  }
  const settled = vi.fn()
  const io = createAsyncFormulaIo(workbook, 'https://spreadsheet.example', settled, fetcher)
  return { io, workbook, settled, pending }
}
const call = (callId: number): PendingAsyncFormulaCall => ({ callId, name: 'FETCHJSON', args: ['/data'] })

test('registers trusted extension and latches an actual settlement before a waiter exists', async () => {
  const { io, workbook, settled } = setup([call(1)], vi.fn(async () => json(7)))
  expect(workbook.registerCustomFormulaAsync).toHaveBeenCalledWith('FETCHJSON')
  io.drain()
  await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce())
  expect(await io.awaitSettlement()).toEqual({ settled: true })
  const waiting = io.awaitSettlement()
  await expect(io.awaitSettlement()).rejects.toThrow('already pending')
  expect(workbook.resolveAsyncCustomCall).toHaveBeenCalledWith(1, { json: 7 })
  io.dispose()
  expect(await waiting).toEqual({ settled: false })
})

test('data-only file definitions cannot shadow the trusted FETCHJSON provider', () => {
  const registerCustomFormulaAsync = vi.fn()
  expect(() => createAsyncFormulaIo({ read_custom_formulas: () => JSON.stringify([
    { name: 'FETCHJSON', parameters: ['URL'], expression: '=999' },
  ]), registerCustomFormulaAsync, drainAsyncCustomRequests: () => [],
  resolveAsyncCustomCall: () => true }, 'https://spreadsheet.example', vi.fn()))
    .toThrow('The custom formula name is already in use.')
  expect(registerCustomFormulaAsync).not.toHaveBeenCalled()
})

test('real settlement completes one pending RPC and increments its existing revision callback once', async () => {
  const { io, settled, workbook } = setup([call(1)], vi.fn(async () => json([[3, 4]])))
  const waiting = io.awaitSettlement()
  io.drain()
  expect(await waiting).toEqual({ settled: true })
  expect(settled).toHaveBeenCalledOnce()
  expect(workbook.resolveAsyncCustomCall).toHaveBeenCalledWith(1, { json: [[3, 4]] })
  io.dispose()
})

test('dispose aborts I/O and cannot call a freed workbook even if fetch resolves late', async () => {
  let finish!: (value: Response) => void
  const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve }))
  const { io, workbook, settled } = setup([call(1)], fetcher)
  const waiting = io.awaitSettlement()
  io.drain()
  const signal = fetcher.mock.calls[0][1]?.signal
  io.dispose()
  expect(signal?.aborted).toBe(true)
  expect(await waiting).toEqual({ settled: false })
  finish(json(99))
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  await Promise.resolve(); await Promise.resolve()
  expect(workbook.resolveAsyncCustomCall).not.toHaveBeenCalled()
  expect(settled).not.toHaveBeenCalled()
  expect(await io.awaitSettlement()).toEqual({ settled: false })
})

test('concurrency is bounded and Rust call IDs are not scheduled twice', async () => {
  const finishes: ((response: Response) => void)[] = []
  const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { finishes.push(resolve) }))
  const { io, pending } = setup(Array.from({ length: 6 }, (_, index) => call(index + 1)), fetcher)
  io.drain()
  expect(fetcher).toHaveBeenCalledTimes(4)
  pending.push(call(1)); io.drain()
  expect(fetcher).toHaveBeenCalledTimes(4)
  finishes[0](json(2))
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5))
  io.dispose()
  for (const finish of finishes) finish(json(3))
})

test('timeout aborts real fetch signal and settles #N/A, allowing native failed memo retry', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  const { io, workbook } = setup([call(1)], fetcher)
  const waiting = io.awaitSettlement()
  io.drain()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(await waiting).toEqual({ settled: true })
  expect(workbook.resolveAsyncCustomCall).toHaveBeenCalledWith(1, { error: '#N/A' })
  io.dispose()
})

test('a stale native call result never emits a settlement or revision change', async () => {
  const { io, workbook, settled } = setup([call(1)], vi.fn(async () => json(7)))
  workbook.resolveAsyncCustomCall.mockReturnValue(false)
  io.drain()
  await vi.waitFor(() => expect(workbook.resolveAsyncCustomCall).toHaveBeenCalledOnce())
  expect(settled).not.toHaveBeenCalled()
  io.dispose()
})

test('queue saturation settles every excess call explicitly and bounds scheduled I/O', async () => {
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => undefined))
  const { io, workbook } = setup(
    Array.from({ length: 150 }, (_, index) => call(index + 1)), fetcher)
  io.drain()
  expect(fetcher).toHaveBeenCalledTimes(4)
  expect(workbook.resolveAsyncCustomCall).toHaveBeenCalledTimes(22)
  for (const args of workbook.resolveAsyncCustomCall.mock.calls)
    expect(args).toEqual([expect.any(Number), { error: '#VALUE!' }])
  io.dispose()
})

test('native settlement exceptions reject the deferred RPC without an unhandled promise', async () => {
  const { io, workbook } = setup([call(1)], vi.fn(async () => json(3)))
  workbook.resolveAsyncCustomCall.mockImplementation(() => { throw new Error('Native settle failed') })
  const waiting = io.awaitSettlement()
  io.drain()
  await expect(waiting).rejects.toThrow('Native settle failed')
  await expect(io.awaitSettlement()).rejects.toThrow('Native settle failed')
  io.dispose()
})

test('native drain exceptions reject the deferred RPC and propagate to the current command', async () => {
  const { io, workbook } = setup([], vi.fn(async () => json(3)))
  workbook.drainAsyncCustomRequests = () => { throw new Error('Native drain failed') }
  const waiting = io.awaitSettlement()
  expect(() => io.drain()).toThrow('Native drain failed')
  await expect(waiting).rejects.toThrow('Native drain failed')
  io.dispose()
})
