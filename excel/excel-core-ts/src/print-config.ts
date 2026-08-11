import type { CellRange } from './types'
import type { Workbook } from './workbook'

export type PrintOrientation = 'portrait' | 'landscape'

export type PrintScale =
  | { kind: 'percent'; percent: number }
  | { kind: 'fit'; pagesWide?: number; pagesTall?: number }

export interface ManualPageBreak {
  axis: 'row' | 'column'
  index: number
}

export interface HeaderFooterFields {
  left?: string
  center?: string
  right?: string
}

export interface PrintConfig {
  printArea?: CellRange
  manualPageBreaks: ManualPageBreak[]
  scale: PrintScale
  orientation: PrintOrientation
  header?: HeaderFooterFields
  footer?: HeaderFooterFields
}

export interface PrintConfigSnapshot {
  sheetId: string
  revision: number
  config: PrintConfig
}

interface StoredPrintConfig {
  revision: number
  config: PrintConfig
}

export const DEFAULT_PRINT_CONFIG = Object.freeze<PrintConfig>({
  manualPageBreaks: [],
  scale: { kind: 'percent', percent: 100 },
  orientation: 'portrait',
})

/** Workbook-owned print state. Every public boundary receives a detached copy. */
export class PrintConfigRegistry {
  private readonly bySheetId = new Map<string, StoredPrintConfig>()

  constructor(sheetIds: ReadonlyArray<string>, snapshots: ReadonlyArray<PrintConfigSnapshot> = []) {
    for (const sheetId of sheetIds)
      this.bySheetId.set(sheetId, { revision: 0, config: cloneConfig(DEFAULT_PRINT_CONFIG) })
    this.restore(snapshots)
  }

  read(sheetId: string): PrintConfigSnapshot {
    const stored = this.require(sheetId)
    return { sheetId, revision: stored.revision, config: cloneConfig(stored.config) }
  }

  addSheet(sheetId: string): void {
    if (this.bySheetId.has(sheetId)) throw new Error(`duplicate sheet: ${sheetId}`)
    this.bySheetId.set(sheetId, { revision: 0, config: cloneConfig(DEFAULT_PRINT_CONFIG) })
  }

  removeSheet(sheetId: string): void {
    if (!this.bySheetId.delete(sheetId)) throw new Error(`unknown sheet: ${sheetId}`)
  }

  write(sheetId: string, config: PrintConfig): PrintConfigSnapshot {
    const stored = this.require(sheetId)
    const next = validateAndCloneConfig(config)
    if (!sameConfig(stored.config, next)) {
      stored.config = next
      stored.revision += 1
    }
    return this.read(sheetId)
  }

  snapshot(): PrintConfigSnapshot[] {
    return [...this.bySheetId.keys()].map((sheetId) => this.read(sheetId))
  }

  restore(snapshots: ReadonlyArray<PrintConfigSnapshot>): void {
    const restored = validateSnapshots(this.bySheetId, snapshots)
    for (const [sheetId, stored] of this.bySheetId) {
      stored.revision = 0
      stored.config = cloneConfig(DEFAULT_PRINT_CONFIG)
      this.bySheetId.set(sheetId, stored)
    }
    for (const snapshot of restored) {
      this.bySheetId.set(snapshot.sheetId, snapshot)
    }
  }

  private require(sheetId: string): StoredPrintConfig {
    const stored = this.bySheetId.get(sheetId)
    if (!stored) throw new Error(`unknown sheet: ${sheetId}`)
    return stored
  }
}

const workbookPrintConfigs = new WeakMap<Workbook, PrintConfigRegistry>()

function registryFor(workbook: Workbook): PrintConfigRegistry {
  let registry = workbookPrintConfigs.get(workbook)
  if (!registry) {
    registry = new PrintConfigRegistry(workbook.sheets.map((sheet) => sheet.id))
    workbookPrintConfigs.set(workbook, registry)
  }
  return registry
}

/** Core-owned semantic state associated with one workbook handle. */
export function readWorkbookPrintConfig(workbook: Workbook, sheetId: string): PrintConfigSnapshot {
  return registryFor(workbook).read(sheetId)
}

/** Core-owned semantic mutation associated with one workbook handle. */
export function setWorkbookPrintConfig(
  workbook: Workbook,
  sheetId: string,
  config: PrintConfig,
): PrintConfigSnapshot {
  return registryFor(workbook).write(sheetId, config)
}

/** Detached persistence view; callers cannot retain core-owned config references. */
export function snapshotWorkbookPrintConfigs(workbook: Workbook): PrintConfigSnapshot[] {
  return registryFor(workbook).snapshot()
}

/** Replaces a workbook's print state after a validated persistence import. */
export function restoreWorkbookPrintConfigs(
  workbook: Workbook,
  snapshots: ReadonlyArray<PrintConfigSnapshot>,
): void {
  registryFor(workbook).restore(snapshots)
}

export function cloneConfig(config: PrintConfig): PrintConfig {
  return {
    orientation: config.orientation,
    scale:
      config.scale.kind === 'percent'
        ? { kind: 'percent', percent: config.scale.percent }
        : {
            kind: 'fit',
            ...(config.scale.pagesWide === undefined ? {} : { pagesWide: config.scale.pagesWide }),
            ...(config.scale.pagesTall === undefined ? {} : { pagesTall: config.scale.pagesTall }),
          },
    manualPageBreaks: config.manualPageBreaks.map((pageBreak) => ({ ...pageBreak })),
    ...(config.printArea === undefined ? {} : { printArea: { ...config.printArea } }),
    ...(config.header === undefined ? {} : { header: { ...config.header } }),
    ...(config.footer === undefined ? {} : { footer: { ...config.footer } }),
  }
}

export function validateAndCloneConfig(config: PrintConfig): PrintConfig {
  if (config.orientation !== 'portrait' && config.orientation !== 'landscape') {
    throw new Error('print orientation must be portrait or landscape')
  }
  if (config.scale.kind === 'percent') {
    if (!Number.isFinite(config.scale.percent) || config.scale.percent <= 0) {
      throw new Error('print percent scale must be positive')
    }
  } else if (
    config.scale.kind !== 'fit' ||
    !validOptionalPageCount(config.scale.pagesWide) ||
    !validOptionalPageCount(config.scale.pagesTall)
  ) {
    throw new Error('print fit scale must use positive integer page counts')
  }
  for (const pageBreak of config.manualPageBreaks) {
    if (
      (pageBreak.axis !== 'row' && pageBreak.axis !== 'column') ||
      !Number.isSafeInteger(pageBreak.index) ||
      pageBreak.index < 0
    ) {
      throw new Error('print page breaks must use a non-negative integer axis index')
    }
  }
  validateRange(config.printArea)
  validateHeaderFooter(config.header)
  validateHeaderFooter(config.footer)
  return cloneConfig(config)
}

function validOptionalPageCount(value: number | undefined): boolean {
  return value === undefined || (Number.isSafeInteger(value) && value >= 1)
}

function validateRange(range: CellRange | undefined): void {
  if (range === undefined) return
  if (
    !Number.isSafeInteger(range.rowStart) ||
    !Number.isSafeInteger(range.rowEnd) ||
    !Number.isSafeInteger(range.colStart) ||
    !Number.isSafeInteger(range.colEnd) ||
    range.rowStart < 0 ||
    range.colStart < 0 ||
    range.rowEnd < range.rowStart ||
    range.colEnd < range.colStart
  ) {
    throw new Error('print area must be a non-negative normalized range')
  }
}

function validateHeaderFooter(value: HeaderFooterFields | undefined): void {
  if (value === undefined) return
  for (const field of [value.left, value.center, value.right]) {
    if (field !== undefined && typeof field !== 'string')
      throw new Error('print header/footer must be text')
  }
}

function sameConfig(left: PrintConfig, right: PrintConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateSnapshots(
  bySheetId: ReadonlyMap<string, StoredPrintConfig>,
  snapshots: ReadonlyArray<PrintConfigSnapshot>,
): Array<PrintConfigSnapshot & StoredPrintConfig> {
  const seen = new Set<string>()
  return snapshots.map((snapshot) => {
    if (!bySheetId.has(snapshot.sheetId)) {
      throw new Error(`unknown sheet in print configuration restore: ${snapshot.sheetId}`)
    }
    if (seen.has(snapshot.sheetId)) {
      throw new Error(`duplicate print configuration restore: ${snapshot.sheetId}`)
    }
    seen.add(snapshot.sheetId)
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
      throw new Error(`invalid print configuration revision for sheet: ${snapshot.sheetId}`)
    }
    return {
      sheetId: snapshot.sheetId,
      revision: snapshot.revision,
      config: validateAndCloneConfig(snapshot.config),
    }
  })
}
