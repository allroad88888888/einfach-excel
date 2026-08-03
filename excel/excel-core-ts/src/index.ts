/**
 * Public surface of `@einfach/excel-core-ts`.
 *
 * Phase 0: only re-exports the frozen type contracts (`types.ts`).
 * Subsequent phases add: workbook factory, parser, evaluator, function
 * registry, custom formula host hooks.
 */

export type {
  // 1. Addressing
  CellKey,
  CellCoord,
  CellRange,

  // 2. Errors
  ErrorCode,

  // 3. Value
  Value,

  // 4. Cell
  Cell,
  CellFormat,

  // 5. AST
  Expr,
  NumberLiteral,
  StringLiteral,
  BooleanLiteral,
  ErrorLiteral,
  ReferenceExpr,
  RangeExpr,
  DynamicRangeExpr,
  SpillReferenceExpr,
  CrossSheetExpr,
  MultiAreaExpr,
  NameExpr,
  UnaryExpr,
  BinaryExpr,
  BinaryOp,
  PercentExpr,
  CallExpr,
  LambdaCallExpr,
  ArrayLiteralExpr,

  // 6. Mutations
  SheetMutation,
  SetCellMutation,
  ClearCellMutation,
  BulkApplyMutation,
  SetFormatMutation,

  // 7. EvalContext + names
  EvalContext,
  CustomCallOrigin,
  NameBinding,

  // 8. FunctionImpl
  FunctionImpl,

  // 9. Staged
  Workbook,
  WorkbookSheet,
} from './types'

export { ERROR_CODES, BLANK } from './types'

// Wave B / B3 — A1 + range helpers. Pure functions; safe to re-export
// from the package root.
export {
  EXCEL_MAX_COL,
  EXCEL_MAX_ROW,
  EXPAND_MAX_CELLS,
  RangeTooLargeError,
  cellKey,
  colIndexToName,
  colNameToIndex,
  expandRange,
  formatA1,
  iterateRange,
  normalizeRange,
  parseA1,
  parseRange,
  parseRangeString,
  rangeContains,
  rangesIntersect,
} from './refs'
export type { FormatA1Input, ParsedA1 } from './refs'

// Wave B / B1 — public formula parser entry point.
export { parseFormula } from './parser'

// Wave B / B2 — workbook + sheet + minimal evaluator.
export { createWorkbook } from './workbook'
export type {
  CreateWorkbookOptions,
  SheetSeed,
  BulkCellInput,
  BulkTypedCellInput,
  FormulaCacheState,
  PendingAsyncCustomCall,
} from './workbook'
export { createSheet, keyFor, applyCell } from './sheet'
export type { SheetState, SheetResolvers, SheetDebugProviders } from './sheet'
export {
  evaluate,
  toNumber,
  toBoolean,
  valueToString,
  propagateError,
  parseRefToKey,
  parseRefToCoord,
} from './eval'
export type { CoerceResult, CoerceOk, CoerceErr } from './eval'
// Excel「General」数字→文本的单点实现。宿主的显示边界
// （`worker-runtime-ts.ts` 的 `valueDisplay`）必须走它，而不是 `String(n)` ——
// 否则同一个数字在「`&` 拼接出来的文本」和「单元格显示」上是两种写法。
export { excelGeneralToText } from './eval/general-text'
// 溢出投影：「一个地址落在哪个锚点的矩形里、投影出什么标量」的单点实现。
// 公式层（`eval/evaluate.ts` 的读路径）与宿主的显示边界
// （`worker-runtime-ts.ts`）走的是同一份几何与同一个 lookback 上限 —— 两边各写一
// 遍就会出现「公式算得出 6、格子里显示空」这类分歧。
export {
  anchorScalar,
  projectedValueAt,
  scanSpillAnchors,
  SPILL_PROJECTION_LOOKBACK,
} from './eval/spill-projection'
export type {
  SpillAnchorHit,
  SpillAnchorScan,
  SpillAnchorSource,
} from './eval/spill-projection'

// Wave C — built-in function registry (math / logical / lookup / text /
// date / stats). Evaluator dispatches against `BUILTIN_FUNCTIONS`.
export {
  BUILTIN_FUNCTIONS,
  getBuiltinFunction,
  listBuiltinNames,
} from './eval/functions'
