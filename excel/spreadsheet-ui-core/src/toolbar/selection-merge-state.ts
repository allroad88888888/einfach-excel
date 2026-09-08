import { atom } from '@einfach/core'
import type { CellRange } from '../shared'

/** 确认框只保存待确认目标，不保存单元格内容或 Rust 合并副本。 */
export const selectionMergeFeedbackAtom = atom({
  busy: false,
  error: null as string | null,
  pending: null as {
    sheetId: string
    sheetKey?: string
    range: CellRange
    action: 'merge' | 'center'
  } | null,
})
selectionMergeFeedbackAtom.debugLabel = 'spreadsheet.merge.feedback'
