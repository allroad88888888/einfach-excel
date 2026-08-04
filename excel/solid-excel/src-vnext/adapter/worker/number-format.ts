// 一句话：按数字格式渲染投影单元格的显示值。

import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { DEFAULT_WORKBOOK_LOCALE, formatNumberValue } from '@einfach/spreadsheet-ui-core'

function applyNumberFormatToCell(cell: DisplayCell, workbookLocale: string): DisplayCell {
  const numberFormat = cell.format?.numberFormat
  if (!numberFormat) return cell
  if (cell.valueKind === 'error') return cell
  if (
    cell.valueKind !== 'number' &&
    numberFormat.kind !== 'text' &&
    numberFormat.kind !== 'custom'
  ) {
    return cell
  }

  if (cell.valueKind === 'number' && !Number.isFinite(cell.numericValue)) return cell
  const value = cell.valueKind === 'number' ? cell.numericValue! : cell.displayValue
  const locale = cell.format?.locale ?? workbookLocale
  const result = formatNumberValue(numberFormat, value, { locale })

  if (result.text === cell.displayValue && (!result.color || cell.format?.fgColor)) {
    return cell
  }

  const next: DisplayCell = { ...cell, displayValue: result.text }
  if (result.color && !next.format?.fgColor) {
    next.format = { ...next.format!, fgColor: result.color }
  }
  return next
}

export function applyNumberFormatsToCells(
  cells: DisplayCell[],
  workbookLocale: string = DEFAULT_WORKBOOK_LOCALE,
): DisplayCell[] {
  return cells.map((cell) => applyNumberFormatToCell(cell, workbookLocale))
}
