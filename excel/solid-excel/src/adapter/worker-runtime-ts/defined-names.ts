import { parseFormula, type NameBinding, type Value } from '@einfach/excel-core-ts'

import { rpcError } from './runtime-errors'
import type { RuntimeState } from './runtime-state'

function parseValueBinding(rawBinding: unknown): NameBinding {
  const binding = rawBinding as { literal?: unknown }
  const literal =
    typeof binding.literal === 'string' ? binding.literal : String(binding.literal ?? '')
  let value: Value
  if (literal.length === 0) value = { kind: 'blank' }
  else if (/^-?\d+(?:\.\d+)?$/.test(literal)) value = { kind: 'number', value: Number(literal) }
  else if (literal.toUpperCase() === 'TRUE' || literal.toUpperCase() === 'FALSE') {
    value = { kind: 'boolean', value: literal.toUpperCase() === 'TRUE' }
  } else value = { kind: 'string', value: literal }
  return { kind: 'value', value }
}

function parseLambdaBinding(rawBinding: unknown): NameBinding {
  const binding = rawBinding as { params?: unknown; body?: unknown }
  if (!Array.isArray(binding.params) || binding.params.some((param) => typeof param !== 'string')) {
    throw rpcError('INVALID_NAME_BINDING', 'lambda binding requires params: string[]')
  }
  if (typeof binding.body !== 'string' || binding.body.length === 0) {
    throw rpcError('INVALID_NAME_BINDING', 'lambda binding requires body: non-empty string')
  }
  const params = (binding.params as string[])
    .map((param) => param.trim())
    .filter((param) => param.length > 0)
  const body = binding.body.startsWith('=') ? binding.body : `=${binding.body}`
  let ast
  try {
    ast = parseFormula(body)
  } catch (err) {
    throw rpcError(
      'INVALID_LAMBDA_BODY',
      err instanceof Error ? err.message : `failed to parse lambda body: ${String(err)}`,
    )
  }
  if (ast.kind === 'error') {
    throw rpcError('INVALID_LAMBDA_BODY', `failed to parse lambda body: ${ast.code}`)
  }
  return { kind: 'lambda', params, body: ast }
}

function parseNameBinding(rawBinding: unknown): NameBinding {
  if (!rawBinding || typeof rawBinding !== 'object') {
    throw rpcError('INVALID_NAME_BINDING', 'binding must be an object')
  }
  const binding = rawBinding as { kind?: unknown }
  if (binding.kind === 'range') {
    const range = rawBinding as { sheetName?: unknown; start?: unknown; end?: unknown }
    if (typeof range.start !== 'string' || typeof range.end !== 'string') {
      throw rpcError('INVALID_NAME_BINDING', 'range binding requires start + end strings')
    }
    return {
      kind: 'range',
      sheetName: typeof range.sheetName === 'string' ? range.sheetName : undefined,
      start: range.start,
      end: range.end,
    }
  }
  if (binding.kind === 'value') return parseValueBinding(rawBinding)
  if (binding.kind === 'lambda') return parseLambdaBinding(rawBinding)
  throw rpcError('INVALID_NAME_BINDING', `unknown binding kind: ${String(binding.kind)}`)
}

export function defineNameInWorker(
  state: RuntimeState,
  name: string,
  rawBinding: unknown,
): boolean {
  if (typeof name !== 'string' || name.length === 0) {
    throw rpcError('INVALID_NAME', 'name must be a non-empty string')
  }
  state.workbook.defineName(name, parseNameBinding(rawBinding))
  state.workbook.recalc()
  return true
}

export function undefineNameInWorker(state: RuntimeState, name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  const removed = state.workbook.undefineName(name)
  if (removed) state.workbook.recalc()
  return removed
}
