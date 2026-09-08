import type { CellRange } from '../shared'

/** 仅用于展示的 Rust 历史目录；不含 before/after 数据或本地回放器。 */
export interface RustHistoryEntry {
  readonly label: string
  readonly sheetIndex: number
  /** 原生稳定身份；移动、改名和恢复删除不换 key。 */
  readonly sheetKey?: string
  readonly sheetName?: string
  readonly sheetChange?: boolean
  readonly affectedSheetKeys?: readonly string[]
  readonly affectedSheets?: readonly number[]
  readonly range: CellRange
}
export interface RustHistoryState {
  readonly undoCount: number
  readonly redoCount: number
  readonly entries: readonly RustHistoryEntry[]
  readonly notice: string | null
}
