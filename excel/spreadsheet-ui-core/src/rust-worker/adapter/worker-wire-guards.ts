import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import type { CellRefWire, CellSnapshotWire, SparseCellWire, SparseRangeWire } from './worker-protocol'

/**
 * 入站 RPC 参数在碰到 wasm 绑定之前的最后一道关：把宽松的 wire 值强制成引擎
 * 能接受的形状，形状不对就抛带 `code` 的结构化错误（由外层 dispatcher 变成
 * RPC error）。`assertMethod` 是同一道关的能力侧 —— 绑定里没有的方法在这里
 * 变成 `WASM_METHOD_UNAVAILABLE`，而不是运行时的 `undefined is not a function`。
 */

export function normalizeAddr(addr: unknown): string {
  return String(addr ?? '').toUpperCase()
}

export function normalizeRefWire(ref: CellRefWire): CellRefWire {
  return {
    sheet: Number(ref.sheet),
    addr: normalizeAddr(ref.addr),
  }
}

export function normalizeSnapshot(cell: CellSnapshotWire): CellSnapshotWire {
  return {
    ...cell,
    addr: normalizeAddr(cell.addr),
  }
}

export function normalizeSparseCell(cell: SparseCellWire): SparseCellWire {
  return {
    ...cell,
    addr: normalizeAddr(cell.addr),
  } as SparseCellWire
}

export function assertSheet(wb: WasmWorkbookRuntime, sheet: number) {
  if (!Number.isInteger(sheet) || sheet < 0 || sheet >= wb.sheet_count()) {
    throw Object.assign(new Error(`invalid sheet index: ${sheet}`), {
      code: 'INVALID_SHEET',
    })
  }
}

export function assertFormulaSource(formula: unknown): string {
  if (typeof formula !== 'string') {
    throw Object.assign(new Error('formula must be a string'), {
      code: 'INVALID_FORMULA',
    })
  }
  return formula
}

export function normalizeSparseRange(range: unknown): SparseRangeWire {
  const input = (range ?? {}) as Partial<SparseRangeWire>
  const out: SparseRangeWire = {
    sheet: Number(input.sheet),
    startRow: Number(input.startRow),
    startCol: Number(input.startCol),
    endRow: Number(input.endRow),
    endCol: Number(input.endCol),
  }
  if (
    !Number.isInteger(out.sheet) ||
    out.sheet < 0 ||
    !Number.isInteger(out.startRow) ||
    out.startRow < 0 ||
    !Number.isInteger(out.startCol) ||
    out.startCol < 0 ||
    !Number.isInteger(out.endRow) ||
    out.endRow < 0 ||
    !Number.isInteger(out.endCol) ||
    out.endCol < 0
  ) {
    throw Object.assign(new Error('invalid sparse range'), {
      code: 'INVALID_SPARSE_RANGE',
    })
  }
  return out
}

export function normalizeStructuralIndex(value: unknown, name: string): number {
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0) {
    throw Object.assign(new Error(`invalid ${name}`), {
      code: 'INVALID_STRUCTURAL_EDIT',
    })
  }
  return index
}

/**
 * Sanitize a whole-set row list (`hideRows` / `unhideRows`), dropping
 * non-integers and negatives — the same defensive coercion the eval-input
 * pushes apply.
 */
export function sanitizeRowList(value: unknown): number[] {
  const raw = Array.isArray(value) ? (value as unknown[]) : []
  const rows: number[] = []
  for (const entry of raw) {
    const index = Number(entry)
    if (Number.isInteger(index) && index >= 0) rows.push(index)
  }
  return rows
}

export function normalizeStructuralCount(value: unknown): number {
  const count = Number(value)
  if (!Number.isInteger(count) || count < 1) {
    throw Object.assign(new Error('invalid structural edit count'), {
      code: 'INVALID_STRUCTURAL_EDIT',
    })
  }
  return count
}

export function normalizeDimensionPx(value: unknown, name: string): number {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) {
    throw Object.assign(new Error(`invalid ${name}`), {
      code: 'INVALID_DIMENSION_SIZE',
    })
  }
  return Math.max(1, Math.round(size))
}

export function assertMethod<T extends keyof WasmWorkbookRuntime>(
  wb: WasmWorkbookRuntime,
  method: T,
): NonNullable<WasmWorkbookRuntime[T]> {
  const value = wb[method]
  if (typeof value !== 'function') {
    throw Object.assign(new Error(`WasmWorkbook.${String(method)} is not available`), {
      code: 'WASM_METHOD_UNAVAILABLE',
    })
  }
  return value as NonNullable<WasmWorkbookRuntime[T]>
}
