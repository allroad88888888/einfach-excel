type CellType = 'number' | 'text' | 'boolean' | 'error' | 'null'
import type { FormulaMutationResult } from './format'

export interface WorkerLike {
  postMessage(msg: unknown): void
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  terminate(): void
}

export interface WorkerWorkbookOptions {
  workerFactory: () => WorkerLike
}
export type CellWire =
  | { type: 'number'; value: number }
  | { type: 'text'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; value: string }
  | { type: 'null' }

// Zero-based import coordinates: `{ row: 0, col: 0 }` means A1.
export type ImportCellWire =
  | { sheet: number; row: number; col: number; kind: 'number'; value: number }
  | { sheet: number; row: number; col: number; kind: 'text'; value: string }
  | { sheet: number; row: number; col: number; kind: 'boolean'; value: boolean }
  | { sheet: number; row: number; col: number; kind: 'error'; value: string }
  | { sheet: number; row: number; col: number; kind: 'formula'; value: string }
  | { sheet: number; row: number; col: number; kind: 'null' }

export interface ImportCellIssueWire {
  sheet?: number
  row?: number
  col?: number
  kind?: string
  code: string
  message: string
}

export interface WorkbookImportStatsWire {
  accepted: number
  formulas: number
  rejectedFormulas: number
  cleared: number
  errors: number
  issues?: ImportCellIssueWire[]
}

export type ImportSessionModeWire = 'atomic' | 'direct'

export interface BeginImportOptionsWire {
  mode?: ImportSessionModeWire
  atomic?: boolean
}

export type SparseCellWire =
  | { sheet: number; addr: string; row: number; col: number; kind: 'number'; value: number }
  | { sheet: number; addr: string; row: number; col: number; kind: 'text'; value: string }
  | { sheet: number; addr: string; row: number; col: number; kind: 'boolean'; value: boolean }
  | { sheet: number; addr: string; row: number; col: number; kind: 'error'; value: string }
  | { sheet: number; addr: string; row: number; col: number; kind: 'formula'; value: string }

export interface SparseRangeWire {
  sheet: number
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export type AutoFillDirectionWire = 'up' | 'down' | 'left' | 'right'

export type AutoFillSeriesWire =
  | 'copy'
  | 'integer-step'
  | 'decimal-step'
  | 'linear-trend'
  | 'date-day'
  | 'date-week'
  | 'date-month'
  | 'text-number'
  | 'weekday-name'
  | 'month-name'
  | 'custom-list'

export interface AutoFillRangeWire {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface AutoFillTextPatternWire {
  prefix: string
  suffix: string
  width: number
}

/**
 * Execution-boundary witness for locale-sensitive named lists. `locale` is
 * required on the worker wire even though the public detector type keeps it
 * optional for compatibility with older callers.
 */
export interface AutoFillListWitnessWire {
  listName: string
  values: readonly string[]
  locale: string
}

export interface AutoFillRequestWire {
  sheet: number
  sourceRange: AutoFillRangeWire
  targetRange: AutoFillRangeWire
  direction: AutoFillDirectionWire
  series: AutoFillSeriesWire
  step?: number
  textPattern?: AutoFillTextPatternWire
  list?: AutoFillListWitnessWire
}

export interface AutoFillReportWire {
  writeRange: AutoFillRangeWire | null
  written: number
}

export interface SparseRangeSnapshotSessionWire {
  sessionId: number
  totalRows: number
  rowsPerChunk: number
}

export interface SparseRangeSnapshotChunkWire {
  sessionId: number
  startRow: number
  endRow: number
  cells: SparseCellWire[]
  done: boolean
}

export interface ExportRangeTsvSessionWire {
  sessionId: number
  totalRows: number
  rowsPerChunk: number
}

export interface ExportRangeTsvChunkWire {
  sessionId: number
  startRow: number
  endRow: number
  chunk: string
  done: boolean
}

export type ExportRangeTsvChunkConsumerWire = (
  chunk: ExportRangeTsvChunkWire,
) => void | Promise<void>

export interface ViewportRowHeightWire {
  rowIndex: number
  heightPx: number
}

export interface ViewportColumnWidthWire {
  colIndex: number
  widthPx: number
}

export interface ViewportSizeSnapshotWire extends SparseRangeWire {
  rowHeights: ViewportRowHeightWire[]
  colWidths: ViewportColumnWidthWire[]
}

export interface CellRefWire {
  sheet: number
  addr: string
}

export interface CellSnapshotWire extends CellRefWire {
  display: string
  type: CellType
  isError: boolean
  formula: string
}

/**
 * `spillRegion` 的应答：要么是一个**活动**溢出区，要么是一个碰撞态锚点的阻塞线索。
 * 地址一律零基 row/col，与投影同一坐标系。
 *
 * `anchorRow` / `anchorCol` 恒等于矩形左上角 —— 数组只往下、往右溢出。
 *
 * 两种形态互斥：
 *
 * - **活动溢出区**：带 `rows` / `cols`，不带 `blockedBy`。
 * - **碰撞态（`#SPILL!`）锚点**：带 `blockedBy`，不带 `rows` / `cols` —— 它一个格子都
 *   没装上，没有矩形可画（与 Excel 一致）。
 *
 * 都不是（普通格、空格、越界）时整个应答是 `null`。
 *
 * **两个 runtime 在这里行为不同，这是刻意的**：`blockedBy` 只有 WASM runtime 会给。
 * TS 参考引擎的溢出目标在表里根本没有条目，碰撞态锚点连「它想要多大的矩形」都没存
 * （`validateSpillAnchorValue` 算完就丢），所以它答不出「被谁挡住」—— 于是它对碰撞态
 * 锚点仍回 `null`，也就是**诚实地说不知道**，而不是编一个地址。跨引擎差异钉在
 * `excel/solid-excel/test/cross-engine-parity-spill.test.ts`。
 */
export interface SpillRegionWire {
  sheet: number
  anchorRow: number
  anchorCol: number
  /** 溢出区尺寸。只有活动溢出区有；碰撞态锚点缺席。 */
  rows?: number
  cols?: number
  /**
   * 这个碰撞态锚点**要清哪一格**才能溢出来。引擎答不出就缺席。
   *
   * 不是「矩形里行主序第一个非空格」那么直白：那一格若是别的数组的投影格，引擎报的是
   * **那个数组的锚点**（`sheet_spill_blocker.rs` 的 `blame_for`）—— 清投影格会把那个
   * 数组也塌成 `#SPILL!`，等于拿一个错误换另一个。
   */
  blockedBy?: { row: number; col: number }
  /**
   * `blockedBy` 指的是一个**动态数组**（它是某个数组的锚点），而不是用户自己打的值。
   *
   * 为真时 UI 换一套说法：`blockedBy` 可能是一格用户看着「什么都没有」的地址（数组的
   * 内容画在它的投影格上），照直说「清掉 C1」会让人以为提示指错了。
   *
   * 与 `blockedBy` 一样是**可选**的，且只在为真时出现：缺席 = 「不是数组」或「答不出」，
   * UI 对两者的处理一样（退回朴素说法）。旧 wasm-pkg 上恒缺席。
   */
  blockedByArray?: boolean
  /**
   * 锚点那一格的公式原文（含 `=`）。公式栏在投影格上要显示的就是它 —— 投影格没有
   * 自己的公式。**与 `rows`/`cols` 同行**：只有活动溢出区带，碰撞态锚点不带。
   *
   * 与 `blockedBy` 不同，这条**两个 runtime 都答得出**：WASM 走早就在产物里的
   * `get_formula` 导出，TS runtime 直接读锚点条目的 `input`。答不出（老产物、手写
   * 替身）时整个字段缺席，UI 退回「显示投影值、可编辑」的原行为。
   *
   * 走这条应答而不是另发一次读单元格：溢出区查询本来就每次选区移动才发一次，锚点
   * 又可能落在可见窗口之外（`=SEQUENCE(10000)` 滚到中段），单独去读要么多一个往返、
   * 要么读不到。
   */
  anchorFormula?: string
}

export interface WorkbookSheetMeta {
  idx: number
  name: string
}

export interface RpcErrorWire {
  code: string
  message: string
  /**
   * Optional structured, command-specific rejection detail carried past
   * the flat `code`/`message` pair. `sortRange` uses it to forward the
   * engine's `{ code, anchor?, message? }` reject payload (`SortRangeRejectWire`)
   * — the RPC `code` is `SORT_REJECTED`, `detail.code` is the engine
   * reason. `TABLE_REJECTED` (`TableRejectWire`) and `CELL_WRITE_REJECTED`
   * (`CellWriteRejectWire`) follow the same convention. Absent for every
   * other command.
   */
  detail?: unknown
}

export type FormulaMutationResultWire = FormulaMutationResult
