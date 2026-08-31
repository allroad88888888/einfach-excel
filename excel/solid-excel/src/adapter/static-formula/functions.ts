import { applyCountIf, applySumIf } from './criteria'
import { aggregateNumeric } from './aggregate'
import { applySubtotal } from './subtotal'
import { applyVlookup } from './vlookup'
import type { RangeRef } from './types'
import { isErr, isTruthy } from './value'
import type { Value } from './value'
function applyBooleanReduce(
  args: Array<Value | RangeRef>,
  resolve: (row: number, col: number) => Value,
  isAnd: boolean,
): Value {
  const result = isAnd
  let sawAny = false
  for (const arg of args) {
    if (typeof arg === 'object') {
      for (let row = arg.rowStart; row <= arg.rowEnd; row += 1) {
        for (let col = arg.colStart; col <= arg.colEnd; col += 1) {
          const v = resolve(row, col)
          if (isErrLocal(v)) return v
          sawAny = true
          const truthy = isTruthy(v)
          if (isAnd) {
            if (!truthy) return 0
          } else {
            if (truthy) return 1
          }
        }
      }
      continue
    }
    if (isErrLocal(arg)) return arg
    sawAny = true
    const truthy = isTruthy(arg)
    if (isAnd) {
      if (!truthy) return 0
    } else {
      if (truthy) return 1
    }
  }
  if (!sawAny) return '#VALUE!'
  return isAnd ? (result ? 1 : 0) : 0
}

function takeScalar(args: Array<Value | RangeRef>, index: number): Value {
  const arg = args[index]
  if (arg === undefined) return '#VALUE!'
  if (typeof arg === 'object') return '#VALUE!'
  return arg
}

function isErrLocal(v: Value): boolean {
  return typeof v === 'string' && v.startsWith('#')
}

function applyIf(args: Array<Value | RangeRef>): Value {
  const cond = args[0]
  const ifTrue = args[1]
  const ifFalse = args.length > 2 ? args[2] : 0
  if (cond === undefined || ifTrue === undefined) return '#VALUE!'
  if (typeof cond === 'object') return '#VALUE!'
  if (isErrLocal(cond)) return cond
  const branch = isTruthy(cond) ? ifTrue : ifFalse
  if (typeof branch === 'object') return '#VALUE!'
  return branch
}

export function applyFunction(
  name: string,
  args: Array<Value | RangeRef>,
  resolve: (row: number, col: number) => Value,
  isBlank: (row: number, col: number) => boolean,
  hiddenRows?: ReadonlySet<number>,
  filterHiddenRows?: ReadonlySet<number>,
): Value {
    switch (name) {
      case 'IF':
        return applyIf(args)
      case 'SUMIF':
        return applySumIf(args, resolve)
      case 'COUNTIF':
        return applyCountIf(args, resolve)
      case 'ABS': {
        const n = takeScalar(args, 0)
        if (typeof n !== 'number') return isErr(n) ? n : '#VALUE!'
        return Math.abs(n)
      }
      case 'ROUND': {
        const n = takeScalar(args, 0)
        const digits = takeScalar(args, 1)
        if (typeof n !== 'number' || typeof digits !== 'number') return '#VALUE!'
        const factor = Math.pow(10, Math.trunc(digits))
        return Math.round(n * factor) / factor
      }
      case 'CONCAT': {
        let out = ''
        for (const arg of args) {
          if (typeof arg === 'object') {
            // Range — concat row-major.
            for (let row = arg.rowStart; row <= arg.rowEnd; row += 1) {
              for (let col = arg.colStart; col <= arg.colEnd; col += 1) {
                const v = resolve(row, col)
                if (isErr(v)) return v
                out += String(v)
              }
            }
            continue
          }
          if (isErr(arg)) return arg
          out += String(arg)
        }
        return out
      }
      case 'AND':
        return applyBooleanReduce(args, resolve, true)
      case 'OR':
        return applyBooleanReduce(args, resolve, false)
      case 'NOT': {
        const v = takeScalar(args, 0)
        if (isErr(v)) return v
        return isTruthy(v) ? 0 : 1
      }
      case 'LEN': {
        const v = takeScalar(args, 0)
        if (isErr(v)) return v
        return String(v).length
      }
      case 'LOWER': {
        const v = takeScalar(args, 0)
        if (isErr(v)) return v
        return String(v).toLowerCase()
      }
      case 'UPPER': {
        const v = takeScalar(args, 0)
        if (isErr(v)) return v
        return String(v).toUpperCase()
      }
      case 'TRIM': {
        const v = takeScalar(args, 0)
        if (isErr(v)) return v
        // Excel TRIM strips leading/trailing and collapses internal runs of
        // spaces to single spaces.
        return String(v).replace(/\s+/g, ' ').trim()
      }
      case 'SQRT': {
        const n = takeScalar(args, 0)
        if (typeof n !== 'number') return isErr(n) ? n : '#VALUE!'
        if (n < 0) return '#NUM!'
        return Math.sqrt(n)
      }
      case 'MOD': {
        const n = takeScalar(args, 0)
        const divisor = takeScalar(args, 1)
        if (typeof n !== 'number' || typeof divisor !== 'number') return '#VALUE!'
        if (divisor === 0) return '#DIV/0!'
        return n - Math.floor(n / divisor) * divisor
      }
      case 'VLOOKUP':
        return applyVlookup(args, resolve)
      case 'SUBTOTAL':
        return applySubtotal(
          args,
          resolve,
          isBlank,
          hiddenRows,
          filterHiddenRows,
        )
      // SUM-like aggregations fall through.
      default:
        return aggregateNumeric(name, args, resolve)
    }
}
