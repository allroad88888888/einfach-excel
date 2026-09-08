import type { CellRange } from '../shared'

export type RustClipboardPasteMode = 'all' | 'values' | 'formats' | 'values-formats'

/** 文本属于系统剪贴板；公式/格式快照不离开 Rust。token 只识别当前 Worker 的快照。 */
export interface RustClipboardCapture {
  readonly text: string
  readonly rows: number
  readonly cols: number
  readonly cut: boolean
  readonly token: string
}

export interface RustClipboardCaptureRequest {
  readonly sheetId: string
  readonly range: CellRange
  readonly cut: boolean
}

export interface RustClipboardPasteRequest {
  readonly mode?: RustClipboardPasteMode
  readonly transpose?: boolean
  readonly skipBlanks?: boolean
  readonly selection?: CellRange
  readonly sheetId: string
  readonly requestId: number
  readonly row: number
  readonly col: number
  readonly text: string
  readonly token?: string
  readonly rowCount: number
  readonly colCount: number
  readonly unlockedRanges?: readonly CellRange[]
}
