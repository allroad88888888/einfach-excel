/** Complex-number construction, arithmetic, logarithms, powers, and roots. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'
import {
  type ComplexSuffix,
  coerceToComplex, complexDiv, complexMul, complexText, complexUnaryNumber, complexUnaryText,
  resultSuffix,
} from './complex-format'

export const COMPLEX: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length < 2 || args.length > 3) return ERR('#VALUE!')
  const real = toNumber(args[0])
  if (!real.ok) return real.error
  const imag = toNumber(args[1])
  if (!imag.ok) return imag.error
  let suffix: ComplexSuffix = 'i'
  if (args.length === 3) {
    const suffixArg = args[2]
    if (suffixArg.kind !== 'string' || (suffixArg.value !== 'i' && suffixArg.value !== 'j')) {
      return ERR('#VALUE!')
    }
    suffix = suffixArg.value
  }
  return complexText(real.value, imag.value, suffix)
}

export const IMABS: FunctionImpl = (args) =>
  complexUnaryNumber(args, (a, b) => Math.sqrt(a * a + b * b))

export const IMAGINARY: FunctionImpl = (args) => complexUnaryNumber(args, (_a, b) => b)

export const IMREAL: FunctionImpl = (args) => complexUnaryNumber(args, (a) => a)

export const IMARGUMENT: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  if (z.value.real === 0 && z.value.imag === 0) return ERR('#DIV/0!')
  const out = Math.atan2(z.value.imag, z.value.real)
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

export const IMCONJUGATE: FunctionImpl = (args) =>
  complexUnaryText(args, (a, b, suffix) => ({ real: a, imag: -b, suffix }))

export const IMSUM: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length === 0) return ERR('#VALUE!')
  const first = coerceToComplex(args[0])
  if (!first.ok) return first.error
  let real = first.value.real
  let imag = first.value.imag
  const suffix = resultSuffix(args, first.value.suffix)
  for (let i = 1; i < args.length; i += 1) {
    const z = coerceToComplex(args[i])
    if (!z.ok) return z.error
    real += z.value.real
    imag += z.value.imag
  }
  return complexText(real, imag, suffix)
}

export const IMSUB: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 2) return ERR('#VALUE!')
  const a = coerceToComplex(args[0])
  if (!a.ok) return a.error
  const b = coerceToComplex(args[1])
  if (!b.ok) return b.error
  return complexText(
    a.value.real - b.value.real,
    a.value.imag - b.value.imag,
    a.value.suffix,
  )
}

export const IMPRODUCT: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length === 0) return ERR('#VALUE!')
  const first = coerceToComplex(args[0])
  if (!first.ok) return first.error
  let real = first.value.real
  let imag = first.value.imag
  const suffix = resultSuffix(args, first.value.suffix)
  for (let i = 1; i < args.length; i += 1) {
    const z = coerceToComplex(args[i])
    if (!z.ok) return z.error
    const [nextReal, nextImag] = complexMul(real, imag, z.value.real, z.value.imag)
    real = nextReal
    imag = nextImag
  }
  return complexText(real, imag, suffix)
}

export const IMDIV: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 2) return ERR('#VALUE!')
  const a = coerceToComplex(args[0])
  if (!a.ok) return a.error
  const b = coerceToComplex(args[1])
  if (!b.ok) return b.error
  const out = complexDiv(a.value.real, a.value.imag, b.value.real, b.value.imag)
  if (out === null) return ERR('#DIV/0!')
  return complexText(out[0], out[1], a.value.suffix)
}

export const IMEXP: FunctionImpl = (args) =>
  complexUnaryText(args, (a, b, suffix) => {
    const mag = Math.exp(a)
    return { real: mag * Math.cos(b), imag: mag * Math.sin(b), suffix }
  })

function complexLog(args: ReadonlyArray<Value>, denominator: number): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  if (z.value.real === 0 && z.value.imag === 0) return ERR('#NUM!')
  const modulus = Math.sqrt(z.value.real * z.value.real + z.value.imag * z.value.imag)
  const real = Math.log(modulus) / denominator
  const imag = Math.atan2(z.value.imag, z.value.real) / denominator
  return complexText(real, imag, z.value.suffix)
}

export const IMLN: FunctionImpl = (args) => complexLog(args, 1)
export const IMLOG10: FunctionImpl = (args) => complexLog(args, Math.log(10))
export const IMLOG2: FunctionImpl = (args) => complexLog(args, Math.log(2))

export const IMSQRT: FunctionImpl = (args) =>
  complexUnaryText(args, (a, b, suffix) => {
    const radius = Math.sqrt(a * a + b * b)
    const argHalf = Math.atan2(b, a) / 2
    const mag = Math.sqrt(radius)
    return { real: mag * Math.cos(argHalf), imag: mag * Math.sin(argHalf), suffix }
  })

export const IMPOWER: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 2) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const power = toNumber(args[1])
  if (!power.ok) return power.error
  if (z.value.real === 0 && z.value.imag === 0) {
    if (power.value === 0) return complexText(1, 0, z.value.suffix)
    if (power.value < 0) return ERR('#NUM!')
    return complexText(0, 0, z.value.suffix)
  }
  const radius = Math.sqrt(z.value.real * z.value.real + z.value.imag * z.value.imag)
  const arg = Math.atan2(z.value.imag, z.value.real)
  const mag = Math.pow(radius, power.value)
  const theta = arg * power.value
  return complexText(mag * Math.cos(theta), mag * Math.sin(theta), z.value.suffix)
}

export const FUNCTIONS: Record<string, FunctionImpl> = {
  COMPLEX, IMABS, IMAGINARY, IMREAL, IMARGUMENT, IMCONJUGATE, IMSUM, IMSUB,
  IMPRODUCT, IMDIV, IMEXP, IMLN, IMLOG10, IMLOG2, IMSQRT, IMPOWER,
}
