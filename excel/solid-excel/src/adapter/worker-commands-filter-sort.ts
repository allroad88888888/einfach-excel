import type { WorkerCommandHandler } from './worker-command'
import { postError, postResponse } from './worker-post'
import {
  assertMethod,
  assertSheet,
  normalizeStructuralIndex,
  sanitizeRowList,
} from './worker-wire-guards'
import type {
  ColumnFilterRuleWire,
  FilterApplyResultWire,
  FilterSnapshotWire,
  HiddenRowsSnapshotWire,
  SheetFilterStateWire,
  SortRangeRejectWire,
  SortRangeReportWire,
} from './worker-protocol'

/** 引擎自持的排序、筛选与隐藏行，含喂给求值的两组隐藏行输入。 */

export const handleFilterSortCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'sortRange': {
      const sheet = Number(msg.sheet)
      assertSheet(wb, sheet)
      const sortRange = assertMethod(wb, 'sortRange')
      // Payload ({ range, keys, excludedRows }) is the engine's
      // authority — forward it verbatim. The binding returns the
      // success report or a structured reject, both in its Ok arm;
      // only a catastrophic serialization failure throws (caught by
      // the outer try → toRpcError).
      const outcome = sortRange.call(wb, sheet, msg.payload) as
        | ({ ok?: true } & SortRangeReportWire)
        | ({ ok: false } & SortRangeRejectWire)
      if (outcome && (outcome as { ok?: unknown }).ok === false) {
        const reject = outcome as SortRangeRejectWire
        // Fail-closed: a structured engine reject surfaces as an RPC
        // error so the host's recordCellMutation wrapper (S4)
        // short-circuits before recording undo or bumping revision.
        // anchor/message ride on `detail` (SortRangeRejectWire).
        postError(id, {
          code: 'SORT_REJECTED',
          message: reject.message ?? reject.code,
          detail: {
            code: reject.code,
            ...(reject.anchor === undefined ? {} : { anchor: reject.anchor }),
            ...(reject.message === undefined ? {} : { message: reject.message }),
          },
        })
      } else {
        const report = outcome as SortRangeReportWire
        postResponse(id, {
          movedRows: report.movedRows,
          movedCells: report.movedCells,
          rowPermutation: report.rowPermutation,
        })
      }
      return true
    }
    case 'setEvalHiddenRows': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      // NOTE: no `assertSheet` — the engine treats an out-of-range
      // sheet as a silent no-op (workbook.rs `set_eval_hidden_rows`),
      // and this fire-and-forget eval-input push mirrors that tolerant
      // whole-set-replace contract rather than throwing.
      // Whole-set replace: coerce to a sanitized u32 list (drop
      // non-integers / negatives). The engine models no hidden state
      // — it consumes this purely as eval input and the paired epoch
      // bump re-derives only the 101-111 SUBTOTAL formulas.
      assertMethod(wb, 'setEvalHiddenRows').call(wb, sheet, sanitizeRowList(msg.rows))
      postResponse(id, true)
      return true
    }
    case 'setEvalFilterHiddenRows': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      // Same tolerant whole-set-replace contract as its manual twin:
      // no `assertSheet` (the engine no-ops an unknown sheet index),
      // and the row list is re-sanitized defensively.
      const rows = sanitizeRowList(msg.rows)
      // NOT `assertMethod`: a wasm-pkg built before the export exists
      // must degrade, not fail the filter that triggered this push. An
      // explicit UNSUPPORTED is the honest answer — never a fake ACK,
      // and the host adapter stops pushing after seeing it.
      const push = wb.setEvalFilterHiddenRows
      if (typeof push !== 'function') {
        postError(id, {
          code: 'UNSUPPORTED',
          message: 'WasmWorkbook.setEvalFilterHiddenRows is not available in this wasm build',
        })
        return true
      }
      push.call(wb, sheet, rows)
      postResponse(id, true)
      return true
    }
    // --- Engine-owned hidden rows + filter (E5) --------------------------
    //
    // The three filter commands forward the engine's `{ ok, … }` union
    // VERBATIM: a structured refusal (`source-too-large`, `invalid-sheet`)
    // rides in the resolved value, exactly as the wasm binding returns it,
    // so the host adapter discriminates on `ok` and never sees a throw for
    // a refusal. Only a serialization failure throws → outer toRpcError.
    case 'applyFilter': {
      const sheet = Number(msg.sheet)
      const applyFilter = assertMethod(wb, 'applyFilter')
      const rules = (Array.isArray(msg.rules) ? msg.rules : []) as ColumnFilterRuleWire[]
      postResponse(id, applyFilter.call(wb, sheet, { rules }) as FilterApplyResultWire)
      return true
    }
    case 'reapplyFilter': {
      const sheet = Number(msg.sheet)
      const reapplyFilter = assertMethod(wb, 'reapplyFilter')
      postResponse(id, reapplyFilter.call(wb, sheet) as FilterApplyResultWire)
      return true
    }
    case 'clearFilter': {
      const sheet = Number(msg.sheet)
      const clearFilter = assertMethod(wb, 'clearFilter')
      postResponse(id, clearFilter.call(wb, sheet) as FilterApplyResultWire)
      return true
    }
    case 'getFilter': {
      const sheet = Number(msg.sheet)
      const getFilter = assertMethod(wb, 'getFilter')
      postResponse(id, getFilter.call(wb, sheet) as SheetFilterStateWire)
      return true
    }
    case 'hideRows': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const rows = sanitizeRowList(msg.rows)
      postResponse(id, assertMethod(wb, 'hideRows').call(wb, sheet, rows) as boolean)
      return true
    }
    case 'unhideRows': {
      const sheet = normalizeStructuralIndex(msg.sheet, 'sheet index')
      const rows = sanitizeRowList(msg.rows)
      postResponse(id, assertMethod(wb, 'unhideRows').call(wb, sheet, rows) as boolean)
      return true
    }
    case 'listHiddenRows': {
      const sheet = Number(msg.sheet)
      const listHiddenRows = assertMethod(wb, 'listHiddenRows')
      postResponse(id, listHiddenRows.call(wb, sheet) as number[])
      return true
    }
    case 'snapshotHidden': {
      const snapshotHidden = assertMethod(wb, 'snapshotHidden')
      postResponse(id, snapshotHidden.call(wb) as HiddenRowsSnapshotWire)
      return true
    }
    case 'restoreHidden': {
      const restoreHidden = assertMethod(wb, 'restoreHidden')
      postResponse(id, restoreHidden.call(wb, msg.snapshot as HiddenRowsSnapshotWire) as number)
      return true
    }
    case 'snapshotFilters': {
      const snapshotFilters = assertMethod(wb, 'snapshotFilters')
      postResponse(id, snapshotFilters.call(wb) as FilterSnapshotWire)
      return true
    }
    case 'restoreFilters': {
      const restoreFilters = assertMethod(wb, 'restoreFilters')
      postResponse(id, restoreFilters.call(wb, msg.snapshot as FilterSnapshotWire) as number)
      return true
    }
    default:
      return false
  }
}
