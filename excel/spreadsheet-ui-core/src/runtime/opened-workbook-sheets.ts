import type { RustWorkbookSheet } from '../rust-workbook/commands'

const MAX_ROWS = 1_048_576
const MAX_COLS = 16_384

/** 校验 Rust 打开原生文件或新建空簿后回报的表目录，转成 UI Core 的工作簿表。 */
export function openedWorkbookSheets(input: readonly RustWorkbookSheet[]) {
  const sheets = input.map((sheet, index) => {
    const { rowCount = 0, colCount = 0 } = sheet
    if (sheet.index !== index || !sheet.id || !Number.isSafeInteger(rowCount) ||
      !Number.isSafeInteger(colCount) || rowCount < 1 || rowCount > MAX_ROWS ||
      colCount < 1 || colCount > MAX_COLS)
      throw new Error('Rust returned invalid workbook metadata.')
    return { ...sheet, rowCount, colCount }
  })
  if (!sheets.length || new Set(sheets.map((sheet) => sheet.id)).size !== sheets.length)
    throw new Error('Rust returned invalid workbook sheets.')
  return sheets
}
