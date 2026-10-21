import { expect, test, vi } from 'vitest'
import { fetchJsonFormula, selectJsonPointer } from '../../src/rust-workbook/async-formulas/fetch-json'

const origin = 'https://spreadsheet.example'
const response = (document: unknown) => new Response(JSON.stringify(document), {
  headers: { 'content-type': 'application/json; charset=utf-8' },
})
const fetchValue = async (document: unknown, args: unknown[] = ['/data.json']) => {
  const fetcher = vi.fn(async () => response(document))
  const value = await fetchJsonFormula(args, origin, new AbortController().signal, fetcher)
  return { value, fetcher }
}

test.each([42, true, null, 'hello', [[1, 'x'], [null, false]]].map(document => ({ document })))(
  'returns supported JSON scalar or rectangular value $document', async ({ document }) => {
    const { value, fetcher } = await fetchValue(document)
    expect(value).toEqual(document)
    expect(fetcher).toHaveBeenCalledWith(`${origin}/data.json`, expect.objectContaining({
      method: 'GET', credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' },
    }))
  },
)

test('JSON Pointer decodes RFC 6901 escapes and array indices using own properties', async () => {
  const document = { 'a/b': { '~key': [10, 20] }, '': 4 }
  expect(selectJsonPointer(document, '/a~1b/~0key/1')).toBe(20)
  expect(selectJsonPointer(document, '/')).toBe(4)
  expect(selectJsonPointer(document, '')).toBe(document)
  const { value } = await fetchValue(document, ['/data.json', '/a~1b/~0key/0'])
  expect(value).toBe(10)
  for (const pointer of ['/toString', '/a~2b', '/a~1b/~0key/01', '/a~1b/~0key/-', '#/a', '/missing'])
    expect(() => selectJsonPointer(document, pointer)).toThrow()
  expect(selectJsonPointer(JSON.parse('{"__proto__":7}'), '/__proto__')).toBe(7)
})

test.each(['https://elsewhere.example/data', '//elsewhere.example/data', 'javascript:alert(1)',
  'file:///data.json', 'data:application/json,4', 'https://user:pass@spreadsheet.example/data',
  'https://spreadsheet.example@elsewhere.example/data', '', 4, null])(
  'rejects unsafe URL %j before network access', async url => {
    const { value, fetcher } = await fetchValue(4, [url])
    expect(value).toEqual({ error: '#VALUE!' })
    expect(fetcher).not.toHaveBeenCalled()
  },
)

test.each([[], ['/data', '/x', 4], ['/data', 'x'], ['/data', '/~9']].map(args => ({ args })))(
  'rejects invalid arguments $args before network access', async ({ args }) => {
    const { value, fetcher } = await fetchValue(4, args)
    expect(value).toEqual({ error: '#VALUE!' })
    expect(fetcher).not.toHaveBeenCalled()
  },
)

test.each([{}, [], [1, 2], [[1], [2, 3]], [[{}]]].map(document => ({ document })))(
  'rejects unsupported JSON result $document', async ({ document }) => {
    expect((await fetchValue(document)).value).toEqual({ error: '#VALUE!' })
  },
)

test('HTTP/network/redirect failure remains #N/A', async () => {
  const signal = new AbortController().signal
  expect(await fetchJsonFormula(['/data'], origin, signal,
    vi.fn(async () => new Response('denied', { status: 403 })))).toEqual({ error: '#N/A' })
  expect(await fetchJsonFormula(['/data'], origin, signal,
    vi.fn(async () => { throw new TypeError('redirect is not allowed') }))).toEqual({ error: '#N/A' })
})

test.each([
  () => new Response('{broken', { headers: { 'content-type': 'application/json' } }),
  () => new Response('42', { headers: { 'content-type': 'text/html' } }),
  () => new Response('1e400', { headers: { 'content-type': 'application/json' } }),
  () => new Response('42', { headers: { 'content-type': 'application/json', 'content-length': '1048577' } }),
  () => new Response(`"${'a'.repeat(1_048_576)}"`, { headers: { 'content-type': 'application/json' } }),
  () => response(Array.from({ length: 65 }, () => Array(64).fill(1))),
  () => response({ deep: Array(20_001).fill(1), value: 3 }),
  () => new Response(`${'{"x":'.repeat(34)}3${'}'.repeat(34)}`, { headers: { 'content-type': 'application/json' } }),
])('rejects malformed or over-budget JSON', async makeResponse => {
  const result = await fetchJsonFormula(['/data'], origin, new AbortController().signal,
    vi.fn(async () => makeResponse()))
  expect(result).toEqual({ error: '#VALUE!' })
})

test('a mid-response transport failure is #N/A, while invalid UTF-8 is #VALUE!', async () => {
  const bytes = new TextEncoder().encode('{"value":')
  let reads = 0
  const brokenStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (reads++ === 0) controller.enqueue(bytes)
      else controller.error(new TypeError('Network connection lost'))
    },
  })
  const headers = { 'content-type': 'application/json' }
  expect(await fetchJsonFormula(['/data'], origin, new AbortController().signal,
    vi.fn(async () => new Response(brokenStream, { headers })))).toEqual({ error: '#N/A' })
  expect(await fetchJsonFormula(['/data'], origin, new AbortController().signal,
    vi.fn(async () => new Response(new Uint8Array([0xff]), { headers })))).toEqual({ error: '#VALUE!' })
})
