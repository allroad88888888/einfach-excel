import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import type { WorkerCommandHandler } from './worker-command'
import { clearCustomFormulas } from './worker-custom-formulas'
import { postResponse } from './worker-post'
import {
  invalidateSheetIndexedHandles,
  resetSessionHandles,
  sessionHandleCounts,
} from './worker-session-registry'
import { assertMethod, assertSheet, normalizeAddr, normalizeStructuralIndex } from './worker-wire-guards'
import { currentWorkbook, replaceWorkbook } from './worker-workbook-host'
import type { WorkbookSheetMeta, WorkerWorkbookDebugCountersWire } from './worker-protocol'

/** 工作簿与工作表层面的命令：整簿重置、表增删改移、能力播报与 debug 探针。 */

function sheetList(wb: WasmWorkbookRuntime): WorkbookSheetMeta[] {
  const out: WorkbookSheetMeta[] = []
  for (let idx = 0; idx < wb.sheet_count(); idx++) {
    out.push({ idx, name: wb.sheet_name(idx) })
  }
  return out
}

function debugCounters(wb: WasmWorkbookRuntime): WorkerWorkbookDebugCountersWire {
  const sheets = []
  for (let idx = 0; idx < wb.sheet_count(); idx++) {
    sheets.push({
      idx,
      name: wb.sheet_name(idx),
      formulaCount: wb.debug_sheet_formula_count?.(idx) ?? 0,
      formulaEvalCount: wb.debug_formula_eval_count?.(idx) ?? 0,
      liveSubscriptionCount: wb.debug_sheet_live_subscription_count?.(idx) ?? 0,
    })
  }
  const handles = sessionHandleCounts()
  return {
    sheetCount: wb.sheet_count(),
    crossSheetDependents: wb.debug_cross_sheet_dependents_count?.() ?? 0,
    formulaCount:
      wb.debug_formula_count?.() ?? sheets.reduce((sum, sheet) => sum + sheet.formulaCount, 0),
    formulaEvalCountTotal:
      wb.debug_formula_eval_count_total?.() ??
      sheets.reduce((sum, sheet) => sum + sheet.formulaEvalCount, 0),
    liveSubscriptionCount: wb.debug_live_subscription_count?.() ?? 0,
    workerSubscriptionCount: handles.subscriptions,
    importSessionCount: handles.imports,
    exportSessionCount: handles.exports,
    snapshotSessionCount: handles.snapshots,
    sheets,
  }
}

/** 换一个全新工作簿，并把只对旧实例有意义的会话/订阅/自定义公式一起丢掉。 */
function resetWorkbook(sheets?: string[]): WasmWorkbookRuntime {
  resetSessionHandles(currentWorkbook())
  clearCustomFormulas()
  return replaceWorkbook(sheets)
}

export const handleWorkbookCommand: WorkerCommandHandler = (id, msg, workbook) => {
  let wb = workbook
  switch (msg.cmd) {
    case 'initWorkbook':
      wb = resetWorkbook(Array.isArray(msg.sheets) ? msg.sheets.map(String) : undefined)
      postResponse(id, sheetList(wb))
      return true
    case 'sheetList':
      postResponse(id, sheetList(wb))
      return true
    case 'describeCapabilities':
      // AutoFill is deliberately stricter than the legacy capability
      // families: advertise it only when this concrete wasm-pkg exposes
      // the single native transaction entry point. The scoped witness
      // keeps every older family on its existing legacy path.
      postResponse(id, {
        scope: 'auto-fill',
        autoFill: typeof wb.apply_auto_fill === 'function',
      })
      return true
    case 'addSheet':
      postResponse(id, wb.add_sheet(String(msg.name ?? 'Sheet')))
      return true
    case 'renameSheet':
      postResponse(id, wb.rename_sheet(Number(msg.sheet), String(msg.name ?? '')))
      return true
    case 'removeSheet': {
      const removed = wb.remove_sheet(Number(msg.sheet))
      // Audit D-6: sheet indices shifted — sessions/subscriptions
      // keyed by index must not survive.
      if (removed) invalidateSheetIndexedHandles(wb)
      postResponse(id, removed)
      return true
    }
    case 'moveSheet': {
      const from = normalizeStructuralIndex(msg.from, 'source sheet index')
      const to = normalizeStructuralIndex(msg.to, 'target sheet index')
      assertSheet(wb, from)
      assertSheet(wb, to)
      const moved = assertMethod(wb, 'move_sheet').call(wb, from, to)
      // Audit D-6: same index-shift invalidation as removeSheet.
      if (from !== to) invalidateSheetIndexedHandles(wb)
      postResponse(id, moved)
      return true
    }
    case 'defineName':
    case 'undefineName':
      // The WASM engine (`excel/rust/excel-core`) does not implement
      // LAMBDA name bindings. Range / value bindings are tracked
      // host-side by `worker-workbook-backend.ts` directly; the
      // worker only sees `defineName` when a host wants the engine
      // to learn about a LAMBDA. We refuse with a structured error
      // so the adapter can fall back gracefully.
      throw Object.assign(
        new Error('LAMBDA name bindings are not supported by the WASM runtime — use the TS backend (?backend=ts).'),
        { code: 'NAME_BINDING_UNSUPPORTED' },
      )
    case 'debugFormulaCacheState':
      assertSheet(wb, Number(msg.sheet))
      postResponse(
        id,
        wb.debug_formula_cache_state
          ? wb.debug_formula_cache_state(Number(msg.sheet), normalizeAddr(msg.addr))
          : 'unknown',
      )
      return true
    case 'debugFormulaEvalCount':
      assertSheet(wb, Number(msg.sheet))
      postResponse(
        id,
        wb.debug_formula_eval_count ? wb.debug_formula_eval_count(Number(msg.sheet)) : 0,
      )
      return true
    case 'debugCounters':
      postResponse(id, debugCounters(wb))
      return true
    default:
      return false
  }
}
