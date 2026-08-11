import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import { snapshotCell } from './worker-cell-ops'
import type { WorkerCommandHandler } from './worker-command'
import type { ImportSession } from './worker-import-normalize'
import { postDirty, postHydrated, postResponse } from './worker-post'
import type { ExportSession, SnapshotSession } from './worker-range-stream'
import { assertSheet, normalizeAddr } from './worker-wire-guards'
import type { CellRefWire } from './worker-protocol'

/**
 * worker 侧那些按 sheet 索引存活的句柄：导入/导出/快照会话，以及活的单元格订阅。
 *
 * 这些不是产品状态；它们只保存 worker/WASM 资源。一个实例必须只挂在一个
 * workbook runtime 上，不能以模块单例在多个 runtime 之间复用。
 */

export type WorkerSessionHandleRegistry = {
  readonly importSessions: Map<number, ImportSession>
  readonly exportSessions: Map<number, ExportSession>
  readonly snapshotSessions: Map<number, SnapshotSession>
  allocateExportSessionId(): number
  allocateSnapshotSessionId(): number
  sessionHandleCounts(): {
    subscriptions: number
    imports: number
    exports: number
    snapshots: number
  }
  invalidateSheetIndexedHandles(wb: WasmWorkbookRuntime): void
  resetSessionHandles(wb?: WasmWorkbookRuntime): void
  handleSubscriptionCommand: WorkerCommandHandler
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

export function createWorkerSessionHandleRegistry(): WorkerSessionHandleRegistry {
  const subscriptionTokens = new Map<number, number[]>()
  const importSessions = new Map<number, ImportSession>()
  const exportSessions = new Map<number, ExportSession>()
  const snapshotSessions = new Map<number, SnapshotSession>()
  let nextExportId = 1
  let nextSnapshotId = 1

  function resetSubscriptions(wb?: WasmWorkbookRuntime) {
    if (wb?.unsubscribe_cell) {
      for (const tokens of subscriptionTokens.values()) {
        for (const token of tokens) wb.unsubscribe_cell(token)
      }
    }
    subscriptionTokens.clear()
  }

  function unsubscribeCells(wb: WasmWorkbookRuntime, subId: number) {
    const tokens = subscriptionTokens.get(subId) ?? []
    if (wb.unsubscribe_cell) {
      for (const token of tokens) wb.unsubscribe_cell(token)
    }
    subscriptionTokens.delete(subId)
  }

  function subscribeCells(wb: WasmWorkbookRuntime, subId: number, cells: CellRefWire[]) {
    if (!wb.subscribe_cell) {
      throw Object.assign(new Error('WasmWorkbook.subscribe_cell is not available'), {
        code: 'SUBSCRIBE_UNAVAILABLE',
      })
    }
    // A caller retrying a subscription id must not orphan the old WASM tokens.
    unsubscribeCells(wb, subId)
    const tokens: number[] = []
    try {
      for (const ref of cells) {
        assertSheet(wb, ref.sheet)
        const sheetName = wb.sheet_name(ref.sheet)
        const addr = normalizeAddr(ref.addr)
        const token = wb.subscribe_cell(sheetName, addr, () =>
          postDirty([{ sheet: ref.sheet, addr }]),
        )
        tokens.push(token)
      }
    } catch (error) {
      if (wb.unsubscribe_cell) {
        for (const token of tokens) wb.unsubscribe_cell(token)
      }
      throw error
    }
    subscriptionTokens.set(subId, tokens)
    postHydrated(
      cells.map((cell) => snapshotCell(wb, cell)),
      subId,
    )
  }

  function invalidateSheetIndexedHandles(wb: WasmWorkbookRuntime) {
    resetSubscriptions(wb)
    importSessions.clear()
    exportSessions.clear()
    snapshotSessions.clear()
  }

  function resetSessionHandles(wb?: WasmWorkbookRuntime) {
    resetSubscriptions(wb)
    importSessions.clear()
    exportSessions.clear()
    snapshotSessions.clear()
    nextExportId = 1
    nextSnapshotId = 1
  }

  const handleSubscriptionCommand: WorkerCommandHandler = (id, msg, wb) => {
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

  return {
    importSessions,
    exportSessions,
    snapshotSessions,
    allocateExportSessionId: () => nextExportId++,
    allocateSnapshotSessionId: () => nextSnapshotId++,
    sessionHandleCounts: () => ({
      subscriptions: subscriptionTokens.size,
      imports: importSessions.size,
      exports: exportSessions.size,
      snapshots: snapshotSessions.size,
    }),
    invalidateSheetIndexedHandles,
    resetSessionHandles,
    handleSubscriptionCommand,
  }
}
