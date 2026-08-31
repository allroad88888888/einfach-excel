// 一句话：TS Worker 的引擎打印配置 wire 转换与工作簿重建迁移。

import {
  PrintConfigRegistry,
  readWorkbookPrintConfig,
  restoreWorkbookPrintConfigs,
  setWorkbookPrintConfig,
  snapshotWorkbookPrintConfigs,
  type PrintConfigSnapshot,
  type Workbook,
} from '@einfach/excel-core-ts'
import type { PrintConfigSnapshotWire } from './worker-protocol'

export interface PrintConfigSheet {
  id: string
  idx: number
  name: string
}

export function readTsWorkerPrintConfig(
  workbook: Workbook,
  sheet: PrintConfigSheet,
): PrintConfigSnapshotWire {
  return toWire(sheet.idx, readWorkbookPrintConfig(workbook, sheet.id))
}

export function setTsWorkerPrintConfig(
  workbook: Workbook,
  sheet: PrintConfigSheet,
  config: PrintConfigSnapshotWire['config'],
): PrintConfigSnapshotWire {
  return toWire(sheet.idx, setWorkbookPrintConfig(workbook, sheet.id, config))
}

export function snapshotTsWorkerPrintConfigs(
  workbook: Workbook,
  sheets: readonly PrintConfigSheet[],
): PrintConfigSnapshotWire[] {
  const indexBySheetId = new Map(sheets.map((sheet) => [sheet.id, sheet.idx]))
  return snapshotWorkbookPrintConfigs(workbook).map((snapshot) => {
    const index = indexBySheetId.get(snapshot.sheetId)
    if (index === undefined)
      throw new Error(`missing print configuration sheet: ${snapshot.sheetId}`)
    return toWire(index, snapshot)
  })
}

/** Validates a persisted wire block before its replacement workbook is installed. */
export function restoreTsWorkerPrintConfigs(
  workbook: Workbook,
  sheets: readonly PrintConfigSheet[],
  snapshots: readonly PrintConfigSnapshotWire[] | undefined,
): number {
  const restored = mapWireSnapshots(sheets, snapshots)
  restoreWorkbookPrintConfigs(workbook, restored)
  return restored.length
}

/** Carries semantic config through a TS-core structural rebuild. */
export function preserveTsWorkerPrintConfigs(
  previousWorkbook: Workbook,
  previousSheets: readonly PrintConfigSheet[],
  nextSheets: readonly PrintConfigSheet[],
  removedIdx?: number,
): PrintConfigSnapshot[] {
  const byId = new Map(
    snapshotWorkbookPrintConfigs(previousWorkbook).map((item) => [item.sheetId, item]),
  )
  const priorByName = new Map(previousSheets.map((sheet) => [sheet.name, sheet]))
  return nextSheets.flatMap((next) => {
    const named = priorByName.get(next.name)
    const positional = previousSheets[next.idx]
    const source = named ?? positional
    if (!source || source.idx === removedIdx) return []
    const snapshot = byId.get(source.id)
    return snapshot === undefined ? [] : [{ ...snapshot, sheetId: next.id }]
  })
}

/** Validates a pending restore independently, so a bad payload cannot half-swap runtime state. */
export function validateTsWorkerPrintConfigRestore(
  sheets: readonly PrintConfigSheet[],
  snapshots: readonly PrintConfigSnapshotWire[] | undefined,
): void {
  const restored = mapWireSnapshots(sheets, snapshots)
  new PrintConfigRegistry(
    sheets.map((sheet) => sheet.id),
    restored,
  )
}

function mapWireSnapshots(
  sheets: readonly PrintConfigSheet[],
  snapshots: readonly PrintConfigSnapshotWire[] | undefined,
): PrintConfigSnapshot[] {
  const seen = new Set<number>()
  return (snapshots ?? []).map((snapshot) => {
    if (
      !Number.isSafeInteger(snapshot.sheet) ||
      snapshot.sheet < 0 ||
      snapshot.sheet >= sheets.length
    ) {
      throw new Error(`invalid print configuration sheet index: ${snapshot.sheet}`)
    }
    if (seen.has(snapshot.sheet))
      throw new Error(`duplicate print configuration sheet: ${snapshot.sheet}`)
    seen.add(snapshot.sheet)
    const sheet = sheets[snapshot.sheet]
    return { sheetId: sheet.id, revision: snapshot.revision, config: snapshot.config }
  })
}

function toWire(sheet: number, snapshot: PrintConfigSnapshot): PrintConfigSnapshotWire {
  return { sheet, revision: snapshot.revision, config: snapshot.config }
}
