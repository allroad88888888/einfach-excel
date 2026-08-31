import { defineNameInWorker, undefineNameInWorker } from './defined-names'
import { registerCustomFormulaInWorker, unregisterCustomFormulaInWorker } from './custom-formulas'
import { handled, unhandled, type RuntimeCommandHandler } from './runtime-dispatch'
import type { RuntimeState } from './runtime-state'

function debugCountersFor(state: RuntimeState) {
  let formulaCount = 0
  let formulaEvalCountTotal = 0
  const sheets = state.sheets.map((sheet) => {
    const sheetFormulaCount = state.workbook.debugFormulaCount(sheet.idx)
    const formulaEvalCount = state.workbook.debugFormulaEvalCount(sheet.idx)
    formulaCount += sheetFormulaCount
    formulaEvalCountTotal += formulaEvalCount
    return {
      idx: sheet.idx,
      name: sheet.name,
      formulaCount: sheetFormulaCount,
      formulaEvalCount,
      liveSubscriptionCount: 0,
    }
  })
  return {
    sheetCount: state.sheets.length,
    crossSheetDependents: 0,
    formulaCount,
    formulaEvalCountTotal,
    liveSubscriptionCount: 0,
    workerSubscriptionCount: 0,
    importSessionCount: state.importSessions.size,
    exportSessionCount: 0,
    snapshotSessionCount: state.snapshotSessions.size,
    sheets,
  }
}

export const handleFormulaCommands: RuntimeCommandHandler = (msg, { state }) => {
  switch (msg.cmd) {
    case 'subscribeCells':
    case 'unsubscribeCells':
      return handled(true)
    case 'registerCustomFormula':
      return handled(
        registerCustomFormulaInWorker(
          state,
          String(msg.name ?? ''),
          String(msg.source ?? ''),
          msg.isAsync === true,
        ),
      )
    case 'unregisterCustomFormula':
      return handled(unregisterCustomFormulaInWorker(state, msg.name))
    case 'defineName':
      return handled(defineNameInWorker(state, String(msg.name ?? ''), msg.binding))
    case 'undefineName':
      return handled(undefineNameInWorker(state, String(msg.name ?? '')))
    case 'debugCounters':
      return handled(debugCountersFor(state))
    case 'debugFormulaCacheState':
      return handled(
        state.workbook.debugFormulaCacheState(Number(msg.sheet), String(msg.addr ?? '')),
      )
    case 'debugFormulaEvalCount':
      return handled(state.workbook.debugFormulaEvalCount(Number(msg.sheet)))
    default:
      return unhandled()
  }
}
