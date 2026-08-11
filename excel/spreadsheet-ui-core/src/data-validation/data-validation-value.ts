import type { CellRange } from '../shared'
import type { ValidationRule } from './types'

export function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

export function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Fall through to guarded string coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown data validation transport failure'
  }
}

export function copyRange(range: Readonly<CellRange>): CellRange {
  return { ...range }
}

export function snapshotRange(value: unknown): CellRange | null {
  if (!isObjectRecord(value)) return null
  try {
    const { rowStart, rowEnd, colStart, colEnd } = value
    if (
      typeof rowStart !== 'number' ||
      !Number.isSafeInteger(rowStart) ||
      rowStart < 0 ||
      typeof rowEnd !== 'number' ||
      !Number.isSafeInteger(rowEnd) ||
      rowEnd < rowStart ||
      typeof colStart !== 'number' ||
      !Number.isSafeInteger(colStart) ||
      colStart < 0 ||
      typeof colEnd !== 'number' ||
      !Number.isSafeInteger(colEnd) ||
      colEnd < colStart
    ) {
      return null
    }
    return { rowStart, rowEnd, colStart, colEnd }
  } catch {
    return null
  }
}

export function freezeRange(range: Readonly<CellRange>): Readonly<CellRange> {
  return Object.freeze(copyRange(range))
}

export function sameRange(left: Readonly<CellRange>, right: Readonly<CellRange>): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

export function copyRule(rule: ValidationRule): ValidationRule {
  return rule.kind === 'list' ? { ...rule, values: [...rule.values] } : { ...rule }
}

export function freezeRule(rule: ValidationRule): ValidationRule {
  if (rule.kind === 'list') {
    return Object.freeze({ ...rule, values: Object.freeze([...rule.values]) }) as ValidationRule
  }
  return Object.freeze({ ...rule })
}

export function snapshotRule(value: unknown): ValidationRule | undefined | null {
  if (value === undefined) return undefined
  if (!isObjectRecord(value)) return null
  try {
    const { kind } = value
    if (kind === 'list') {
      const { values, dropdown } = value
      if (!Array.isArray(values) || !values.every((item) => typeof item === 'string')) return null
      if (typeof dropdown !== 'boolean') return null
      return { kind, values: [...values], dropdown }
    }
    if (kind === 'range') {
      const { min, max, integerOnly } = value
      if (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) return null
      if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) return null
      if (integerOnly !== undefined && typeof integerOnly !== 'boolean') return null
      return {
        kind,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
        ...(integerOnly === undefined ? {} : { integerOnly }),
      }
    }
    if (kind === 'regex') {
      const { pattern, flags } = value
      if (typeof pattern !== 'string' || (flags !== undefined && typeof flags !== 'string')) {
        return null
      }
      return { kind, pattern, ...(flags === undefined ? {} : { flags }) }
    }
    if (kind === 'formula') {
      return typeof value.formula === 'string' ? { kind, formula: value.formula } : null
    }
    return null
  } catch {
    return null
  }
}
