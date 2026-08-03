/**
 * 罗马数字的双向转换：ROMAN 写出，ARABIC 读回。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { errValue, readInteger, ERR_VALUE } from './read-args'

const ROMAN_TABLE = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
] as const

const ROMAN_FORM_TABLES = [
  ROMAN_TABLE,
  [
    [1000, 'M'], [950, 'LM'], [900, 'CM'], [500, 'D'], [450, 'LD'], [400, 'CD'],
    [100, 'C'], [95, 'VC'], [90, 'XC'], [50, 'L'], [45, 'VL'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ],
  [
    [1000, 'M'], [990, 'XM'], [950, 'LM'], [900, 'CM'], [500, 'D'], [490, 'XD'],
    [450, 'LD'], [400, 'CD'], [100, 'C'], [99, 'IC'], [95, 'VC'], [90, 'XC'],
    [50, 'L'], [49, 'IL'], [45, 'VL'], [40, 'XL'], [10, 'X'], [9, 'IX'],
    [5, 'V'], [4, 'IV'], [1, 'I'],
  ],
  [
    [1000, 'M'], [995, 'VM'], [990, 'XM'], [950, 'LM'], [900, 'CM'], [500, 'D'],
    [495, 'VD'], [490, 'XD'], [450, 'LD'], [400, 'CD'], [100, 'C'], [99, 'IC'],
    [95, 'VC'], [90, 'XC'], [50, 'L'], [49, 'IL'], [45, 'VL'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ],
  [
    [1000, 'M'], [999, 'IM'], [995, 'VM'], [990, 'XM'], [950, 'LM'], [900, 'CM'],
    [500, 'D'], [499, 'ID'], [495, 'VD'], [490, 'XD'], [450, 'LD'], [400, 'CD'],
    [100, 'C'], [99, 'IC'], [95, 'VC'], [90, 'XC'], [50, 'L'], [49, 'IL'],
    [45, 'VL'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ],
] as const

export const ROMAN: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'ROMAN takes 1 or 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const nR = readInteger(args[0])
  if (!nR.ok) return nR.error
  // Excel: ROMAN(0) returns an empty string; out-of-range values are #VALUE!.
  if (nR.value === 0) return { kind: 'string', value: '' }
  if (nR.value < 1 || nR.value > 3999) return ERR_VALUE
  let form = 0
  if (args.length === 2) {
    if (args[1].kind === 'boolean') {
      form = args[1].value ? 0 : 4
    } else {
      const formR = readInteger(args[1])
      if (!formR.ok) return formR.error
      form = formR.value
    }
    if (form < 0 || form > 4) return ERR_VALUE
  }
  let remaining = nR.value
  let out = ''
  for (const [value, symbol] of ROMAN_FORM_TABLES[form]) {
    while (remaining >= value) {
      out += symbol
      remaining -= value
    }
  }
  return { kind: 'string', value: out }
}

export const ARABIC: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'ARABIC takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  if (args[0].kind !== 'string' && args[0].kind !== 'blank') return ERR_VALUE
  const raw = (args[0].kind === 'string' ? args[0].value : '').trim().toUpperCase()
  if (raw === '') return { kind: 'number', value: 0 }
  // Excel ARABIC accepts a leading minus sign for negative numerals
  // (e.g. ARABIC("-MMXXIV") → -2024).
  const negative = raw[0] === '-'
  const s = negative ? raw.slice(1) : raw
  if (s === '') return ERR_VALUE
  let total = 0
  let prev = 0
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i]
    const value =
      ch === 'I' ? 1 :
      ch === 'V' ? 5 :
      ch === 'X' ? 10 :
      ch === 'L' ? 50 :
      ch === 'C' ? 100 :
      ch === 'D' ? 500 :
      ch === 'M' ? 1000 :
      0
    if (value === 0) return ERR_VALUE
    total += value < prev ? -value : value
    prev = value
  }
  return { kind: 'number', value: negative ? -total : total }
}
