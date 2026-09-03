import { assertCellWriteOk, assertFormulaWriteInstalled } from './cell-write-reject'
import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import {
  assertFormulaSource,
  assertMethod,
  assertSheet,
  normalizeAddr,
  normalizeSnapshot,
} from './worker-wire-guards'
import type { CellRefWire, CellSnapshotWire, CellWire, FormulaMutationResultWire } from './worker-protocol'

/**
 * 单元格级读写在 worker 侧的语义：读一格快照、写一格值、装一条公式。
 * 每条写路径都走 `try*` 那一族可失败绑定，引擎的拒绝抛出
 * `./cell-write-reject` 的类型化证据，绝不退化成"成功形状的 ACK"。
 */

export function snapshotCell(wb: WasmWorkbookRuntime, ref: CellRefWire): CellSnapshotWire {
  const addr = normalizeAddr(ref.addr)
  const sheet = ref.sheet
  return normalizeSnapshot(assertMethod(wb, 'snapshotCell').call(wb, sheet, addr))
}

function formulaFailureFromSnapshot(cell: CellSnapshotWire): FormulaMutationResultWire {
  const display = cell.display.toUpperCase()
  if (display.includes('CYCLE')) {
    return {
      ok: false,
      code: 'FORMULA_CYCLE',
      message: 'formula would create a cycle',
      display: cell.display,
    }
  }
  if (cell.isError) {
    return {
      ok: false,
      code: 'INVALID_FORMULA',
      message: 'formula could not be parsed or installed',
      display: cell.display,
    }
  }
  return {
    ok: false,
    code: 'FORMULA_REJECTED',
    message: 'formula was rejected',
    display: cell.display,
  }
}

/**
 * Install a formula through the FALLIBLE binding and report whether it
 * actually installed. An engine refusal (invalid address, mutation from
 * inside a custom-formula callback) throws the typed cell-write witness
 * (`./cell-write-reject`); `false` keeps its old meaning — parsed badly or
 * cycled, and the cell already says so.
 */
export function setFormulaInstalled(
  wb: WasmWorkbookRuntime,
  sheet: number,
  addr: string,
  formula: unknown,
): boolean {
  assertSheet(wb, sheet)
  const source = assertFormulaSource(formula)
  const trySetFormulaAt = assertMethod(wb, 'trySetFormulaAt')
  return assertFormulaWriteInstalled(trySetFormulaAt.call(wb, sheet, addr, source), addr)
}

export function setFormulaDetailed(
  wb: WasmWorkbookRuntime,
  sheet: number,
  addr: string,
  formula: unknown,
): FormulaMutationResultWire {
  if (setFormulaInstalled(wb, sheet, addr, formula)) return { ok: true }
  return formulaFailureFromSnapshot(snapshotCell(wb, { sheet, addr }))
}

/**
 * Every branch goes through the fallible `try*` twin so an engine refusal
 * (spill range, unparseable addr) throws instead of returning the
 * success-shaped `true` the infallible setters produced while dropping
 * the value.
 */
export function setCell(wb: WasmWorkbookRuntime, sheet: number, addr: string, value: CellWire) {
  assertSheet(wb, sheet)
  switch (value.type) {
    case 'number': {
      const write = assertMethod(wb, 'trySetCellNumber')
      assertCellWriteOk(write.call(wb, sheet, addr, value.value), addr)
      return true
    }
    case 'text': {
      const write = assertMethod(wb, 'trySetCellText')
      assertCellWriteOk(write.call(wb, sheet, addr, value.value), addr)
      return true
    }
    case 'boolean': {
      const write = assertMethod(wb, 'trySetCellBoolean')
      assertCellWriteOk(write.call(wb, sheet, addr, value.value), addr)
      return true
    }
    case 'error': {
      const write = assertMethod(wb, 'trySetCellError')
      assertCellWriteOk(write.call(wb, sheet, addr, value.value), addr)
      return true
    }
    case 'null': {
      const clear = assertMethod(wb, 'tryClearCellAt')
      assertCellWriteOk(clear.call(wb, sheet, addr), addr)
      return true
    }
    default:
      throw Object.assign(new Error('unsupported cell wire value'), {
        code: 'INVALID_CELL_VALUE',
      })
  }
}

export function clearCell(wb: WasmWorkbookRuntime, sheet: number, addr: string) {
  assertSheet(wb, sheet)
  const clear = assertMethod(wb, 'tryClearCellAt')
  assertCellWriteOk(clear.call(wb, sheet, addr), addr)
  return true
}
