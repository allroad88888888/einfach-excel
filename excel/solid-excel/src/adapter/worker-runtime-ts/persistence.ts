import type { ViewportSizeSnapshotWire, WorkbookPersistenceSnapshotWire } from '../worker-protocol'
import { snapshotTsWorkerConditionalFormats } from '../worker-runtime-ts-conditional-format'
import { snapshotTsWorkerPrintConfigs } from '../worker-runtime-ts-print-config'
import { importCells, sparseCellsToImport } from './import-session'
import { snapshotSparse } from './range-projection'
import type { RuntimeState } from './runtime-state'
import { unsupported } from './runtime-errors'

export interface PersistenceRestoreResult {
  restoredConditionalFormats: number
  restoredPrintConfigs: number
}

export interface PersistenceServices {
  snapshotSizes(state: RuntimeState): ViewportSizeSnapshotWire[]
  rebuildForRestore(
    state: RuntimeState,
    snapshot: WorkbookPersistenceSnapshotWire | undefined,
  ): PersistenceRestoreResult
  restoreSizes(
    state: RuntimeState,
    snapshot: Pick<WorkbookPersistenceSnapshotWire, 'sizes'> | undefined,
  ): void
}

export function snapshotPersistence(
  state: RuntimeState,
  services: PersistenceServices,
): WorkbookPersistenceSnapshotWire {
  return {
    version: 1,
    sheets: state.sheets.map((sheet) => ({ idx: sheet.idx, name: sheet.name })),
    cells: snapshotSparse(state),
    sizes: services.snapshotSizes(state),
    printConfigs: snapshotTsWorkerPrintConfigs(state.workbook, state.sheets),
    conditionalFormats: snapshotTsWorkerConditionalFormats(
      state.conditionalFormatsBySheetId,
      state.sheets,
    ),
  }
}

export function restorePersistence(
  state: RuntimeState,
  snapshot: WorkbookPersistenceSnapshotWire | undefined,
  services: PersistenceServices,
) {
  if ((snapshot?.formats?.length ?? 0) > 0) {
    return unsupported('restorePersistenceV1 with a formats block (persistence formats)')
  }
  const restored = services.rebuildForRestore(state, snapshot)
  const cells = sparseCellsToImport(snapshot?.cells ?? [])
  importCells(state, cells)
  services.restoreSizes(state, snapshot)
  return {
    restored_cells: cells.length,
    restored_formats: 0,
    restored_conditional_formats: restored.restoredConditionalFormats,
    sheets: state.sheets.length,
    restored_print_configs: restored.restoredPrintConfigs,
  }
}
