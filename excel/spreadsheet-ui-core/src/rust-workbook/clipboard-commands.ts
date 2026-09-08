import type { CellRange } from '../shared'

export type RustClipboardExportFormat = 'text' | 'markdown' | 'html'

/** 只用于系统剪贴板的显示文本；不携带内部复制/剪切身份或工作簿副本。 */
export interface RustClipboardExport {
  readonly text: string
  readonly html?: string
  readonly rows: number
  readonly cols: number
}

export interface RustClipboardExportRequest {
  readonly sheetId: string
  readonly range: CellRange
  readonly format: RustClipboardExportFormat
}

export type RustClipboardPasteMode =
  | 'all'
  | 'values'
  | 'formats'
  | 'values-formats'
  | 'formulas'
  | 'formulas-number-formats'
  | 'values-number-formats'
  | 'column-widths'

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
  readonly arithmetic?: 'none' | 'add' | 'subtract' | 'multiply' | 'divide'
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
