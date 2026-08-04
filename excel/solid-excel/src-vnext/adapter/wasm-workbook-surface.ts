import type { AsyncCustomRequest } from './async-custom-pump'
import type { CellWriteOutcomeWire, FormulaWriteOutcomeWire } from './cell-write-reject'
import type {
  AutoFillReportWire,
  AutoFillRequestWire,
  CellFormatJSON,
  CellRefWire,
  CellSnapshotWire,
  FormatRangeSnapshot,
  ImportCellWire,
  WorkbookPersistenceRestoreStatsWire,
  WorkbookPersistenceSnapshotWire,
  ViewportSizeSnapshotWire,
  SparseCellWire,
  ColumnFilterRuleWire,
  FilterApplyResultWire,
  SheetFilterStateWire,
  HiddenRowsSnapshotWire,
  FilterSnapshotWire,
  TableJSONWire,
  TableRegistrySnapshotWire,
  WorkbookImportStatsWire,
} from './worker-protocol'

/**
 * STORAGE_PRIMARY Phase 6.3 — wire shape consumed by the wasm
 * `bulk_install_workbook` entry (Phase 6.2). One entry per sheet;
 * `primitives` / `formulas` are `[addr, value]` pairs and addr strings
 * use the zero-based `"R:C"` encoding the binding accepts. Error cells
 * ride as `{ error }` objects (no `kind` discriminator on this wire).
 *
 * The engine treats every listed sheet as a FULL-SHEET REPLACE
 * (`Workbook::install_sheet_bulk` tears down previous content first),
 * so this payload is only safe against a fresh workbook — the atomic
 * import shell created at `beginImport`.
 */
export type BulkInstallPrimitiveWire = number | string | boolean | { error: string }

export type SheetBulkInstallWire = {
  sheet: number
  primitives: Array<[string, BulkInstallPrimitiveWire]>
  formulas: Array<[string, string]>
}

export type WasmWorkbookRuntime = {
  sheet_count(): number
  sheet_name(idx: number): string
  add_sheet(name: string): number
  rename_sheet(idx: number, name: string): boolean
  remove_sheet(idx: number): boolean
  move_sheet(from: number, to: number): boolean
  /**
   * Single-cell writes, fallible variants ONLY. The infallible
   * `set_cell_*` / `clearCellAt` / `setFormulaAt` twins the binding also
   * exposes are deliberately NOT declared here: they swallow the engine's
   * `SheetError`s and answer with a success-shaped ACK, so a refused write
   * vanished while the host was told it applied. Leaving them off the
   * runtime surface means a future edit cannot reach one by accident —
   * see `./cell-write-reject`.
   *
   * Optional so hand-rolled test doubles keep compiling; a missing
   * binding becomes a structured `WASM_METHOD_UNAVAILABLE` refusal
   * through `assertMethod`, never a fallback to the lossy twin.
   */
  trySetCellNumber?: (sheetIdx: number, addr: string, value: number) => CellWriteOutcomeWire
  trySetCellText?: (sheetIdx: number, addr: string, value: string) => CellWriteOutcomeWire
  trySetCellBoolean?: (sheetIdx: number, addr: string, value: boolean) => CellWriteOutcomeWire
  trySetCellError?: (sheetIdx: number, addr: string, value: string) => CellWriteOutcomeWire
  tryClearCellAt?: (sheetIdx: number, addr: string) => CellWriteOutcomeWire
  trySetFormulaAt?: (sheetIdx: number, addr: string, formula: string) => FormulaWriteOutcomeWire
  insert_row(sheetIdx: number, at: number, count: number): void
  delete_row(sheetIdx: number, at: number, count: number): void
  insert_col(sheetIdx: number, at: number, count: number): void
  delete_col(sheetIdx: number, at: number, count: number): void
  subscribe_cell?: (sheetName: string, addr: string, callback: () => void) => number
  unsubscribe_cell?: (token: number) => void
  get_display(sheetIdx: number, addr: string): string
  get_number(sheetIdx: number, addr: string): number
  get_type(sheetIdx: number, addr: string): string
  is_error(sheetIdx: number, addr: string): boolean
  get_formula(sheetIdx: number, addr: string): string
  snapshotCell(sheetIdx: number, addr: string): CellSnapshotWire
  bulk_import_cells(cells: ImportCellWire[]): WorkbookImportStatsWire
  /**
   * STORAGE_PRIMARY Phase 6.2/6.3 — storage-primary bulk install.
   * Optional because test mocks and pre-Phase-6.2 wasm-pkg builds do
   * not expose it; the atomic commit path falls back to the legacy
   * `bulk_import_cells` when missing.
   */
  bulk_install_workbook?: (payload: SheetBulkInstallWire[]) => unknown
  list_non_empty_cells?: () => CellRefWire[]
  snapshot_sparse?: () => SparseCellWire[]
  snapshot_range_sparse?: (
    sheetIdx: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => SparseCellWire[]
  restore_sparse?: (cells: SparseCellWire[]) => number
  read_sparse_range?: (
    sheetIdx: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => CellSnapshotWire[]
  clear_range?: (
    sheetIdx: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => number
  /**
   * 动态数组的三个 UI 查询导出（ADR 0006 阶段 3 及其后续）。
   *
   * - `spillAnchor(sheet, addr)` → 锚点地址字符串；`addr` 是锚点本身/普通格/空格时 `null`。
   * - `spillInfo(sheet, addr)` → `Uint32Array [rows, cols]`；`addr` 不是**已装上投影**的
   *   锚点时 `null`（碰撞态 `#SPILL!` 锚点也算不是）。
   * - `spillBlocker(sheet, addr)` → 这个碰撞态锚点**要清哪一格**才能溢出来，地址字符串；
   *   答不出时 `null`。前两个合起来只能说「这里没有活动数组」，说不出 `#SPILL!` 的
   *   **原因**，这个补上。它报的不一定是物理上压着矩形的那一格：那一格若是别的数组的
   *   投影格，引擎报的是那个数组的锚点（清投影格只会换来第二个 `#SPILL!`）。
   *   「那一格是不是一个数组」不另设导出 —— 拿它的地址回头问一次 `spillInfo` 即可。
   *
   * 可选：手写的测试替身与早于这些导出的 wasm-pkg 没有它们。前两个缺席时经
   * `assertMethod` 变成结构化的 `WASM_METHOD_UNAVAILABLE`，而不是假装「这里没有数组」；
   * `spillBlocker` 缺席则**静默降级**成「答不出」—— 它是纯装饰性的一句提示，为它把整个
   * 溢出区查询打成错误是本末倒置。
   */
  spillAnchor?: (sheetIdx: number, addr: string) => string | null | undefined
  spillInfo?: (sheetIdx: number, addr: string) => ArrayLike<number> | null | undefined
  spillBlocker?: (sheetIdx: number, addr: string) => string | null | undefined
  apply_auto_fill?: (request: AutoFillRequestWire) => AutoFillReportWire
  set_format_range?: (
    sheetIdx: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    fmt: CellFormatJSON | null | undefined,
  ) => number
  snapshot_format_range?: (
    sheetIdx: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => FormatRangeSnapshot
  restore_format_snapshot?: (snapshot: FormatRangeSnapshot) => number
  snapshot_viewport_sizes?: (
    sheetIdx: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => ViewportSizeSnapshotWire
  set_row_height?: (sheetIdx: number, rowIndex: number, heightPx: number) => boolean
  set_col_width?: (sheetIdx: number, colIndex: number, widthPx: number) => boolean
  /**
   * Engine hidden-row eval input (parity #23). Whole-set REPLACE of the
   * hidden-row set the SUBTOTAL 101-111 variants exclude for `sheetIdx`
   * (an empty array clears it); the paired engine epoch bump re-derives
   * only the 101-111 formulas that consumed it. Optional so pre-#23
   * wasm-pkg builds and test mocks keep compiling; `assertMethod` guards
   * the call at dispatch time.
   */
  setEvalHiddenRows?: (sheetIdx: number, rows: Uint32Array | number[]) => void
  /**
   * Engine FILTER-hidden row eval input (`design-filter-hidden-rows` §6.5).
   * Whole-set REPLACE of the rows an active filter hides on `sheetIdx` (an
   * empty array clears it). Consumed by BOTH SUBTOTAL bands, unlike its
   * manual twin above. Optional so a wasm-pkg predating the export and test
   * mocks keep compiling — the dispatcher answers a structured `UNSUPPORTED`
   * when it is absent instead of throwing, which is what makes the design's
   * tier-2 degradation ("filter applies to the view, the engine never hears
   * about it") silent rather than a broken filter.
   */
  setEvalFilterHiddenRows?: (sheetIdx: number, rows: Uint32Array | number[]) => void
  /**
   * Engine physical sort (design-engine-sort S2). Reorders the range's
   * data rows in place and returns EITHER the success report
   * `{ ok: true, movedRows, movedCells, rowPermutation }` OR a structured
   * reject `{ ok: false, code, anchor?, message? }` — both in the Ok arm;
   * only a catastrophic report-serialization failure throws. Optional so
   * pre-S2 wasm-pkg builds and test mocks keep compiling; `assertMethod`
   * guards the call at dispatch time.
   */
  sortRange?: (sheetIdx: number, payload: unknown) => unknown
  /**
   * Excel Table CRUD (#32). `createTable` returns the engine-assigned
   * canonical name; rename / rename-column / delete return `void`.
   * Structured engine rejections THROW a `TableError` string
   * (`"range-overlap"`, `"name-conflict"`, …) — the dispatcher maps the
   * known set to a `TABLE_REJECTED` RPC error. Optional so pre-#32
   * wasm-pkg builds and test mocks keep compiling; `assertMethod` guards
   * the call at dispatch time.
   */
  createTable?: (
    sheetIdx: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    name?: string,
  ) => string
  renameTable?: (name: string, newName: string) => void
  renameTableColumn?: (name: string, oldColumn: string, newColumn: string) => void
  deleteTable?: (name: string) => void
  listTables?: () => TableJSONWire[]
  getTable?: (name: string) => TableJSONWire | null
  /**
   * Totals row (#32 T6). Both THROW a `TableError` string on a structured
   * reject; `setTableTotalFunction` additionally throws
   * `"invalid-totals-function"` for an unrecognized aggregate id. Optional so
   * pre-T6 wasm-pkg builds keep compiling; `assertMethod` guards the call.
   */
  setTableTotalsRow?: (name: string, enabled: boolean) => void
  setTableTotalFunction?: (name: string, column: string, func: string) => void
  /**
   * Table registry snapshot / restore (#25). `snapshotTables` is a pure read;
   * `restoreTables` REPLACES the registry wholesale and returns the resulting
   * Table count, THROWING a bare string (`"unsupported-snapshot-version"`,
   * `"malformed-snapshot"`, or a `TableError` id) for a payload it refuses —
   * all-or-nothing, so a refusal leaves the live registry untouched. Optional
   * so pre-#25 wasm-pkg builds and test mocks keep compiling; `assertMethod`
   * guards the call at dispatch time.
   */
  snapshotTables?: () => TableRegistrySnapshotWire
  restoreTables?: (snapshot: TableRegistrySnapshotWire) => number
  /**
   * Engine-owned hidden rows + filter (design-engine-hidden-rows E2/E3). The
   * three filter commands return the `{ ok, … }` union in their resolved value
   * (a structured refusal is NEVER a throw — `sortRange` convention); only a
   * serialization failure throws. `getFilter` is a whole-sheet read;
   * `snapshot*`/`restore*` are the whole-workbook undo primitives. Optional so
   * a wasm-pkg predating the exports and test mocks keep compiling —
   * `assertMethod` guards the call at dispatch time.
   */
  applyFilter?: (
    sheetIdx: number,
    payload: { rules: ColumnFilterRuleWire[] },
  ) => FilterApplyResultWire
  reapplyFilter?: (sheetIdx: number) => FilterApplyResultWire
  clearFilter?: (sheetIdx: number) => FilterApplyResultWire
  getFilter?: (sheetIdx: number) => SheetFilterStateWire
  hideRows?: (sheetIdx: number, rows: Uint32Array | number[]) => boolean
  unhideRows?: (sheetIdx: number, rows: Uint32Array | number[]) => boolean
  listHiddenRows?: (sheetIdx: number) => number[]
  snapshotHidden?: () => HiddenRowsSnapshotWire
  restoreHidden?: (snapshot: HiddenRowsSnapshotWire) => number
  snapshotFilters?: () => FilterSnapshotWire
  restoreFilters?: (snapshot: FilterSnapshotWire) => number
  snapshot_persistence_v1?: () => WorkbookPersistenceSnapshotWire
  restore_persistence_v1?: (
    snapshot: WorkbookPersistenceSnapshotWire,
  ) => WorkbookPersistenceRestoreStatsWire
  debug_formula_cache_state?: (sheetIdx: number, addr: string) => string
  debug_formula_eval_count?: (sheetIdx: number) => number
  debug_formula_eval_count_total?: () => number
  debug_formula_count?: () => number
  debug_live_subscription_count?: () => number
  debug_sheet_live_subscription_count?: (sheetIdx: number) => number
  debug_sheet_formula_count?: (sheetIdx: number) => number
  debug_cross_sheet_dependents_count?: () => number
  /**
   * Wave 8 — register a synchronous JS callback as a user-defined
   * formula. The Rust side calls back into JS with a plain `Array` of
   * arg values and expects a `number | string | boolean | null |
   * undefined` return. Optional because the WASM crate may not have
   * landed the bridge yet; the worker runtime stubs gracefully when
   * missing.
   *
   * Method names match agent A's `wasm-bindgen` `js_name` exports:
   * `registerCustomFormula` / `unregisterCustomFormula`. Register
   * returns `void`; unregister returns `true` iff an entry was removed.
   */
  registerCustomFormula?: (
    name: string,
    fn: (args: Array<number | string | boolean | null>) => unknown,
  ) => void
  unregisterCustomFormula?: (name: string) => boolean
  /**
   * Wave 8.2 — async custom formulas. Registration is name-only (the
   * callback stays in this worker's map and never crosses into wasm);
   * the engine memoizes per (name, args), holds cells at #BUSY!, and
   * queues requests that the pump drains after every command. Optional:
   * pre-8.2 wasm-pkg builds and test mocks may not expose them — async
   * registration then degrades to a sync registration of a callback
   * that returns #VALUE! never (we simply refuse, see
   * registerCustomFormulaInWorker).
   */
  registerCustomFormulaAsync?: (name: string) => void
  drainAsyncCustomRequests?: () => AsyncCustomRequest[]
  resolveAsyncCustomCall?: (callId: number, value: unknown) => boolean
}

/**
 * 一份 `wasm-pack --target web` 产物的模块命名空间，收窄到 worker 运行时真正
 * 用到的两个成员：默认导出的 `init` 与 `WasmWorkbook` 构造器。
 *
 * 这是 lite / full 两份产物的**唯一**差异点 —— 运行时代码只认这个结构，不认
 * 具体目录，所以薄入口（`worker-runtime.ts` / `worker-runtime-full.ts`）各自
 * 静态 import 自己那份 `wasm-pkg*`，再把命名空间交给
 * `installWorkerRuntime()`。库里没有任何 barrel 或 factory 引用这两个目录，
 * 只想要 lite 的消费者因此不会被拽去构建 full。
 */
export type WorkerWasmModule = {
  default: () => Promise<unknown>
  WasmWorkbook: new () => unknown
}
