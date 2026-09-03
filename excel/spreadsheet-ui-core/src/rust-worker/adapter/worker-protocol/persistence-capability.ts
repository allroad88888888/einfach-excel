import type { ConditionalFormatRule, ConditionalFormatRuleEntry } from '../../../index'
import type { FormatRangeSnapshot } from './format'
import type { SparseCellWire, ViewportSizeSnapshotWire } from './cell-range'

/**
 * 表元数据 = 表身份，**仅此而已**。两个 runtime 都只发 `{ idx, name }`，
 * 两边的 restore 也只读这两个字段（按 idx 校验连续、按 name 建表）。
 *
 * 这里曾经还有 `rowCount?` / `colCount?`：只有 WASM 引擎填（扫全表求稀疏边界），
 * TS 引擎不填，整个代码库没有一处读。纯写不读的字段唯一的作用是让两个引擎的快照
 * 永远无法逐字相等 —— 它把 scale-parity P5 的形状断言逼成了子集比对。
 * 2026-08-01 删除，P5 随之升级为 sheets 全等。
 */
export interface WorkbookPersistenceSheetWire {
  idx: number
  name: string
}

export interface PrintAreaWire {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

export type PrintScaleWire =
  | { kind: 'percent'; percent: number }
  | { kind: 'fit'; pagesWide?: number; pagesTall?: number }

export interface PrintManualPageBreakWire {
  axis: 'row' | 'column'
  index: number
}

export interface PrintHeaderFooterWire {
  left?: string
  center?: string
  right?: string
}

/** Detached engine snapshot keyed by runtime sheet index. */
export interface PrintConfigSnapshotWire {
  sheet: number
  revision: number
  config: {
    printArea?: PrintAreaWire
    manualPageBreaks: PrintManualPageBreakWire[]
    scale: PrintScaleWire
    orientation: 'portrait' | 'landscape'
    header?: PrintHeaderFooterWire
    footer?: PrintHeaderFooterWire
  }
}

/** Engine-owned conditional-format configuration for one runtime sheet. */
export interface ConditionalFormatConfigSnapshotWire {
  sheet: number
  revision: number
  rules: ConditionalFormatRuleEntry[]
}

/** Mutation witness carried over the worker boundary. */
export interface SetConditionalFormatRuleWire {
  requestId: number
  revision: number
  ruleId?: string
  scope: ConditionalFormatRuleEntry['scope']
  priority?: number
  rule: ConditionalFormatRule
}

/** Removal witness carried over the worker boundary. */
export interface RemoveConditionalFormatRuleWire {
  requestId: number
  revision: number
  ruleId: string
}

export interface WorkbookPersistenceSnapshotWire {
  version: 1
  sheets: WorkbookPersistenceSheetWire[]
  cells: SparseCellWire[]
  formats?: FormatRangeSnapshot[]
  sizes?: ViewportSizeSnapshotWire[]
  /** Optional for backward-compatible schema-v1 restore. */
  printConfigs?: PrintConfigSnapshotWire[]
  /** Optional for backward-compatible schema-v1 restore. */
  conditionalFormats?: ConditionalFormatConfigSnapshotWire[]
}

export interface WorkbookPersistenceRestoreStatsWire {
  restored_cells: number
  restored_formats: number
  sheets: number
  restored_print_configs?: number
  restored_conditional_formats?: number
}

/**
 * Fail-closed capability witness — a worker runtime's own declaration of
 * which optional command families it REALLY implements. The host adapter
 * requests it right after `initWorkbook` via the `describeCapabilities`
 * command.
 *
 * Semantics:
 *  - A runtime that does not understand the command answers
 *    `UNKNOWN_COMMAND`; the client maps that to `null` ("no claims") and
 *    the adapter keeps the legacy full-trust contract.
 *  - A full witness MUST tell the truth: any family declared `false`
 *    makes the adapter withhold the corresponding optional
 *    `SpreadsheetBackend` port, which hides the UI entry through the
 *    existing degradation contract.
 *  - A scoped AutoFill witness gates only AutoFill. It deliberately leaves
 *    every older family on the legacy contract instead of pretending that
 *    an incomplete object is a full capability declaration.
 *  - Commands in a family declared `false` answer a structured
 *    `UNSUPPORTED` RPC error instead of a success-shaped fake ACK.
 */
export interface WorkerRuntimeCapabilitiesWire {
  /** insertRows / deleteRows / insertColumns / deleteColumns really shift bands. */
  structuralEdits: boolean
  /** setFormatRange really persists formats. */
  formats: boolean
  /** snapshotFormatRange / restoreFormatSnapshot are backed by real format state. */
  formatSnapshots: boolean
  /** beginExportRangeTsv / nextExportRangeTsvChunk stream real TSV chunks. */
  tsvChunkExport: boolean
  /** persistence v1 snapshots round-trip the `formats` block. */
  persistenceFormats: boolean
  /** applyAutoFill performs one native, preflighted value/formula/format transaction. */
  autoFill: boolean
  /** sortRange physically reorders workbook data (engine physical sort). */
  sortRange: boolean
  /**
   * setEvalHiddenRows really pushes a hidden-row eval input the engine's
   * SUBTOTAL 101-111 variants consume (parity #23). The TS runtime has no
   * such model and declares this `false`; the WASM runtime's null witness
   * keeps the family trusted.
   */
  evalHiddenRows: boolean
  /**
   * setEvalFilterHiddenRows really pushes the FILTER-hidden row set the
   * engine's SUBTOTAL 1-11 AND 101-111 variants consume
   * (`design-filter-hidden-rows` §6.5). Additive twin of `evalHiddenRows`,
   * declared separately because the two sets are independently addressable —
   * a runtime can have one without the other. The TS runtime has neither and
   * declares this `false`; the WASM runtime's null witness keeps the family
   * trusted (and a wasm-pkg predating the export degrades at dispatch, see
   * `setEvalFilterHiddenRows` on the client).
   */
  evalFilterHiddenRows: boolean
  /**
   * createTable / renameTable / renameTableColumn / deleteTable /
   * listTables / getTable are backed by a real engine Table registry
   * (Excel Table CRUD — #32). The TS runtime has no Table model and
   * declares this `false`; the WASM runtime's null witness keeps the
   * family trusted.
   */
  structuredTables: boolean
  /**
   * The engine OWNS hidden rows + filter (design-engine-hidden-rows E2/E3) and
   * exposes the caller surface: `applyFilter` / `reapplyFilter` / `clearFilter`
   * / `getFilter` / `hideRows` / `unhideRows` / `listHiddenRows` plus the
   * snapshot/restore undo primitives. The host adapter routes `setFilterSort`
   * and `readSheetHiddenState` through these ports. The TS runtime has no such
   * engine and declares this `false`, so the adapter withholds `setFilterSort`
   * and `readSheetHiddenState` (fail-closed — filter hides its UI entry rather
   * than the host faking a scan the engine cannot do). The WASM runtime's null
   * witness keeps the family trusted.
   */
  engineHiddenState: boolean
}

/**
 * Narrow witness emitted by a runtime that only participates in the
 * native AutoFill handshake. The discriminator keeps this from becoming
 * an undocumented `Partial<WorkerRuntimeCapabilitiesWire>` contract.
 */
export interface WorkerAutoFillCapabilityWitnessWire
  extends Pick<WorkerRuntimeCapabilitiesWire, 'autoFill'> {
  scope: 'auto-fill'
}

export type WorkerRuntimeCapabilitiesResponseWire =
  | WorkerRuntimeCapabilitiesWire
  | WorkerAutoFillCapabilityWitnessWire

export interface WorkerWorkbookSheetDebugCountersWire {
  idx: number
  name: string
  formulaCount: number
  formulaEvalCount: number
  liveSubscriptionCount: number
}

export interface WorkerWorkbookDebugCountersWire {
  sheetCount: number
  crossSheetDependents: number
  formulaCount: number
  formulaEvalCountTotal: number
  liveSubscriptionCount: number
  workerSubscriptionCount: number
  importSessionCount: number
  exportSessionCount: number
  snapshotSessionCount: number
  sheets: WorkerWorkbookSheetDebugCountersWire[]
}
