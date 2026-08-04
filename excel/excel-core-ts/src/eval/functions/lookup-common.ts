/** Shared value coercion and shape helpers for lookup functions. */
import type { Value } from '../../types'
import { toNumber } from '../coerce'

export const ERR_VALUE: Value = { kind: 'error', code: '#VALUE!' }
export const ERR_REF: Value = { kind: 'error', code: '#REF!' }
export const ERR_NA: Value = { kind: 'error', code: '#N/A' }

export function asLookupGrid(value: Value): Value[][] | null {
  if (value.kind === 'array') {
    return value.value.length === 0 || value.value[0].length === 0 ? null : value.value
  }
  return value.kind === 'blank' ? null : [[value]]
}

export function lookupNumber(value: Value | undefined, fallback: number): number | null {
  if (value === undefined || value.kind === 'blank') return fallback
  const number = toNumber(value)
  return number.ok ? Math.trunc(number.value) : null
}

export function lookupBoolean(value: Value | undefined, fallback: boolean): boolean | null {
  if (value === undefined || value.kind === 'blank') return fallback
  switch (value.kind) {
    case 'boolean':
      return value.value
    case 'number':
      return value.value !== 0
    case 'string': {
      const normalized = value.value.trim().toUpperCase()
      if (normalized === 'TRUE' || normalized === '1') return true
      if (normalized === 'FALSE' || normalized === '0') return false
      return null
    }
    default:
      return null
  }
}

export function gridToLookupVector(grid: Value[][]): Value[] | null {
  if (grid.length === 1) return grid[0].slice()
  if (grid[0].length === 1) return grid.map((row) => row[0])
  return null
}
