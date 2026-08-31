// 一句话：把一次单元格输入写成存储态的 DisplayCell。

import { excelGeneralToText } from '@einfach/excel-core-ts'
import type {
  DisplayCell,
  DisplayCellRichValue,
  SetCellInputRequest,
  SetCellRichValueRequest,
} from '@einfach/spreadsheet-ui-core'
import { cloneRichValue, getRichValueText, keyFor } from '@einfach/spreadsheet-ui-core'

export function updateCell(
  cells: Map<string, DisplayCell>,
  request: SetCellInputRequest,
  options?: { preserveAsText?: boolean },
): DisplayCell | null {
  if (request.input.length === 0) {
    cells.delete(keyFor(request.row, request.col))
    return null
  }

  // preserveAsText: bypass numeric inference and formula detection. The
  // input lands verbatim as a string cell — `=A1` stays literal `=A1`,
  // `00123` keeps its leading zeros.
  if (options?.preserveAsText) {
    const cell: DisplayCell = {
      row: request.row,
      col: request.col,
      displayValue: request.input,
      valueKind: 'string',
    }
    cells.set(keyFor(request.row, request.col), cell)
    return cell
  }

  const trimmed = request.input.trimStart()
  const isFormula = trimmed.startsWith('=')

  let displayValue = request.input
  let valueKind: DisplayCell['valueKind'] = 'string'
  let formula: string | undefined
  let numeric: number | undefined

  if (isFormula) {
    formula = trimmed
    // Initial pass — display will be replaced at projection-read time once we
    // have the full sheet to resolve references against. Store a placeholder
    // so downstream consumers (formula bar) see *something* before the next
    // projection refresh.
    displayValue = trimmed
    valueKind = 'string'
  } else {
    const parsed = Number(request.input)
    if (Number.isFinite(parsed) && request.input.trim().length > 0) {
      valueKind = 'number'
      numeric = parsed
      // 数字字面量的显示走 Excel General 规格，不是把输入原样回显。两个真引擎
      // 都是「输入解析成 double，再按 General 格式化」，所以 `=5/3` 经 Paste
      // Special 除法落地的输入串 `1.6666666666666667` 在它们那里显示为
      // `1.66666666666667`；这里原样回显就会差 17 位对 15 位。
      // 原始双精度不丢 —— 它走 `numericValue` 通道（求和/筛选/排序读的是它）。
      displayValue = excelGeneralToText(parsed)
    }
  }

  const cell: DisplayCell = {
    row: request.row,
    col: request.col,
    displayValue,
    valueKind,
    ...(numeric === undefined ? {} : { numericValue: numeric }),
    ...(formula ? { formula } : {}),
  }

  cells.set(keyFor(request.row, request.col), cell)
  return cell
}

function valueKindForRichValue(value: DisplayCellRichValue): DisplayCell['valueKind'] {
  switch (value.kind) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'error':
      return 'error'
    default:
      return 'string'
  }
}

export function updateCellRichValue(
  cells: Map<string, DisplayCell>,
  request: SetCellRichValueRequest,
): DisplayCell {
  const richValue = cloneRichValue(request.value)
  const cell: DisplayCell = {
    row: request.row,
    col: request.col,
    displayValue: getRichValueText(richValue),
    valueKind: valueKindForRichValue(richValue),
    richValue,
  }

  cells.set(keyFor(request.row, request.col), cell)
  return cell
}
