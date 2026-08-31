import type { AutoFillReportWire, AutoFillRequestWire, BeginImportOptionsWire, CellRefWire, CellSnapshotWire, CellWire, ExportRangeTsvChunkConsumerWire, ExportRangeTsvChunkWire, ExportRangeTsvSessionWire, FormulaMutationResultWire, ImportCellWire, RpcErrorWire, SparseCellWire, SparseRangeSnapshotChunkWire, SparseRangeSnapshotSessionWire, SparseRangeWire, SpillRegionWire, ViewportSizeSnapshotWire, WorkbookImportStatsWire, WorkbookSheetMeta } from './cell-range'
import type { CellFormatJSON, FormatRangeSnapshot } from './format'
import type { ColumnFilterRuleWire, FilterApplyResultWire, FilterSnapshotWire, HiddenRowsSnapshotWire, SheetFilterStateWire, SortRangeBoundsWire, SortRangePayloadWire, SortRangeReportWire, TableJSONWire, TableRegistrySnapshotWire } from './table-filter'
import type { ConditionalFormatConfigSnapshotWire, PrintConfigSnapshotWire, RemoveConditionalFormatRuleWire, SetConditionalFormatRuleWire, WorkerRuntimeCapabilitiesResponseWire, WorkerWorkbookDebugCountersWire, WorkbookPersistenceRestoreStatsWire, WorkbookPersistenceSnapshotWire } from './persistence-capability'
export type RpcResponseWire =
  | { id: number; ok: true; result?: unknown }
  | { id: number; ok: false; error: RpcErrorWire }
export type RpcEventWire =
  | { event: 'cellsDirty'; cells: CellRefWire[] }
  | { event: 'cellsHydrated'; cells: CellSnapshotWire[] }
export interface WorkerWorkbookClient {
  initWorkbook(sheets?: string[]): Promise<WorkbookSheetMeta[]>
  /**
   * Honest capability handshake. Resolves `null` when the runtime
   * predates the `describeCapabilities` command (`UNKNOWN_COMMAND`),
   * which the adapter treats as "no claims" — legacy full-trust
   * behavior. A runtime may instead return the explicitly-scoped
   * AutoFill witness without changing older capability families.
   * Optional so hand-rolled
   * client doubles (tests) keep compiling; the adapter reads it with
   * `client.describeCapabilities?.()`.
   */
  describeCapabilities?(): Promise<WorkerRuntimeCapabilitiesResponseWire | null>
  sheetList(): Promise<WorkbookSheetMeta[]>
  getPrintConfig?(sheet: number): Promise<PrintConfigSnapshotWire>
  setPrintConfig?(
    sheet: number,
    config: PrintConfigSnapshotWire['config'],
  ): Promise<PrintConfigSnapshotWire>
  listConditionalFormats?(sheet: number): Promise<ConditionalFormatConfigSnapshotWire>
  setConditionalFormatRule?(
    sheet: number,
    request: SetConditionalFormatRuleWire,
  ): Promise<ConditionalFormatConfigSnapshotWire>
  removeConditionalFormatRule?(
    sheet: number,
    request: RemoveConditionalFormatRuleWire,
  ): Promise<ConditionalFormatConfigSnapshotWire>
  addSheet(name: string): Promise<number>
  renameSheet(sheet: number, name: string): Promise<boolean>
  removeSheet(sheet: number): Promise<boolean>
  moveSheet(from: number, to: number): Promise<boolean>
  /**
   * Single-cell writes. Fail-closed: an engine refusal REJECTS with an
   * Error whose `code` is `CELL_WRITE_REJECTED` and whose `detail` is a
   * `CellWriteRejectWire` — same convention as `sortRange`. Nothing was
   * written when that happens, so a caller must not record undo or bump a
   * revision.
   *
   * `setFormula`'s `false` and `setFormulaDetailed`'s `{ ok: false, code }`
   * are NOT refusals: the source failed to parse or cycled and the cell
   * already holds `#VALUE!` / `#CYCLE!`.
   *
   * A write into a dynamic array's spill region is NOT a refusal either on
   * either runtime: it lands, and the array is withdrawn with the anchor
   * left at `#SPILL!` (ADR 0006).
   */
  setCell(sheet: number, addr: string, value: CellWire): Promise<boolean>
  setFormula(sheet: number, addr: string, formula: string): Promise<boolean>
  setFormulaDetailed(
    sheet: number,
    addr: string,
    formula: string,
  ): Promise<FormulaMutationResultWire>
  clearCell(sheet: number, addr: string): Promise<boolean>
  clearRange(range: SparseRangeWire): Promise<number>
  applyAutoFill?(request: AutoFillRequestWire): Promise<AutoFillReportWire>
  insertRows(sheet: number, rowIndex: number, count: number): Promise<boolean>
  deleteRows(sheet: number, rowIndex: number, count: number): Promise<boolean>
  insertColumns(sheet: number, colIndex: number, count: number): Promise<boolean>
  deleteColumns(sheet: number, colIndex: number, count: number): Promise<boolean>
  setFormatRange(range: SparseRangeWire, fmt: CellFormatJSON | null | undefined): Promise<number>
  snapshotFormatRange(range: SparseRangeWire): Promise<FormatRangeSnapshot>
  restoreFormatSnapshot(snapshot: FormatRangeSnapshot): Promise<number>
  /**
   * Engine physical sort (design-engine-sort S2/S3). Reorders `payload.range`'s
   * data rows in place by `payload.keys`, holding `payload.excludedRows`
   * fixed. Resolves a `SortRangeReportWire` on success. Rejects with an
   * Error whose `code` is `SORT_REJECTED` and whose `detail` is a
   * `SortRangeRejectWire` for every engine/payload gate (invalid-range,
   * empty-keys, key-out-of-range, spill-in-range, invalid-payload). A
   * runtime that declares `sortRange: false` (the TS runtime, which has
   * no physical sort) rejects with `UNSUPPORTED` instead — the host
   * adapter withholds the sort port entirely through the capability
   * handshake, so a compliant caller never reaches this on that runtime.
   */
  sortRange(sheet: number, payload: SortRangePayloadWire): Promise<SortRangeReportWire>
  /**
   * Engine hidden-row eval input (parity #23). Whole-set REPLACE of the
   * hidden-row set the engine's SUBTOTAL 101-111 variants exclude for
   * `sheet` (an empty `rows` clears it). Fire-and-forget: resolves once the
   * worker ACKs so callers can order a follow-up projection read after the
   * paired engine epoch bump. A runtime that declares `evalHiddenRows:
   * false` (the TS runtime) rejects with `UNSUPPORTED`; the host adapter
   * withholds the port entirely through the capability handshake, so a
   * compliant caller never reaches this on that runtime.
   */
  setEvalHiddenRows(sheet: number, rows: readonly number[]): Promise<void>
  /**
   * Engine FILTER-hidden row eval input (`design-filter-hidden-rows` §6.5).
   * Whole-set REPLACE of the row set an ACTIVE FILTER hides on `sheet` (an
   * empty `rows` clears it). Unlike `setEvalHiddenRows` this set is consumed
   * by BOTH SUBTOTAL bands — 1-11 excludes filter-hidden rows too, which is
   * exactly the Excel rule one merged set could never express.
   *
   * OPTIONAL, unlike its twin, and deliberately so: hand-rolled client
   * doubles keep compiling, and the caller must treat both "method absent"
   * and a structured `UNSUPPORTED` / `WASM_METHOD_UNAVAILABLE` rejection as
   * the documented tier-2 degradation (filter still applies to the VIEW, the
   * engine simply never learns about it) rather than as a failed filter.
   */
  setEvalFilterHiddenRows?(sheet: number, rows: readonly number[]): Promise<void>
  /**
   * Excel Table CRUD (#32, design-excel-table.md §10). Optional so
   * hand-rolled client doubles (tests) keep compiling; the WASM runtime
   * always implements them and the host adapter guards presence before
   * use. `createTable` resolves the engine-assigned canonical name;
   * rename / rename-column / delete resolve `void`. A structured engine
   * reject surfaces as an Error whose `code` is `TABLE_REJECTED` and whose
   * `detail` is a `TableRejectWire` (mirrors the `sortRange` convention).
   */
  createTable?(sheet: number, bounds: SortRangeBoundsWire, name?: string): Promise<string>
  renameTable?(name: string, newName: string): Promise<void>
  renameTableColumn?(name: string, oldColumn: string, newColumn: string): Promise<void>
  deleteTable?(name: string): Promise<void>
  listTables?(): Promise<TableJSONWire[]>
  getTable?(name: string): Promise<TableJSONWire | null>
  /**
   * Totals row (#32 T6). `setTableTotalsRow` grows / removes a totals row;
   * `setTableTotalFunction` sets one column's aggregate. Both resolve `void`;
   * a structured engine reject (`totals-row-blocked` / `no-totals-row` /
   * `invalid-totals-function` / `not-found`) surfaces as a `TABLE_REJECTED`
   * RPC error carrying a `TableRejectWire` — same convention as CRUD.
   */
  setTableTotalsRow?(name: string, enabled: boolean): Promise<void>
  setTableTotalFunction?(name: string, column: string, func: string): Promise<void>
  /**
   * Table registry snapshot / restore (#25, design-excel-table.md §11/§12) —
   * the undo primitive behind host-orchestrated Table-definition
   * transactions. `snapshotTables` is a pure read (no epoch bump, no
   * recompute). `restoreTables` REPLACES the whole registry and resolves the
   * number of Tables now registered: Tables created after the snapshot are
   * dropped and Tables deleted since are revived, so restoring an empty
   * `tables` array CLEARS the registry rather than doing nothing. It is
   * all-or-nothing (a rejection leaves the live registry untouched) and bumps
   * the tables epoch only when the registry actually changes.
   *
   * Optional for the same reason as the CRUD ports: hand-rolled client
   * doubles keep compiling and the TS runtime answers `UNSUPPORTED`.
   */
  snapshotTables?(): Promise<TableRegistrySnapshotWire>
  restoreTables?(snapshot: TableRegistrySnapshotWire): Promise<number>
  /**
   * Engine-owned hidden rows + filter (design-engine-hidden-rows E2/E3, wired
   * on the host in E5). All optional so hand-rolled client doubles keep
   * compiling and the TS runtime answers `UNSUPPORTED`; the host adapter guards
   * presence + the `engineHiddenState` capability before use.
   *
   * `applyFilter` runs the predicate ONCE inside the engine and commits both
   * the rules and the rows they hid, resolving `{ ok: true, hiddenRows, … }` or
   * a structured `{ ok: false, code }` (never a thrown exception — a refusal
   * rides in the resolved value, `sortRange` convention). `reapplyFilter`
   * re-runs the ALREADY COMMITTED rules; `clearFilter` drops rules + rows.
   * `getFilter` is a WHOLE-SHEET read (rules + derived hidden rows outside the
   * viewport too). `hideRows`/`unhideRows` add/remove manual rows and resolve
   * whether anything changed; `listHiddenRows` reads the manual set.
   * `snapshot*`/`restore*` are the whole-workbook undo primitives (REPLACE
   * semantics: an empty payload CLEARS).
   */
  applyFilter?(
    sheet: number,
    rules: readonly ColumnFilterRuleWire[],
  ): Promise<FilterApplyResultWire>
  reapplyFilter?(sheet: number): Promise<FilterApplyResultWire>
  clearFilter?(sheet: number): Promise<FilterApplyResultWire>
  getFilter?(sheet: number): Promise<SheetFilterStateWire>
  hideRows?(sheet: number, rows: readonly number[]): Promise<boolean>
  unhideRows?(sheet: number, rows: readonly number[]): Promise<boolean>
  listHiddenRows?(sheet: number): Promise<number[]>
  snapshotHidden?(): Promise<HiddenRowsSnapshotWire>
  restoreHidden?(snapshot: HiddenRowsSnapshotWire): Promise<number>
  snapshotFilters?(): Promise<FilterSnapshotWire>
  restoreFilters?(snapshot: FilterSnapshotWire): Promise<number>
  beginImport(
    sessionIdOrOptions?: number | BeginImportOptionsWire,
    options?: BeginImportOptionsWire,
  ): Promise<number>
  importChunk(sessionId: number, cells: ImportCellWire[]): Promise<number>
  commitImport(sessionId: number): Promise<WorkbookImportStatsWire>
  cancelImport(sessionId: number): Promise<boolean>
  readCells(cells: CellRefWire[]): Promise<CellSnapshotWire[]>
  listNonEmpty(): Promise<CellRefWire[]>
  snapshotSparse(): Promise<SparseCellWire[]>
  snapshotRangeSparse(range: SparseRangeWire): Promise<SparseCellWire[]>
  beginSnapshotRangeSparse(
    range: SparseRangeWire,
    rowsPerChunk?: number,
  ): Promise<SparseRangeSnapshotSessionWire>
  nextSnapshotRangeSparseChunk(sessionId: number): Promise<SparseRangeSnapshotChunkWire>
  cancelSnapshot(sessionId: number): Promise<boolean>
  snapshotRangeSparseChunks(
    range: SparseRangeWire,
    rowsPerChunk?: number,
  ): Promise<SparseCellWire[][]>
  snapshotViewportSizes(range: SparseRangeWire): Promise<ViewportSizeSnapshotWire>
  setRowHeight(sheet: number, rowIndex: number, heightPx: number): Promise<boolean>
  setColumnWidth(sheet: number, colIndex: number, widthPx: number): Promise<boolean>
  snapshotPersistenceV1(): Promise<WorkbookPersistenceSnapshotWire>
  restorePersistenceV1(
    snapshot: WorkbookPersistenceSnapshotWire,
  ): Promise<WorkbookPersistenceRestoreStatsWire>
  exportRangeTsv(range: SparseRangeWire): Promise<string>
  beginExportRangeTsv(
    range: SparseRangeWire,
    rowsPerChunk?: number,
  ): Promise<ExportRangeTsvSessionWire>
  nextExportRangeTsvChunk(sessionId: number): Promise<ExportRangeTsvChunkWire>
  cancelExport(sessionId: number): Promise<boolean>
  consumeExportRangeTsvChunks?(
    range: SparseRangeWire,
    onChunk: ExportRangeTsvChunkConsumerWire,
    rowsPerChunk?: number,
  ): Promise<void>
  exportRangeTsvChunks(range: SparseRangeWire, rowsPerChunk?: number): Promise<string[]>
  restoreSparse(cells: SparseCellWire[]): Promise<number>
  readSparseRange(range: SparseRangeWire): Promise<CellSnapshotWire[]>
  /**
   * ADR 0006 阶段 3 —— 问「`addr` 这一格属不属于某个活动的动态数组」。
   * 不属于（含碰撞态 `#SPILL!` 锚点、普通格、空格）时解析为 `null`。
   *
   * 装饰性只读，不改任何状态、不 bump revision。WASM runtime 走 wasm-pkg 的
   * `spillAnchor` / `spillInfo` 两个导出；产物太老缺这两个导出时按本仓惯例
   * 报结构化 `WASM_METHOD_UNAVAILABLE`，不假装「这里没有数组」。
   */
  spillRegion(sheet: number, addr: string): Promise<SpillRegionWire | null>
  debugFormulaCacheState(sheet: number, addr: string): Promise<string>
  debugFormulaEvalCount(sheet: number): Promise<number>
  debugCounters(): Promise<WorkerWorkbookDebugCountersWire>
  subscribeCells(cells: CellRefWire[], callback: (cells: CellRefWire[]) => void): Promise<number>
  unsubscribeCells(subId: number): Promise<boolean>
  onCellsDirty(callback: (cells: CellRefWire[]) => void): () => void
  onCellsHydrated(callback: (cells: CellSnapshotWire[]) => void): () => void
  /**
   * Wave 8 — register a user-defined formula by sending the body source
   * to the worker, which `new Function('args', source)`s it and binds
   * the resulting callable to the WASM Workbook. Closure-capture hazards
   * are avoided by handing the worker a string body rather than a live
   * function (JS callbacks cannot cross `postMessage`). Wave 8.2:
   * `options.isAsync` compiles the body through the AsyncFunction
   * constructor; the worker pump settles Promise results back into the
   * engine and cells show `#BUSY!` while in flight.
   */
  registerCustomFormula(
    name: string,
    source: string,
    options?: { isAsync?: boolean },
  ): Promise<boolean>
  unregisterCustomFormula(name: string): Promise<boolean>
  /**
   * Wave F follow-up — register a workbook-level name binding inside the
   * worker engine. Currently implemented only by the TS worker runtime;
   * the WASM runtime returns an `UNSUPPORTED` error code via
   * `defineNameUnsupported` so the host adapter can fall back to a
   * cache-only registration (range / value still work via the existing
   * `setNamedRange` flow; lambda requires worker-side AST parsing).
   *
   * The binding wire shape mirrors `NameBinding` from `@einfach/excel-core-ts`
   * but keeps the lambda `body` as a **formula source string** since AST
   * objects do not survive `postMessage`. The worker parses the body into
   * an `Expr` before calling `workbook.defineName(...)`.
   */
  defineName(name: string, binding: NameBindingWire): Promise<boolean>
  undefineName(name: string): Promise<boolean>
  dispose(): void
}

/**
 * Wire-format `NameBinding`. The TS engine's in-process `NameBinding`
 * (see `excel/excel-core-ts/src/types.ts`) carries a parsed `Expr` for
 * lambda bodies; this wire variant carries the source string and the
 * worker runtime parses on receive.
 */
export type NameBindingWire =
  | { kind: 'range'; sheetName: string; start: string; end: string }
  | { kind: 'value'; literal: string }
  | { kind: 'lambda'; params: string[]; body: string }
