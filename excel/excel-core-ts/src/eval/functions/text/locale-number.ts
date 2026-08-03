/**
 * 按工作簿 locale 的数字格式渲染数值：DOLLAR 带货币符号，FIXED 不带。
 */

import { propagateError, toNumber } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { formatCurrency, formatNumber } from '../_locale'
import { errValue, readBoolean, readInteger, ERR_VALUE } from './read-args'
import { roundHalfAwayFromZero } from './format-numeric'

export const DOLLAR: FunctionImpl = (args, ctx) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'DOLLAR takes 1 or 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const nR = toNumber(args[0])
  if (!nR.ok) return nR.error
  if (!Number.isFinite(nR.value)) return ERR_VALUE
  let decimals = 2
  if (args.length === 2) {
    const r = readInteger(args[1])
    if (!r.ok) return r.error
    decimals = r.value
  }
  // Negative decimals → round to the nearest 10^|d| but still render with
  // zero decimal places. Intl can't take a negative `minimumFractionDigits`,
  // so we pre-round and then format with 0 decimals.
  let value = nR.value
  let renderedDecimals = decimals
  if (decimals < 0) {
    const factor = 10 ** -decimals
    value = roundHalfAwayFromZero(value / factor) * factor
    renderedDecimals = 0
  }
  return { kind: 'string', value: formatCurrency(value, ctx.locale, renderedDecimals) }
}

export const FIXED: FunctionImpl = (args, ctx) => {
  if (args.length < 1 || args.length > 3)
    return errValue('#VALUE!', 'FIXED takes 1 to 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const nR = toNumber(args[0])
  if (!nR.ok) return nR.error
  if (!Number.isFinite(nR.value)) return ERR_VALUE
  let decimals = 2
  if (args.length >= 2) {
    const r = readInteger(args[1])
    if (!r.ok) return r.error
    decimals = r.value
  }
  let noCommas = false
  if (args.length === 3) {
    const r = readBoolean(args[2])
    if (!r.ok) return r.error
    noCommas = r.value
  }
  let value = nR.value
  let renderedDecimals = decimals
  if (decimals < 0) {
    const factor = 10 ** -decimals
    value = roundHalfAwayFromZero(value / factor) * factor
    renderedDecimals = 0
  }
  return {
    kind: 'string',
    value: formatNumber(value, ctx.locale, {
      decimals: renderedDecimals,
      useGrouping: !noCommas,
    }),
  }
}
