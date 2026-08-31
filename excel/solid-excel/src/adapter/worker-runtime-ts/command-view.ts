import { normalizeSparseRange } from '../worker-wire-guards'
import { handled, unhandled, type RuntimeCommandHandler } from './runtime-dispatch'
import { TS_WORKER_RUNTIME_CAPABILITIES } from './runtime-capabilities'
import { setColumnWidth, setRowHeight, snapshotViewportSizes } from './viewport-sizes'

export const handleViewCommands: RuntimeCommandHandler = (msg, { state }) => {
  switch (msg.cmd) {
    case 'describeCapabilities':
      return handled({ ...TS_WORKER_RUNTIME_CAPABILITIES })
    case 'snapshotViewportSizes':
      return handled(snapshotViewportSizes(state, normalizeSparseRange(msg.range)))
    case 'setRowHeight':
      return handled(setRowHeight(state, msg.sheet, msg.rowIndex, msg.heightPx))
    case 'setColumnWidth':
      return handled(setColumnWidth(state, msg.sheet, msg.colIndex, msg.widthPx))
    default:
      return unhandled()
  }
}
