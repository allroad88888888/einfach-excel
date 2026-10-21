/** FETCHJSON is a trusted application extension, not an Office built-in. */
export type JsonFormulaScalar = string | number | boolean | null
export type JsonFormulaValue = JsonFormulaScalar | JsonFormulaScalar[][]
export type AsyncFormulaError = { readonly error: '#VALUE!' | '#N/A' }

export const FETCH_JSON_LIMITS = Object.freeze({
  bytes: 1_048_576, timeoutMs: 5_000, concurrent: 4,
  cells: 4_096, nodes: 20_000, depth: 32, queued: 128,
})

class InvalidJsonFormula extends Error {}

function sameOriginUrl(value: unknown, origin: string): URL {
  if (typeof value !== 'string' || !value || value.length > 8_192)
    throw new InvalidJsonFormula('Expected a same-origin URL.')
  const url = new URL(value, `${origin}/`)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin ||
    url.username || url.password)
    throw new InvalidJsonFormula('Only same-origin HTTP(S) URLs without credentials are allowed.')
  return url
}

/** RFC 6901 JSON Pointer: own-property lookup never executes code or follows prototypes. */
export function selectJsonPointer(document: unknown, pointer: unknown): unknown {
  if (pointer === undefined || pointer === '') return document
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer.length > 8_192)
    throw new InvalidJsonFormula('Expected a JSON Pointer.')
  let value = document
  for (const encoded of pointer.slice(1).split('/')) {
    if (/~(?:[^01]|$)/u.test(encoded)) throw new InvalidJsonFormula('Invalid pointer escape.')
    const key = encoded.replace(/~1/gu, '/').replace(/~0/gu, '~')
    if (value === null || typeof value !== 'object' ||
      !Object.prototype.hasOwnProperty.call(value, key) ||
      (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/u.test(key)))
      throw new InvalidJsonFormula('Pointer does not identify a JSON value.')
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

function validateDocument(document: unknown): void {
  const stack = [{ value: document, depth: 0 }]
  let nodes = 0
  while (stack.length) {
    const item = stack.pop()!
    if (++nodes > FETCH_JSON_LIMITS.nodes || item.depth > FETCH_JSON_LIMITS.depth)
      throw new InvalidJsonFormula('JSON structure budget exceeded.')
    if (item.value !== null && typeof item.value === 'object') {
      for (const value of Object.values(item.value)) stack.push({ value, depth: item.depth + 1 })
    }
  }
}

function scalar(value: unknown): value is JsonFormulaScalar {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
}

function formulaValue(value: unknown): JsonFormulaValue {
  if (scalar(value)) return value
  if (!Array.isArray(value) || !value.length || !Array.isArray(value[0]) || !value[0].length)
    throw new InvalidJsonFormula('Expected a scalar or a non-empty rectangular scalar array.')
  const columns = value[0].length
  if (value.length * columns > FETCH_JSON_LIMITS.cells || value.some(row =>
    !Array.isArray(row) || row.length !== columns || !row.every(scalar)))
    throw new InvalidJsonFormula('Invalid or oversized result array.')
  return value as JsonFormulaScalar[][]
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (!type || (type !== 'application/json' && !/^application\/[\w.+-]+\+json$/u.test(type)))
    throw new InvalidJsonFormula('Expected a JSON response.')
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/u.test(length) || Number(length) > FETCH_JSON_LIMITS.bytes))
    throw new InvalidJsonFormula('Response size budget exceeded.')
  if (!response.body) throw new InvalidJsonFormula('Empty JSON response.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const decode = (chunk?: Uint8Array, stream = false): string => {
    try { return decoder.decode(chunk, { stream }) } catch {
      throw new InvalidJsonFormula('Response is not valid UTF-8.')
    }
  }
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > FETCH_JSON_LIMITS.bytes)
        throw new InvalidJsonFormula('Response size budget exceeded.')
      text += decode(chunk.value, true)
    }
    text += decode()
    return JSON.parse(text)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Errors stay explicit spreadsheet errors; a failed request never becomes an empty value. */
export async function fetchJsonFormula(
  args: readonly unknown[], origin: string, signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<JsonFormulaValue | AsyncFormulaError> {
  try {
    if (args.length < 1 || args.length > 2) throw new InvalidJsonFormula('Expected one or two arguments.')
    let url: URL
    try { url = sameOriginUrl(args[0], origin) } catch {
      throw new InvalidJsonFormula('Invalid same-origin URL.')
    }
    // Validate pointer syntax before starting network I/O, including absent paths.
    if (args[1] !== undefined && (typeof args[1] !== 'string' ||
      args[1].length > 8_192 || (args[1] !== '' && !args[1].startsWith('/')) ||
      /~(?:[^01]|$)/u.test(args[1])))
      throw new InvalidJsonFormula('Invalid JSON Pointer.')
    const response = await fetcher(url.href, {
      method: 'GET', signal, credentials: 'omit', redirect: 'error',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return { error: '#N/A' }
    let document: unknown
    try { document = await readBoundedJson(response) } catch (error) {
      if (signal.aborted) return { error: '#N/A' }
      if (error instanceof InvalidJsonFormula || error instanceof SyntaxError)
        return { error: '#VALUE!' }
      throw error
    }
    validateDocument(document)
    return formulaValue(selectJsonPointer(document, args[1]))
  } catch (error) {
    return { error: error instanceof InvalidJsonFormula ? '#VALUE!' : '#N/A' }
  }
}
