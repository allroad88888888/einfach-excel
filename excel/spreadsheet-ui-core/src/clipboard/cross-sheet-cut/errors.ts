/** 跨表结构移动尚未定义的边界由 Rust 原子拒绝，保留已确认的剪切快照。 */
export const crossSheetCutErrors: Readonly<Record<string, string>> = {
  CLIPBOARD_CROSS_SHEET_MERGE:
    'Unmerge the source and destination before moving cells between sheets. No cells were moved.',
  CLIPBOARD_CROSS_SHEET_TABLE:
    'Move cells outside Excel Tables before cutting between sheets. No cells were moved.',
  CLIPBOARD_CROSS_SHEET_NAMED_RANGE:
    'The cut cells overlap a named range. Change or remove that name in Name manager before moving cells between sheets. No cells were moved.',
}
