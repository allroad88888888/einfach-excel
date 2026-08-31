import {
  listTsWorkerConditionalFormats,
  removeTsWorkerConditionalFormatRule,
  setTsWorkerConditionalFormatRule,
} from '../worker-runtime-ts-conditional-format'
import { readTsWorkerPrintConfig, setTsWorkerPrintConfig } from '../worker-runtime-ts-print-config'
import { handled, unhandled, type RuntimeCommandHandler } from './runtime-dispatch'
import { assertSheetIdx, DEFAULT_INITIAL_SHEETS, listSheetMeta } from './runtime-state'

export const handleWorkbookCommands: RuntimeCommandHandler = (msg, { state, lifecycle }) => {
  switch (msg.cmd) {
    case 'initWorkbook': {
      const names = Array.isArray(msg.sheets) ? msg.sheets.map(String) : DEFAULT_INITIAL_SHEETS
      return handled(lifecycle.init(state, names))
    }
    case 'sheetList':
      return handled(listSheetMeta(state))
    case 'addSheet':
      return handled(lifecycle.add(state, String(msg.name ?? `Sheet${state.sheets.length + 1}`)))
    case 'renameSheet':
      return handled(lifecycle.rename(state, Number(msg.sheet), String(msg.name ?? '').trim()))
    case 'removeSheet':
      return handled(lifecycle.remove(state, Number(msg.sheet)))
    case 'moveSheet':
      return handled(lifecycle.move(state, Number(msg.from), Number(msg.to)))
    case 'getPrintConfig': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      return handled(readTsWorkerPrintConfig(state.workbook, sheet))
    }
    case 'setPrintConfig': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      return handled(
        setTsWorkerPrintConfig(
          state.workbook,
          sheet,
          msg.config as Parameters<typeof setTsWorkerPrintConfig>[2],
        ),
      )
    }
    case 'listConditionalFormats': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      return handled(listTsWorkerConditionalFormats(state.conditionalFormatsBySheetId, sheet))
    }
    case 'setConditionalFormatRule': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      return handled(
        setTsWorkerConditionalFormatRule(
          state.conditionalFormatsBySheetId,
          sheet,
          msg.conditionalFormat as Parameters<typeof setTsWorkerConditionalFormatRule>[2],
        ),
      )
    }
    case 'removeConditionalFormatRule': {
      const sheet = assertSheetIdx(state, Number(msg.sheet))
      return handled(
        removeTsWorkerConditionalFormatRule(
          state.conditionalFormatsBySheetId,
          sheet,
          msg.conditionalFormat as Parameters<typeof removeTsWorkerConditionalFormatRule>[2],
        ),
      )
    }
    default:
      return unhandled()
  }
}
