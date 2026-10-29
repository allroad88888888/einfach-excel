import { crossSheetCutErrors } from './cross-sheet-cut/errors'

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ...crossSheetCutErrors,
  DATA_VALIDATION_FAILED:
    'A pasted value does not meet its cell’s data validation rule. Nothing was pasted.',
  CLIPBOARD_PARTIAL_MERGE: 'Select whole merged cells before copying or pasting.',
  CLIPBOARD_MERGE_CONTENT:
    'The paste would hide cell content. Unmerge the destination or change the selection first.',
  CLIPBOARD_MERGE_TABLE: 'Merged cells cannot be pasted inside an Excel Table.',
  CLIPBOARD_EMPTY: 'The copied worksheet was deleted. Copy cells again before pasting.',
  CLIPBOARD_SELECTION_SIZE:
    'The selected range must fit whole copies of the clipboard. Nothing was pasted.',
  CLIPBOARD_CUT_SPECIAL: 'Paste special requires Copy, not Cut. The cut cells are unchanged.',
  CLIPBOARD_FILTERED_CUT: 'Clear the filter before cutting this range. No cells were moved.',
  CLIPBOARD_NO_VISIBLE_ROWS: 'This selection has no unfiltered rows to copy.',
  CLIPBOARD_NO_FORMATS:
    'This clipboard has no workbook formatting. Copy cells in this workbook first.',
  CLIPBOARD_OUTSIDE_SHEET: 'Paste would extend beyond the sheet. Choose another cell.',
  CLIPBOARD_TOO_LARGE: 'This clipboard range is too large. Select a smaller range.',
  CLIPBOARD_CUT_SOURCE_CHANGED: 'The cut cells changed. Cut the range again before pasting.',
  CLIPBOARD_SPILL_SOURCE: 'An array result cannot be cut independently.',
  CLIPBOARD_SPILL_TARGET: 'Paste cannot overwrite an array result.',
  CLIPBOARD_PARTIAL_REFERENCE_MOVE:
    'A formula refers to a larger range. Moving part of that range is not supported yet.',
  CLIPBOARD_LOCKED: 'The source or destination includes locked cells.',
  CLIPBOARD_CUT_CONSUMED: 'These cells have already been moved. Copy or cut again to paste.',
  CLIPBOARD_SHEET_HISTORY_CHANGED:
    'Worksheet history changed the clipboard source. Copy or cut again to paste.',
  CLIPBOARD_INVALID_FORMULA: 'The clipboard contains an invalid formula. Nothing was pasted.',
  CLIPBOARD_INVALID_TSV: 'The clipboard text has unmatched quotes. Nothing was pasted.',
  CLIPBOARD_ARITHMETIC_FORMATS: 'Paste arithmetic needs cell contents, not formatting only.',
  CLIPBOARD_UNSUPPORTED_ARITHMETIC: 'This cell type cannot be used in paste arithmetic.',
  CLIPBOARD_COLUMN_WIDTH_OPTIONS:
    'Column widths cannot be combined with arithmetic, transpose or skip blanks.',
  CLIPBOARD_COLUMN_WIDTH_LOCKED: 'Unprotect the worksheet before pasting column widths.',
}

/** 普通剪贴板与格式刷共享原生错误说明。 */
export function clipboardErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return ERROR_MESSAGES[message] ?? message
}
