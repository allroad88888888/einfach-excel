import type { SpreadsheetCellFormat } from './cell-format'

export function cloneFormat(format: SpreadsheetCellFormat): SpreadsheetCellFormat {
  const clone: SpreadsheetCellFormat = { ...format }
  if (format.numberFormat) clone.numberFormat = { ...format.numberFormat }
  if (format.fill) clone.fill = { ...format.fill }
  if (format.borders) clone.borders = Object.fromEntries(
    Object.entries(format.borders).map(([side, spec]) => [side, spec && { ...spec }]),
  )
  return clone
}

export function isDefaultFormat(format: SpreadsheetCellFormat): boolean {
  const numberFormat = format.numberFormat
  const numberFormatIsDefault = !numberFormat || numberFormat.kind === 'general'
  const borders = format.borders
  const bordersAreDefault =
    !borders || (!borders.top && !borders.right && !borders.bottom && !borders.left
      && !borders.diagUp && !borders.diagDown)

  return (
    !format.bold &&
    !format.italic &&
    !format.underline &&
    !format.strikethrough &&
    !format.wrap &&
    format.shrinkToFit === undefined &&
    (format.align === undefined || format.align === 'default') &&
    format.verticalAlign === undefined &&
    format.fontBaseline === undefined &&
    format.fontSize === undefined &&
    (format.fontFamily === undefined || format.fontFamily.length === 0) &&
    (format.fgColor === undefined || format.fgColor.length === 0) &&
    (format.bgColor === undefined || format.bgColor.length === 0) &&
    format.fill === undefined &&
    (format.indent === undefined || format.indent === 0) &&
    (format.rotation === undefined || format.rotation === 0) &&
    numberFormatIsDefault &&
    bordersAreDefault
  )
}

export function normalizeFormat(
  format: SpreadsheetCellFormat | null | undefined,
): SpreadsheetCellFormat | undefined {
  if (!format || isDefaultFormat(format)) return undefined
  return cloneFormat(format)
}

