import { unsupported } from './runtime-errors'
import { handled, unhandled, type RuntimeCommandHandler } from './runtime-dispatch'

const STRUCTURAL = new Set(['insertRows', 'deleteRows', 'insertColumns', 'deleteColumns'])
const TABLES = new Set([
  'createTable',
  'renameTable',
  'renameTableColumn',
  'deleteTable',
  'listTables',
  'getTable',
  'setTableTotalsRow',
  'setTableTotalFunction',
  'snapshotTables',
  'restoreTables',
])
const HIDDEN = new Set([
  'applyFilter',
  'reapplyFilter',
  'clearFilter',
  'getFilter',
  'hideRows',
  'unhideRows',
  'listHiddenRows',
  'snapshotHidden',
  'restoreHidden',
  'snapshotFilters',
  'restoreFilters',
])

export const handleUnsupportedCommands: RuntimeCommandHandler = (msg) => {
  const cmd = String(msg.cmd)
  if (cmd === 'applyAutoFill') return handled(unsupported('applyAutoFill (native auto-fill)'))
  if (STRUCTURAL.has(cmd)) return handled(unsupported(`${cmd} (structural edits)`))
  if (cmd === 'sortRange') return handled(unsupported('sortRange (engine physical sort)'))
  if (cmd === 'setEvalHiddenRows') {
    return handled(unsupported('setEvalHiddenRows (engine hidden-row eval input)'))
  }
  if (cmd === 'setEvalFilterHiddenRows') {
    return handled(unsupported('setEvalFilterHiddenRows (engine filter-hidden eval input)'))
  }
  if (TABLES.has(cmd)) return handled(unsupported(`${cmd} (structured tables)`))
  if (HIDDEN.has(cmd)) return handled(unsupported(`${cmd} (engine hidden-row state)`))
  if (cmd === 'setFormatRange') return handled(unsupported('setFormatRange (formats)'))
  if (cmd === 'snapshotFormatRange') {
    return handled(unsupported('snapshotFormatRange (format snapshots)'))
  }
  if (cmd === 'restoreFormatSnapshot') {
    return handled(unsupported('restoreFormatSnapshot (format snapshots)'))
  }
  if (cmd === 'beginExportRangeTsv' || cmd === 'nextExportRangeTsvChunk') {
    return handled(unsupported(`${cmd} (chunked TSV export)`))
  }
  return unhandled()
}
