import type { WorkerCommandHandler } from './worker-command'
import { dispatchTable } from './worker-rejections'
import { assertMethod, assertSheet } from './worker-wire-guards'
import type { TableRegistrySnapshotWire } from './worker-protocol'

/** Excel Table 的 CRUD、汇总行与注册表快照 —— 拒绝一律走 `dispatchTable`。 */

export const handleTableCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'createTable': {
      const sheet = Number(msg.sheet)
      assertSheet(wb, sheet)
      const bounds = (msg.bounds ?? {}) as {
        startRow: number
        startCol: number
        endRow: number
        endCol: number
      }
      const createTable = assertMethod(wb, 'createTable')
      const name = typeof msg.name === 'string' ? msg.name : undefined
      dispatchTable(id, () =>
        createTable.call(
          wb,
          sheet,
          Number(bounds.startRow),
          Number(bounds.startCol),
          Number(bounds.endRow),
          Number(bounds.endCol),
          name,
        ),
      )
      return true
    }
    case 'renameTable': {
      const renameTable = assertMethod(wb, 'renameTable')
      dispatchTable(id, () => {
        renameTable.call(wb, String(msg.name), String(msg.newName))
        return true
      })
      return true
    }
    case 'renameTableColumn': {
      const renameTableColumn = assertMethod(wb, 'renameTableColumn')
      dispatchTable(id, () => {
        renameTableColumn.call(wb, String(msg.name), String(msg.oldColumn), String(msg.newColumn))
        return true
      })
      return true
    }
    case 'deleteTable': {
      const deleteTable = assertMethod(wb, 'deleteTable')
      dispatchTable(id, () => {
        deleteTable.call(wb, String(msg.name))
        return true
      })
      return true
    }
    case 'listTables': {
      const listTables = assertMethod(wb, 'listTables')
      dispatchTable(id, () => listTables.call(wb))
      return true
    }
    case 'getTable': {
      const getTable = assertMethod(wb, 'getTable')
      dispatchTable(id, () => getTable.call(wb, String(msg.name)))
      return true
    }
    case 'setTableTotalsRow': {
      const setTableTotalsRow = assertMethod(wb, 'setTableTotalsRow')
      dispatchTable(id, () => {
        setTableTotalsRow.call(wb, String(msg.name), Boolean(msg.enabled))
        return true
      })
      return true
    }
    case 'setTableTotalFunction': {
      const setTableTotalFunction = assertMethod(wb, 'setTableTotalFunction')
      dispatchTable(id, () => {
        setTableTotalFunction.call(wb, String(msg.name), String(msg.column), String(msg.func))
        return true
      })
      return true
    }
    case 'snapshotTables': {
      const snapshotTables = assertMethod(wb, 'snapshotTables')
      dispatchTable(id, () => snapshotTables.call(wb))
      return true
    }
    case 'restoreTables': {
      // REPLACE semantics + all-or-nothing validation live in the
      // engine; the dispatcher only maps a refusal onto the shared
      // `TABLE_REJECTED` error so the host sees a structured reason
      // instead of a generic WORKER_ERROR.
      const restoreTables = assertMethod(wb, 'restoreTables')
      const snapshot = msg.snapshot as TableRegistrySnapshotWire
      dispatchTable(id, () => restoreTables.call(wb, snapshot))
      return true
    }
    default:
      return false
  }
}
