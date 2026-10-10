import type { CellCoord } from '../shared'

export interface FormulaReferenceSession {
  /** 首次键盘拾取的起点；跨表从 A1 起步，真实编辑源保留在 editingSession。 */
  anchorCell: CellCoord
  /** 当前浏览/拾取表，不是最终写入表。 */
  sheetId: string
  /** Caret position in the draft at the moment the session was entered. */
  insertionCaret: number
  /**
   * Character range [start, end) of the last inserted reference token.
   * Null until the first pick resolves.
   */
  tokenRange: FormulaReferenceTokenRange | null
  /** Current reference range anchor. Null until the first pick resolves. */
  pickAnchor: CellCoord | null
  /** Current reference range focus. Null until the first pick resolves. */
  pickFocus: CellCoord | null
  /** Whether the pointer is currently being dragged (range pick in progress). */
  dragging: boolean
}

export interface FormulaReferenceTokenRange {
  start: number
  end: number
}

export interface FormulaReferenceInsertionPoint {
  caretIndex: number
  draft: string
}

export interface EnterFormulaReferenceInput {
  anchorCell: CellCoord
  sheetId: string
  insertionCaret: number
  draft: string
}

export interface FormulaReferencePickInput {
  /** Single cell or rectangular range being picked. */
  pickAnchor: CellCoord
  pickFocus: CellCoord
  sheetId: string
  /** True while a pointer drag is still in progress. */
  dragging: boolean
  /** 键盘移动已有引用时保留 F4 设置的行列锁；重新点击默认选择新的相对引用。 */
  preserveLocks?: boolean
}

export type FormulaReferenceExitReason =
  | 'commit'
  | 'cancel'
  | 'operator-typed'
  | 'separator-typed'
  | 'close-paren-typed'
  | 'type-after-pick'

export interface FormulaReferenceInsertIntent {
  type: 'formulaReference.insert'
  draft: string
  caretAfter: number
}
