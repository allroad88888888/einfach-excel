import type { SpreadsheetCellFormat } from '../backend'
import type { RustClearRangeRequest } from './commands'
import type { WasmWorkbook } from './wasm-types'

// Rust 可选属性用 null 清除；布尔/枚举属性必须显式写默认值，null 表示“不改”。
// 行高/列宽不属于 cellStyle，不在这里重置。
const CLEAR_STYLE = {
  numberFormat: { kind: 'general' },
  bold: false,
  italic: false,
  align: 'default',
  fontSize: null,
  fontFamily: null,
  fgColor: null,
  bgColor: null,
  borders: null,
  underline: false,
  strikethrough: false,
  wrap: false,
  indent: 0,
  verticalAlign: 'default',
  rotation: 0,
  overflow: null,
  shrinkToFit: null,
  locale: null,
} satisfies Record<keyof SpreadsheetCellFormat, unknown>

/** Worker 内按模式调用 Rust 原有清空/样式 API，不建立值或格式副本。 */
export function clearRange(
  workbook: WasmWorkbook,
  sheet: number,
  request: RustClearRangeRequest,
): void {
  const { mode, range, scope } = request
  if (
    !['contents', 'formats', 'all'].includes(mode) ||
    !['cell', 'row', 'column'].includes(scope) ||
    ![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    range.rowEnd < range.rowStart ||
    range.colEnd < range.colStart
  )
    throw new Error('Invalid clear range')
  // 修改前检查本次需要的所有方法，避免缺少方法时只执行一半。
  if (mode !== 'formats' && !workbook.clear_range)
    throw new Error('Rust clear_range is unavailable')
  if (mode !== 'contents' && !workbook.patch_format_range)
    throw new Error('Rust patch_format_range is unavailable')
  const coords = [sheet, range.rowStart, range.colStart, range.rowEnd, range.colEnd] as const
  // 样式解析可能拒绝请求，先让 Rust 校验并写样式；已知有效 sheet/range 的内容清空无失败分支。
  if (mode !== 'contents') workbook.patch_format_range!(...coords, CLEAR_STYLE, scope)
  if (mode !== 'formats') workbook.clear_range!(...coords)
}
