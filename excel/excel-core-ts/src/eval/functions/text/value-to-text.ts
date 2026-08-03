/**
 * 把任意 `Value`（含数组）渲染成它的文本形态：T / VALUETOTEXT / ARRAYTOTEXT。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl, Value } from '../../../types'
import { errValue, findNestedError, readInteger } from './read-args'

function quoteStrictText(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function renderValueToText(v: Value, strict: boolean): string {
  switch (v.kind) {
    case 'blank':
      return ''
    case 'string':
      return strict ? quoteStrictText(v.value) : v.value
    case 'number':
      return String(v.value)
    case 'boolean':
      return v.value ? 'TRUE' : 'FALSE'
    case 'error':
      return v.code
    case 'array':
      return formatGridToText(v.value, strict)
  }
}

function formatGridToText(rows: readonly Value[][], strict: boolean): string {
  const inner = rows
    .map((row) => row.map((cell) => renderValueToText(cell, strict)).join(','))
    .join(';')
  return strict ? `{${inner}}` : inner
}

function readStrictFormat(
  args: Value[],
): { ok: true; value: boolean } | { ok: false; error: Value } {
  if (args.length < 2) return { ok: true, value: false }
  const r = readInteger(args[1])
  if (!r.ok) return r
  return { ok: true, value: r.value === 1 }
}

/** T(value) — passthrough for strings, "" for everything else. */
export const T: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'T requires 1 argument')
  const v = args[0]
  // Errors propagate.
  if (v.kind === 'error') return v
  if (v.kind === 'string') return v
  return { kind: 'string', value: '' }
}

export const VALUETOTEXT: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'VALUETOTEXT takes 1 or 2 arguments')
  const err =
    findNestedError(args[0]) ?? (args.length === 2 ? propagateError([args[1]]) : undefined)
  if (err) return err
  const formatR = readStrictFormat(args)
  if (!formatR.ok) return formatR.error
  return { kind: 'string', value: renderValueToText(args[0], formatR.value) }
}

export const ARRAYTOTEXT: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'ARRAYTOTEXT takes 1 or 2 arguments')
  const err =
    findNestedError(args[0]) ?? (args.length === 2 ? propagateError([args[1]]) : undefined)
  if (err) return err
  const formatR = readStrictFormat(args)
  if (!formatR.ok) return formatR.error
  if (args[0].kind === 'array') {
    return { kind: 'string', value: formatGridToText(args[0].value, formatR.value) }
  }
  const body = renderValueToText(args[0], formatR.value)
  return { kind: 'string', value: formatR.value ? `{${body}}` : body }
}
