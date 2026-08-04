import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import { snapshotCell } from './worker-cell-ops'
import type { WorkerCommandHandler } from './worker-command'
import type { ImportSession } from './worker-import-normalize'
import { postDirty, postHydrated, postResponse } from './worker-post'
import type { ExportSession, SnapshotSession } from './worker-range-stream'
import { assertSheet, normalizeAddr } from './worker-wire-guards'
import type { CellRefWire } from './worker-protocol'

/**
 * worker 侧那些**按 sheet 索引存活**的句柄：导入/导出/快照会话，以及活的单元格
 * 订阅。它们共用一条失效规则，所以住在一起 —— 见 `invalidateSheetIndexedHandles`。
 */

const subscriptionTokens = new Map<number, number[]>()

export const importSessions = new Map<number, ImportSession>()
export const exportSessions = new Map<number, ExportSession>()
export const snapshotSessions = new Map<number, SnapshotSession>()

let nextExportId = 1
let nextSnapshotId = 1

export function allocateExportSessionId(): number {
  return nextExportId++
}

export function allocateSnapshotSessionId(): number {
  return nextSnapshotId++
}

export function sessionHandleCounts() {
  return {
    subscriptions: subscriptionTokens.size,
    imports: importSessions.size,
    exports: exportSessions.size,
    snapshots: snapshotSessions.size,
  }
}

export function assertImportSessionId(sessionId: number) {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw Object.assign(new Error(`invalid import session: ${sessionId}`), {
      code: 'INVALID_IMPORT_SESSION',
    })
  }
}

export function assertExportSessionId(sessionId: number) {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw Object.assign(new Error(`invalid export session: ${sessionId}`), {
      code: 'INVALID_EXPORT_SESSION',
    })
  }
}

export function assertSnapshotSessionId(sessionId: number) {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw Object.assign(new Error(`invalid snapshot session: ${sessionId}`), {
      code: 'INVALID_SNAPSHOT_SESSION',
    })
  }
}

export function resetSubscriptions(wb?: WasmWorkbookRuntime) {
  if (wb?.unsubscribe_cell) {
    for (const tokens of subscriptionTokens.values()) {
      for (const token of tokens) wb.unsubscribe_cell(token)
    }
  }
  subscriptionTokens.clear()
}

/**
 * Audit D-6: import/export/snapshot sessions and live cell
 * subscriptions all hold SHEET INDICES captured at begin/subscribe
 * time. `removeSheet` / `moveSheet` shift those indices, so a
 * surviving session would read or write the WRONG sheet in later
 * chunks and a surviving subscription would post dirty events with a
 * stale index. Drop them: the next session RPC fails loudly with
 * IMPORT_SESSION_MISSING / EXPORT_SESSION_MISSING /
 * SNAPSHOT_SESSION_MISSING and hosts re-subscribe against the new
 * layout. The id counters keep counting up so a stale id can never
 * collide with a new session. `addSheet` (appends) and `renameSheet`
 * (names only) keep existing indices stable and deliberately do NOT
 * invalidate.
 */
export function invalidateSheetIndexedHandles(wb: WasmWorkbookRuntime) {
  resetSubscriptions(wb)
  importSessions.clear()
  exportSessions.clear()
  snapshotSessions.clear()
}

/**
 * 同上，外加把 id 计数归零 —— 只用于工作簿被整体换掉的两条路径
 * （`initWorkbook` / `restorePersistenceV1`），此时旧 id 不可能再被引用。
 */
export function resetSessionHandles(wb?: WasmWorkbookRuntime) {
  resetSubscriptions(wb)
  importSessions.clear()
  exportSessions.clear()
  snapshotSessions.clear()
  nextExportId = 1
  nextSnapshotId = 1
}

export function subscribeCells(wb: WasmWorkbookRuntime, subId: number, cells: CellRefWire[]) {
  if (!wb.subscribe_cell) {
    throw Object.assign(new Error('WasmWorkbook.subscribe_cell is not available'), {
      code: 'SUBSCRIBE_UNAVAILABLE',
    })
  }
  const tokens: number[] = []
  for (const ref of cells) {
    assertSheet(wb, ref.sheet)
    const sheetName = wb.sheet_name(ref.sheet)
    const addr = normalizeAddr(ref.addr)
    const token = wb.subscribe_cell(sheetName, addr, () => postDirty([{ sheet: ref.sheet, addr }]))
    tokens.push(token)
  }
  subscriptionTokens.set(subId, tokens)
  postHydrated(
    cells.map((cell) => snapshotCell(wb, cell)),
    subId,
  )
}

export function unsubscribeCells(wb: WasmWorkbookRuntime, subId: number) {
  const tokens = subscriptionTokens.get(subId) ?? []
  if (wb.unsubscribe_cell) {
    for (const token of tokens) wb.unsubscribe_cell(token)
  }
  subscriptionTokens.delete(subId)
}

/** 订阅这两条命令的 RPC 入口 —— 句柄归本模块所有，入口就留在本模块。 */
export const handleSubscriptionCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'subscribeCells':
      subscribeCells(
        wb,
        Number(msg.subId),
        Array.isArray(msg.cells) ? (msg.cells as CellRefWire[]) : [],
      )
      postResponse(id, true)
      return true
    case 'unsubscribeCells':
      unsubscribeCells(wb, Number(msg.subId))
      postResponse(id, true)
      return true
    default:
      return false
  }
}
