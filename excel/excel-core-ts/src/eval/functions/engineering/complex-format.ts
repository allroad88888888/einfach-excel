/** Complex-number parsing, formatting, and reusable arithmetic primitives. */

import type { Value } from '../../../types'
import { propagateError } from '../../coerce'
import { ERR, NUM } from './shared'

export type ComplexSuffix = 'i' | 'j'

export interface ComplexValue {
  readonly real: number
  readonly imag: number
  readonly suffix: ComplexSuffix
}

export type ComplexResult =
  | { readonly ok: true; readonly value: ComplexValue }
  | { readonly ok: false; readonly error: Value }

const COMPLEX_DECIMAL_RE = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/

export function parseComplexNumber(s: string): number | null {
  if (!COMPLEX_DECIMAL_RE.test(s)) return null
  return Number(s)
}

export function parseComplex(text: string): ComplexResult {
  const s = text.trim()
  if (s.length === 0) return { ok: false, error: ERR('#VALUE!') }

  const last = s[s.length - 1]
  const hasSuffix = last === 'i' || last === 'j'
  const suffix: ComplexSuffix = last === 'j' ? 'j' : 'i'
  const body = hasSuffix ? s.slice(0, -1) : s

  if (!hasSuffix) {
    const real = parseComplexNumber(body)
    if (real === null) return { ok: false, error: ERR('#VALUE!') }
    return { ok: true, value: { real, imag: 0, suffix: 'i' } }
  }

  let split = -1
  for (let i = 1; i < body.length; i += 1) {
    const ch = body[i]
    if (ch !== '+' && ch !== '-') continue
    const prev = body[i - 1]
    if (prev === 'e' || prev === 'E') continue
    split = i
  }

  if (split >= 0) {
    const realStr = body.slice(0, split)
    const imagStr = body.slice(split)
    const real = parseComplexNumber(realStr)
    if (real === null) return { ok: false, error: ERR('#VALUE!') }
    const imag = imagStr === '+' || imagStr === ''
      ? 1
      : imagStr === '-'
        ? -1
        : parseComplexNumber(imagStr)
    if (imag === null) return { ok: false, error: ERR('#VALUE!') }
    return { ok: true, value: { real, imag, suffix } }
  }

  const imag = body.length === 0 || body === '+'
    ? 1
    : body === '-'
      ? -1
      : parseComplexNumber(body)
  if (imag === null) return { ok: false, error: ERR('#VALUE!') }
  return { ok: true, value: { real: 0, imag, suffix } }
}

export function coerceToComplex(v: Value): ComplexResult {
  switch (v.kind) {
    case 'error':
      return { ok: false, error: v }
    case 'string':
      return parseComplex(v.value)
    case 'number':
      return { ok: true, value: { real: v.value, imag: 0, suffix: 'i' } }
    case 'boolean':
      return { ok: true, value: { real: v.value ? 1 : 0, imag: 0, suffix: 'i' } }
    case 'blank':
      return { ok: true, value: { real: 0, imag: 0, suffix: 'i' } }
    case 'array':
      return { ok: false, error: ERR('#VALUE!') }
  }
}

export function explicitComplexSuffix(v: Value): ComplexSuffix | undefined {
  if (v.kind !== 'string') return undefined
  const text = v.value.trim()
  const last = text[text.length - 1]
  return last === 'i' || last === 'j' ? last : undefined
}

export function resultSuffix(args: ReadonlyArray<Value>, fallback: ComplexSuffix): ComplexSuffix {
  // Excel rule: if ANY input carries a 'j' suffix, the output uses 'j'; otherwise 'i'.
  for (const arg of args) {
    if (explicitComplexSuffix(arg) === 'j') return 'j'
  }
  for (const arg of args) {
    if (explicitComplexSuffix(arg) === 'i') return 'i'
  }
  return fallback
}

export function formatFiniteForComplex(n: number): string {
  const value = Object.is(n, -0) ? 0 : n
  if (value === Math.trunc(value) && Math.abs(value) < 1e16) {
    return String(Math.trunc(value))
  }
  return String(value)
}

export function formatComplex(real: number, imag: number, suffix: ComplexSuffix): string {
  const r = Object.is(real, -0) ? 0 : real
  const i = Object.is(imag, -0) ? 0 : imag
  if (i === 0) return formatFiniteForComplex(r)
  if (r === 0) {
    if (i === 1) return suffix
    if (i === -1) return `-${suffix}`
    return `${formatFiniteForComplex(i)}${suffix}`
  }
  if (i > 0) {
    const imagPart = i === 1 ? '' : formatFiniteForComplex(i)
    return `${formatFiniteForComplex(r)}+${imagPart}${suffix}`
  }
  const absImag = -i
  const imagPart = absImag === 1 ? '' : formatFiniteForComplex(absImag)
  return `${formatFiniteForComplex(r)}-${imagPart}${suffix}`
}

export function complexText(real: number, imag: number, suffix: ComplexSuffix): Value {
  if (!Number.isFinite(real) || !Number.isFinite(imag)) return ERR('#NUM!')
  return { kind: 'string', value: formatComplex(real, imag, suffix) }
}

export function complexUnaryNumber(
  args: ReadonlyArray<Value>,
  f: (real: number, imag: number) => number,
): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const out = f(z.value.real, z.value.imag)
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

export function complexUnaryText(
  args: ReadonlyArray<Value>,
  f: (real: number, imag: number, suffix: ComplexSuffix) => ComplexValue,
): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const out = f(z.value.real, z.value.imag, z.value.suffix)
  return complexText(out.real, out.imag, out.suffix)
}

export function complexMul(a: number, b: number, c: number, d: number): [number, number] {
  return [a * c - b * d, a * d + b * c]
}

export function complexDiv(a: number, b: number, c: number, d: number): [number, number] | null {
  const denom = c * c + d * d
  if (denom === 0) return null
  return [(a * c + b * d) / denom, (b * c - a * d) / denom]
}
