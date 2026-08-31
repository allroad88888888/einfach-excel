import type {
  BulkCellInput,
  BulkTypedCellInput,
  Cell,
  PrintConfigSnapshot,
  Workbook,
} from '@einfach/excel-core-ts'

import type { TsConditionalFormatConfigs } from '../worker-runtime-ts-conditional-format'
import type { WorkbookPersistenceSnapshotWire } from '../worker-protocol'
import type { RuntimeState, SheetEntry } from './runtime-state'

type WorkbookSeed = { wb: Workbook; sheets: SheetEntry[] }

export interface SheetLifecycleServices {
  makeWorkbook(names: ReadonlyArray<string>): WorkbookSeed
  assertSheet(state: RuntimeState, index: number): SheetEntry
  listSheets(state: RuntimeState): Array<{ idx: number; name: string }>
  preservePrintConfigs(
    workbook: Workbook,
    previous: readonly SheetEntry[],
    next: readonly SheetEntry[],
    removedIdx?: number,
  ): PrintConfigSnapshot[]
  restorePrintConfigs(workbook: Workbook, snapshots: readonly PrintConfigSnapshot[]): void
  preserveConditionalFormats(
    configs: TsConditionalFormatConfigs,
    previous: readonly SheetEntry[],
    next: readonly SheetEntry[],
    removedIdx?: number,
  ): TsConditionalFormatConfigs
  rebindCustomFormulas(state: RuntimeState): void
  resetViewportSizes(state: RuntimeState): void
  renameViewportSizesSheet(state: RuntimeState, oldName: string, newName: string): void
  removeViewportSizesSheet(state: RuntimeState, name: string): void
  validatePrintConfigRestore(
    sheets: readonly SheetEntry[],
    snapshots: WorkbookPersistenceSnapshotWire['printConfigs'],
  ): void
  restorePersistencePrintConfigs(
    workbook: Workbook,
    sheets: readonly SheetEntry[],
    snapshots: WorkbookPersistenceSnapshotWire['printConfigs'],
  ): number
  restoreConditionalFormats(
    sheets: readonly SheetEntry[],
    snapshots: WorkbookPersistenceSnapshotWire['conditionalFormats'],
  ): TsConditionalFormatConfigs
}

export interface SheetLifecycle {
  init(state: RuntimeState, names: ReadonlyArray<string>): Array<{ idx: number; name: string }>
  add(state: RuntimeState, name: string): number
  rename(state: RuntimeState, sheetIndex: number, name: string): boolean
  remove(state: RuntimeState, sheetIndex: number): boolean
  move(state: RuntimeState, from: number, to: number): boolean
  rebuildForRestore(
    state: RuntimeState,
    snapshot: WorkbookPersistenceSnapshotWire | undefined,
  ): { restoredConditionalFormats: number; restoredPrintConfigs: number }
}

export function createSheetLifecycle(services: SheetLifecycleServices): SheetLifecycle {
  function rebuildPreservingCells(
    state: RuntimeState,
    nextNames: ReadonlyArray<string>,
    removedIdx?: number,
  ): void {
    const previousSheets = state.sheets
    const previousWorkbook = state.workbook
    const cellsBySheetName = new Map<string, ReadonlyMap<string, Cell>>()
    const cellsBySheetIndex = new Map<number, ReadonlyMap<string, Cell>>()
    for (const sheet of previousSheets) {
      if (sheet.idx === removedIdx) continue
      const handle = previousWorkbook.sheet(sheet.id)
      if (!handle) continue
      const cells = previousWorkbook.store.getter(handle.sheetAtom)
      cellsBySheetName.set(sheet.name, cells)
      cellsBySheetIndex.set(sheet.idx, cells)
    }

    const { wb, sheets } = services.makeWorkbook(nextNames)
    const printConfigs = services.preservePrintConfigs(
      previousWorkbook,
      previousSheets,
      sheets,
      removedIdx,
    )
    const conditionalFormats = services.preserveConditionalFormats(
      state.conditionalFormatsBySheetId,
      previousSheets,
      sheets,
      removedIdx,
    )
    services.restorePrintConfigs(wb, printConfigs)
    state.workbook = wb
    state.sheets = sheets
    state.conditionalFormatsBySheetId = conditionalFormats

    for (const newSheet of sheets) {
      const oldCells = cellsBySheetName.get(newSheet.name) ?? cellsBySheetIndex.get(newSheet.idx)
      if (!oldCells?.size) continue
      const inputs: (BulkCellInput | BulkTypedCellInput)[] = []
      for (const [key, cell] of oldCells) {
        const [row, col] = key.split(':').map(Number)
        inputs.push(cell.ast ? { row, col, input: cell.input } : { row, col, value: cell.value })
      }
      state.workbook.bulkApply(newSheet.id, inputs)
    }

    state.importSessions = new Map()
    state.snapshotSessions = new Map()
    services.rebindCustomFormulas(state)
  }

  return {
    init(state, names) {
      const { wb, sheets } = services.makeWorkbook(names)
      state.workbook = wb
      state.sheets = sheets
      state.customFormulas = new Map()
      services.resetViewportSizes(state)
      state.conditionalFormatsBySheetId = new Map()
      state.importSessions = new Map()
      state.nextImportSessionId = 1
      state.snapshotSessions = new Map()
      state.nextSnapshotSessionId = 1
      return services.listSheets(state)
    },

    add(state, name) {
      const index = state.sheets.length
      rebuildPreservingCells(state, [...state.sheets.map((sheet) => sheet.name), name])
      return index
    },

    rename(state, sheetIndex, name) {
      const sheet = services.assertSheet(state, sheetIndex)
      const nextName = name.trim()
      if (!nextName) return false
      const names = state.sheets.map((entry) => (entry.idx === sheet.idx ? nextName : entry.name))
      rebuildPreservingCells(state, names)
      services.renameViewportSizesSheet(state, sheet.name, nextName)
      return true
    },

    remove(state, sheetIndex) {
      const sheet = services.assertSheet(state, sheetIndex)
      if (state.sheets.length <= 1) return false
      const names = state.sheets
        .filter((entry) => entry.idx !== sheet.idx)
        .map((entry) => entry.name)
      rebuildPreservingCells(state, names, sheet.idx)
      services.removeViewportSizesSheet(state, sheet.name)
      return true
    },

    move(state, from, to) {
      services.assertSheet(state, from)
      services.assertSheet(state, to)
      if (from === to) return true
      const names = state.sheets.map((sheet) => sheet.name)
      const [moved] = names.splice(from, 1)
      names.splice(to, 0, moved)
      rebuildPreservingCells(state, names)
      return true
    },

    rebuildForRestore(state, snapshot) {
      const names = snapshot?.sheets?.map((sheet) => sheet.name) ?? ['Sheet1']
      const { wb, sheets } = services.makeWorkbook(names)
      services.validatePrintConfigRestore(sheets, snapshot?.printConfigs)
      const restoredPrintConfigs = services.restorePersistencePrintConfigs(
        wb,
        sheets,
        snapshot?.printConfigs,
      )
      const conditionalFormats = services.restoreConditionalFormats(
        sheets,
        snapshot?.conditionalFormats,
      )
      const customFormulas = state.customFormulas
      state.workbook = wb
      state.sheets = sheets
      state.customFormulas = customFormulas
      services.resetViewportSizes(state)
      state.conditionalFormatsBySheetId = conditionalFormats
      state.importSessions = new Map()
      state.snapshotSessions = new Map()
      state.nextSnapshotSessionId = 1
      services.rebindCustomFormulas(state)
      return {
        restoredConditionalFormats: conditionalFormats.size,
        restoredPrintConfigs,
      }
    },
  }
}
