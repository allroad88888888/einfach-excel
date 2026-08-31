import type { RangeRef } from './types'
import type { Value } from './value'
import { isErr } from './value'
interface Criteria {
  match: (v: Value) => boolean
}

function parseCriteria(raw: Value | RangeRef): Criteria | string {
  if (typeof raw === 'object') return '#VALUE!'
  if (typeof raw === 'string' && raw.startsWith('#')) return raw
  if (typeof raw === 'number') {
    const target = raw
    return { match: (v: Value) => typeof v === 'number' && v === target }
  }
  const text: string = raw
  const match = /^(>=|<=|<>|>|<|=)(.+)$/.exec(text.trim())
  if (!match) {
    return { match: (v: Value) => String(v).toLowerCase() === text.toLowerCase() }
  }
  const op = match[1]
  const rhsRaw = match[2].trim()
  const rhsNum = Number(rhsRaw)
  const rhsIsNumber = Number.isFinite(rhsNum) && rhsRaw !== ''
  return {
    match: (v: Value) => {
      if (rhsIsNumber) {
        if (typeof v !== 'number') return false
        switch (op) {
          case '>':
            return v > rhsNum
          case '<':
            return v < rhsNum
          case '>=':
            return v >= rhsNum
          case '<=':
            return v <= rhsNum
          case '=':
            return v === rhsNum
          case '<>':
            return v !== rhsNum
        }
      }
      const lhs = String(v).toLowerCase()
      const rhs = rhsRaw.toLowerCase()
      switch (op) {
        case '=':
          return lhs === rhs
        case '<>':
          return lhs !== rhs
      }
      return false
    },
  }
}

function applySumIf(
  args: Array<Value | RangeRef>,
  resolve: (row: number, col: number) => Value,
): Value {
  const range = args[0]
  const criteriaArg = args[1]
  if (typeof range !== 'object') return '#VALUE!'
  const criteria = parseCriteria(criteriaArg)
  if (typeof criteria === 'string') return criteria
  const sumRange = args.length > 2 && typeof args[2] === 'object' ? (args[2] as RangeRef) : range
  let total = 0
  const rows = range.rowEnd - range.rowStart
  const cols = range.colEnd - range.colStart
  for (let dr = 0; dr <= rows; dr += 1) {
    for (let dc = 0; dc <= cols; dc += 1) {
      const v = resolve(range.rowStart + dr, range.colStart + dc)
      if (!criteria.match(v)) continue
      const target = resolve(sumRange.rowStart + dr, sumRange.colStart + dc)
      if (isErr(target)) return target
      if (typeof target === 'number') total += target
    }
  }
  return total
}

function applyCountIf(
  args: Array<Value | RangeRef>,
  resolve: (row: number, col: number) => Value,
): Value {
  const range = args[0]
  const criteriaArg = args[1]
  if (typeof range !== 'object') return '#VALUE!'
  const criteria = parseCriteria(criteriaArg)
  if (typeof criteria === 'string') return criteria
  let count = 0
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const v = resolve(row, col)
      if (criteria.match(v)) count += 1
    }
  }
  return count
}


export { applyCountIf, applySumIf }
