// @vitest-environment node
import { createServer, type ServerResponse } from 'node:http'
import { expect, test, vi } from 'vitest'
import { createAsyncFormulaIo } from '../../src/rust-workbook/async-formulas/io'
import type { PendingAsyncFormulaCall, WasmAsyncFormulaQueries } from '../../src/rust-workbook/async-formulas/commands'

async function localHttp(respond: (response: ServerResponse, path: string) => void) {
  let active = 0
  let maximum = 0
  const server = createServer((request, response) => {
    active += 1
    maximum = Math.max(maximum, active)
    response.once('close', () => { active -= 1 })
    respond(response, request.url ?? '/')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a localhost TCP server.')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    counts: () => ({ active, maximum }),
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
      })
    },
  }
}

function openStream(response: ServerResponse) {
  response.write('{')
  const timer = setInterval(() => response.write(' '), 25)
  response.once('close', () => clearInterval(timer))
}

function ioFor(origin: string, pending: PendingAsyncFormulaCall[]) {
  const signals: AbortSignal[] = []
  const resolveAsyncCustomCall = vi.fn<NonNullable<WasmAsyncFormulaQueries['resolveAsyncCustomCall']>>(() => true)
  const settled = vi.fn()
  const io = createAsyncFormulaIo({
    read_custom_formulas: () => '[]', registerCustomFormulaAsync() {},
    drainAsyncCustomRequests: () => pending.splice(0), resolveAsyncCustomCall,
  }, origin, settled, (url, init) => {
    signals.push(init!.signal!)
    return fetch(url, init)
  })
  return { io, signals, resolveAsyncCustomCall, settled }
}

test.each([
  { name: 'HTTP403', status: 403, headers: { 'content-type': 'application/json' }, error: '#N/A' },
  { name: 'non-JSON type', status: 200, headers: { 'content-type': 'text/plain' }, error: '#VALUE!' },
  { name: 'oversized declared body', status: 200,
    headers: { 'content-type': 'application/json', 'content-length': '1048577' }, error: '#VALUE!' },
])('$name closes real early-return HTTP streams before the I/O slot is reused', async scenario => {
  const http = await localHttp((response, path) => {
    if (path === '/success') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('42')
    } else {
      response.writeHead(scenario.status, scenario.headers)
      openStream(response)
    }
  })
  const pending = Array.from({ length: 6 }, (_, index) => ({
    callId: index + 1, name: 'FETCHJSON', args: [`/stream?id=${index}`],
  }))
  const { io, signals, resolveAsyncCustomCall, settled } = ioFor(http.origin, pending)
  try {
    io.drain()
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(6))
    console.info(JSON.stringify({ scenario: scenario.name, phase: 'six-errors-settled',
      ...http.counts(), abortedRequests: signals.filter(signal => signal.aborted).length }))
    expect(signals.every(signal => signal.aborted)).toBe(true)
    expect(http.counts().maximum).toBeLessThanOrEqual(4)
    await vi.waitFor(() => expect(http.counts().active).toBe(0))
    expect(resolveAsyncCustomCall).toHaveBeenCalledTimes(6)
    expect(new Set(resolveAsyncCustomCall.mock.calls.map(([id]) => id)).size).toBe(6)
    for (const [, value] of resolveAsyncCustomCall.mock.calls)
      expect(value).toEqual({ error: scenario.error })
    pending.push({ callId: 7, name: 'FETCHJSON', args: ['/success'] })
    io.drain()
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(7))
    expect(resolveAsyncCustomCall).toHaveBeenLastCalledWith(7, { json: 42 })
    expect(signals.every(signal => signal.aborted)).toBe(true)
    io.dispose()
    await vi.waitFor(() => expect(http.counts().active).toBe(0))
  } finally {
    io.dispose()
    await http.close()
  }
})

test('a real mid-body HTTP transport failure terminates its signal and settles once as NA', async () => {
  const http = await localHttp(response => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.write('{"value":')
    setImmediate(() => response.destroy())
  })
  const { io, signals, resolveAsyncCustomCall, settled } = ioFor(http.origin,
    [{ callId: 1, name: 'FETCHJSON', args: ['/broken'] }])
  try {
    io.drain()
    await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce())
    expect(signals[0].aborted).toBe(true)
    expect(resolveAsyncCustomCall).toHaveBeenCalledExactlyOnceWith(1, { error: '#N/A' })
    await vi.waitFor(() => expect(http.counts().active).toBe(0))
  } finally {
    io.dispose()
    await http.close()
  }
})

test('dispose aborts real pending HTTP streams and never settles into the released workbook', async () => {
  const http = await localHttp(response => {
    response.writeHead(200, { 'content-type': 'application/json' })
    openStream(response)
  })
  const { io, signals, resolveAsyncCustomCall } = ioFor(http.origin,
    Array.from({ length: 6 }, (_, index) => ({ callId: index + 1, name: 'FETCHJSON', args: [`/${index}`] })))
  try {
    io.drain()
    await vi.waitFor(() => expect(http.counts().active).toBe(4))
    io.dispose()
    expect(signals).toHaveLength(4)
    expect(signals.every(signal => signal.aborted)).toBe(true)
    await vi.waitFor(() => expect(http.counts().active).toBe(0))
    expect(http.counts().maximum).toBe(4)
    expect(resolveAsyncCustomCall).not.toHaveBeenCalled()
  } finally {
    io.dispose()
    await http.close()
  }
})
