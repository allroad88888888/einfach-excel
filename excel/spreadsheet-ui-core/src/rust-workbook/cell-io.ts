import type { DisplayCell } from '../backend'
import { toA1 } from '../backend'
import type { RustCellSnapshot, RustWriteOutcome, WasmWorkbook } from './wasm-types'

function requiredMethod<T>(method: T | undefined, name: string): T {
  if (method) return method
  throw Object.assign(new Error(`WasmWorkbook.${name} is unavailable`), {
    code: 'WASM_METHOD_UNAVAILABLE',
  })
}

function assertWrite(outcome: RustWriteOutcome, address: string): void {
  if (outcome?.ok !== false) return
  throw Object.assign(new Error(`Rust engine rejected the write to ${address}`), {
    code: 'CELL_WRITE_REJECTED',
    detail: { code: outcome.code ?? 'unknown' },
  })
}

function parseA1(address: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(address.toUpperCase())
  if (!match) return null
  let col = 0
  for (const letter of match[1]) col = col * 26 + letter.charCodeAt(0) - 64
  const row = Number(match[2]) - 1
  return Number.isInteger(row) && row >= 0 ? { row, col: col - 1 } : null
}

/** 把 Rust 快照变成 UI 投影格，空快照不会进入稀疏结果。 */
export function displayCell(snapshot: RustCellSnapshot): DisplayCell | null {
  const coord = parseA1(snapshot.addr)
  if (!coord || (snapshot.type === 'null' && !snapshot.formula && !snapshot.display)) return null
  const valueKind = snapshot.isError
    ? 'error'
    : snapshot.type === 'text'
      ? 'string'
      : snapshot.type === 'null'
        ? 'blank'
        : snapshot.type
  const cell: DisplayCell = { ...coord, displayValue: snapshot.display, valueKind }
  if (snapshot.type === 'number') {
    const numericValue = Number(snapshot.display)
    if (Number.isFinite(numericValue)) cell.numericValue = numericValue
  }
  if (snapshot.formula) cell.formula = snapshot.formula
  if (snapshot.isError) cell.error = { code: 'BACKEND_ERROR', message: snapshot.display }
  return cell
}

/** 将一条 UI 原始输入直接提交给 Rust。 */
export function writeCellInput(
  workbook: WasmWorkbook,
  sheet: number,
  row: number,
  col: number,
  input: string,
): void {
  const address = toA1(row, col)
  const trimmed = input.trim()
  let outcome: RustWriteOutcome
  if (!trimmed) {
    outcome = requiredMethod(workbook.tryClearCellAt, 'tryClearCellAt').call(
      workbook,
      sheet,
      address,
    )
  } else if (trimmed.startsWith('=')) {
    outcome = requiredMethod(workbook.trySetFormulaAt, 'trySetFormulaAt').call(
      workbook,
      sheet,
      address,
      trimmed,
    )
    assertWrite(outcome, address)
    if (outcome.installed === false) {
      const snapshot = workbook.snapshotCell(sheet, address)
      throw Object.assign(new Error('Formula could not be installed'), {
        code: snapshot.display.toUpperCase().includes('CYCLE')
          ? 'FORMULA_CYCLE'
          : 'INVALID_FORMULA',
      })
    }
    return
  } else {
    const numericValue = Number(trimmed)
    outcome = Number.isFinite(numericValue)
      ? requiredMethod(workbook.trySetCellNumber, 'trySetCellNumber').call(
          workbook,
          sheet,
          address,
          numericValue,
        )
      : requiredMethod(workbook.trySetCellText, 'trySetCellText').call(
          workbook,
          sheet,
          address,
          input,
        )
  }
  assertWrite(outcome, address)
}
