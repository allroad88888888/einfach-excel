// 一句话：把 Color Scale 的完整规则范围数值投影成背景颜色。

import type {
  ColorScaleRule,
  ConditionalFormatRuleEntry,
  DisplayCell,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import { isCoordInsideRange, numericValue } from '@einfach/spreadsheet-ui-core'

export interface ColorScaleDomain {
  readonly min: number
  readonly max: number
}

export type ColorScaleDomains = ReadonlyMap<string, ColorScaleDomain>

interface RgbColor {
  readonly red: number
  readonly green: number
  readonly blue: number
}

/** The projected number wins over display text, which may have a number format. */
export function colorScaleNumericValue(cell: DisplayCell | undefined): number | null {
  if (typeof cell?.numericValue === 'number' && Number.isFinite(cell.numericValue)) {
    return cell.numericValue
  }
  return numericValue(cell?.displayValue ?? '')
}

/**
 * Each rule observes only numeric cells inside its own complete scope. Callers
 * deliberately supply that whole scope rather than a visible projection window.
 */
export function collectColorScaleDomains(
  entries: readonly ConditionalFormatRuleEntry[],
  cells: Iterable<DisplayCell>,
): Map<string, ColorScaleDomain> {
  const colorScales = entries.filter((entry) => entry.rule.kind === 'color-scale')
  const domains = new Map<string, { min: number; max: number }>()
  if (colorScales.length === 0) return domains

  for (const cell of cells) {
    const value = colorScaleNumericValue(cell)
    if (value === null) continue
    for (const entry of colorScales) {
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

export function colorScaleFormat(
  rule: ColorScaleRule,
  value: number,
  domain: ColorScaleDomain | undefined,
): SpreadsheetCellFormat {
  if (!domain || domain.min === domain.max || value >= domain.max) {
    return { bgColor: rule.maxColor }
  }
  if (value <= domain.min) return { bgColor: rule.minColor }

  const ratio = (value - domain.min) / (domain.max - domain.min)
  if (rule.midColor) {
    if (ratio === 0.5) return { bgColor: rule.midColor }
    if (ratio < 0.5) return { bgColor: interpolateColor(rule.minColor, rule.midColor, ratio * 2) }
    return { bgColor: interpolateColor(rule.midColor, rule.maxColor, (ratio - 0.5) * 2) }
  }
  return { bgColor: interpolateColor(rule.minColor, rule.maxColor, ratio) }
}

function interpolateColor(start: string, end: string, ratio: number): string {
  const startRgb = parseRgbColor(start)
  const endRgb = parseRgbColor(end)
  if (!startRgb || !endRgb) return ratio < 0.5 ? start : end
  const mix = (left: number, right: number) => Math.round(left + (right - left) * ratio)
  return `rgb(${mix(startRgb.red, endRgb.red)}, ${mix(startRgb.green, endRgb.green)}, ${mix(startRgb.blue, endRgb.blue)})`
}

function parseRgbColor(color: string): RgbColor | null {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const normalized = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex
    return {
      red: Number.parseInt(normalized.slice(0, 2), 16),
      green: Number.parseInt(normalized.slice(2, 4), 16),
      blue: Number.parseInt(normalized.slice(4, 6), 16),
    }
  }

  const components = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (!components) return null
  const [red, green, blue] = components.slice(1).map(Number)
  if (![red, green, blue].every((component) => component >= 0 && component <= 255)) return null
  return { red, green, blue }
}
