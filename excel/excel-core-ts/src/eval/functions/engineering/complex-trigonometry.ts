/** Complex trigonometric and reciprocal-trigonometric functions. */

import type { FunctionImpl } from '../../../types'
import { propagateError } from '../../coerce'
import { ERR } from './shared'
import { complexDiv, complexText, complexUnaryText, coerceToComplex } from './complex-format'

export const IMCOS: FunctionImpl = (args) =>
  complexUnaryText(args, (a, b, suffix) => ({
    real: Math.cos(a) * Math.cosh(b),
    imag: -Math.sin(a) * Math.sinh(b),
    suffix,
  }))

export const IMCOSH: FunctionImpl = (args) =>
  complexUnaryText(args, (a, b, suffix) => ({
    real: Math.cosh(a) * Math.cos(b),
    imag: Math.sinh(a) * Math.sin(b),
    suffix,
  }))

export const IMSIN: FunctionImpl = (args) =>
  complexUnaryText(args, (a, b, suffix) => ({
    real: Math.sin(a) * Math.cosh(b),
    imag: Math.cos(a) * Math.sinh(b),
    suffix,
  }))

export const IMSINH: FunctionImpl = (args) =>
  complexUnaryText(args, (a, b, suffix) => ({
    real: Math.sinh(a) * Math.cos(b),
    imag: Math.cosh(a) * Math.sin(b),
    suffix,
  }))

export const IMTAN: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const sinReal = Math.sin(z.value.real) * Math.cosh(z.value.imag)
  const sinImag = Math.cos(z.value.real) * Math.sinh(z.value.imag)
  const cosReal = Math.cos(z.value.real) * Math.cosh(z.value.imag)
  const cosImag = -Math.sin(z.value.real) * Math.sinh(z.value.imag)
  const out = complexDiv(sinReal, sinImag, cosReal, cosImag)
  if (out === null) return ERR('#NUM!')
  return complexText(out[0], out[1], z.value.suffix)
}

export const IMSEC: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const cosReal = Math.cos(z.value.real) * Math.cosh(z.value.imag)
  const cosImag = -Math.sin(z.value.real) * Math.sinh(z.value.imag)
  const out = complexDiv(1, 0, cosReal, cosImag)
  if (out === null) return ERR('#NUM!')
  return complexText(out[0], out[1], z.value.suffix)
}

export const IMCSC: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const sinReal = Math.sin(z.value.real) * Math.cosh(z.value.imag)
  const sinImag = Math.cos(z.value.real) * Math.sinh(z.value.imag)
  const out = complexDiv(1, 0, sinReal, sinImag)
  if (out === null) return ERR('#NUM!')
  return complexText(out[0], out[1], z.value.suffix)
}

export const IMCOT: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const cosReal = Math.cos(z.value.real) * Math.cosh(z.value.imag)
  const cosImag = -Math.sin(z.value.real) * Math.sinh(z.value.imag)
  const sinReal = Math.sin(z.value.real) * Math.cosh(z.value.imag)
  const sinImag = Math.cos(z.value.real) * Math.sinh(z.value.imag)
  const out = complexDiv(cosReal, cosImag, sinReal, sinImag)
  if (out === null) return ERR('#NUM!')
  return complexText(out[0], out[1], z.value.suffix)
}

export const IMSECH: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const coshReal = Math.cosh(z.value.real) * Math.cos(z.value.imag)
  const coshImag = Math.sinh(z.value.real) * Math.sin(z.value.imag)
  const out = complexDiv(1, 0, coshReal, coshImag)
  if (out === null) return ERR('#NUM!')
  return complexText(out[0], out[1], z.value.suffix)
}

export const IMCSCH: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const z = coerceToComplex(args[0])
  if (!z.ok) return z.error
  const sinhReal = Math.sinh(z.value.real) * Math.cos(z.value.imag)
  const sinhImag = Math.cosh(z.value.real) * Math.sin(z.value.imag)
  const out = complexDiv(1, 0, sinhReal, sinhImag)
  if (out === null) return ERR('#NUM!')
  return complexText(out[0], out[1], z.value.suffix)
}

export const FUNCTIONS: Record<string, FunctionImpl> = {
  IMCOS, IMCOSH, IMSIN, IMSINH, IMTAN, IMSEC, IMCSC, IMCOT, IMSECH, IMCSCH,
}
