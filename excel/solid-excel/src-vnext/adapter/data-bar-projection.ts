// 一句话：把 Data Bar 的完整规则数值域投影成只读的装饰条形元数据。

import type {
  ConditionalFormatRuleEntry,
  DataBarRule,
  DisplayCell,
} from '@einfach/spreadsheet-ui-core'
import { isCoordInsideRange } from '@einfach/spreadsheet-ui-core'

const DEFAULT_MIN_COLOR = '#dbeafe'
const DEFAULT_MAX_COLOR = '#2563eb'
const CSS_HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i

export interface DataBarDomain {
  readonly min: number
  readonly max: number
}

export type DataBarDomains = ReadonlyMap<string, DataBarDomain>

export interface DataBarProjection {
  readonly ratio: number
  readonly minColor: string
  readonly maxColor: string
}

// Deliberately transient: adapter read projection → Grid only. It is neither
// canonical workbook state nor a persistence field, so no generic core clone
// promises to carry it across a separate projection boundary.
type DisplayCellWithDataBar = DisplayCell & {
  readonly dataBar?: DataBarProjection
}

/** Data bars intentionally accept only canonical numeric projections, not display text. */
export function dataBarNumericValue(cell: DisplayCell | undefined): number | null {
  return typeof cell?.numericValue === 'number' && Number.isFinite(cell.numericValue)
    ? cell.numericValue
    : null
}

/** Callers supply every numeric cell in every configured scope, never just a viewport. */
export function collectDataBarDomains(
  entries: readonly ConditionalFormatRuleEntry[],
  cells: Iterable<DisplayCell>,
): Map<string, DataBarDomain> {
  const dataBars = entries.filter((entry) => entry.rule.kind === 'data-bar')
  const domains = new Map<string, { min: number; max: number }>()
  if (dataBars.length === 0) return domains

  for (const cell of cells) {
    const value = dataBarNumericValue(cell)
    if (value === null) continue
    for (const entry of dataBars) {
      if (!isCoordInsideRange(cell.row, cell.col, entry.scope.range)) continue
      const domain = domains.get(entry.id)
      if (domain) {
        domain.min = Math.min(domain.min, value)
        domain.max = Math.max(domain.max, value)
      } else {
        domains.set(entry.id, { min: value, max: value })
      }
    }
  }
  return domains
}

export function dataBarProjection(
  rule: DataBarRule,
  value: number,
  domain: DataBarDomain | undefined,
): DataBarProjection | undefined {
  if (!domain) return undefined
  const ratio =
    domain.min === domain.max ? 1 : clampRatio((value - domain.min) / (domain.max - domain.min))
  return {
    ratio,
    minColor: safeDataBarColor(rule.minColor, DEFAULT_MIN_COLOR),
    maxColor: safeDataBarColor(rule.maxColor, DEFAULT_MAX_COLOR),
  }
}

export function withDataBarProjection(cell: DisplayCell, dataBar: DataBarProjection): DisplayCell {
  return {
    ...cell,
    dataBar: {
      ratio: Number.isFinite(dataBar.ratio) ? clampRatio(dataBar.ratio) : 0,
      minColor: safeDataBarColor(dataBar.minColor, DEFAULT_MIN_COLOR),
      maxColor: safeDataBarColor(dataBar.maxColor, DEFAULT_MAX_COLOR),
    },
  } as DisplayCell
}

export function getDataBarProjection(cell: DisplayCell | undefined): DataBarProjection | undefined {
  const dataBar = (cell as DisplayCellWithDataBar | undefined)?.dataBar
  return isDataBarProjection(dataBar) ? dataBar : undefined
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function isDataBarProjection(value: unknown): value is DataBarProjection {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.ratio === 'number' &&
    Number.isFinite(candidate.ratio) &&
    candidate.ratio >= 0 &&
    candidate.ratio <= 1 &&
    isSafeDataBarColor(candidate.minColor) &&
    isSafeDataBarColor(candidate.maxColor)
  )
}

function safeDataBarColor(value: unknown, fallback: string): string {
  return isSafeDataBarColor(value) ? value : fallback
}

function isSafeDataBarColor(value: unknown): value is string {
  return typeof value === 'string' && CSS_HEX_COLOR.test(value)
}
