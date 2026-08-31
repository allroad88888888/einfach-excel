import type { WorkerCommandHandler } from './worker-command'
import { postResponse } from './worker-post'
import type { PrintConfigSnapshotWire } from './worker-protocol'
import { assertMethod, assertSheet } from './worker-wire-guards'

/** Engine-owned page-setup reads and writes for the WASM runtime. */
export const handlePrintConfigCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'getPrintConfig': {
      const sheet = Number(msg.sheet)
      assertSheet(wb, sheet)
      const getPrintConfig = assertMethod(wb, 'getPrintConfig')
      postResponse(id, getPrintConfig.call(wb, sheet))
      return true
    }
    case 'setPrintConfig': {
      const sheet = Number(msg.sheet)
      assertSheet(wb, sheet)
      const setPrintConfig = assertMethod(wb, 'setPrintConfig')
      postResponse(
        id,
        setPrintConfig.call(wb, sheet, msg.config as PrintConfigSnapshotWire['config']),
      )
      return true
    }
    default:
      return false
  }
}
