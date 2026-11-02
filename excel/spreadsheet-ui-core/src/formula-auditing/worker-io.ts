import { coordToA1 } from '../name-box/address'
import type { RustWorkbookSheet } from '../rust-workbook/commands'
import type { WasmWorkbook } from '../rust-workbook/wasm-types'
import type {
  FormulaEvaluationTraceSnapshot,
  RustFormulaAuditingTraceRequest,
  RustFormulaAuditingTraceResult,
  WatchedCellSnapshot,
} from './types'

interface FormulaAuditingWorkerContext {
  workbook(): WasmWorkbook | undefined
  sheets(): ReadonlyMap<string, RustWorkbookSheet>
}

function sheetIdByIndex(
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  sheetIndex: number,
  fallbackId: string,
): string {
  for (const sheet of sheets.values()) {
    if (sheet.index === sheetIndex) return sheet.id
  }
  return fallbackId
}

export function runFormulaAuditingTrace(
  context: FormulaAuditingWorkerContext,
  payload: RustFormulaAuditingTraceRequest,
): RustFormulaAuditingTraceResult {
  const workbook = context.workbook()
  const sheets = context.sheets()
  const sheet = sheets.get(payload.sheetId)
  if (!workbook || !sheet) {
    throw new Error('Formula auditing workbook is not initialized.')
  }
  const sourceAddr = coordToA1({ row: payload.row, col: payload.col })
  const sourceSnapshot = workbook.snapshotCell(sheet.index, sourceAddr)
  const rawItems =
    payload.direction === 'precedents'
      ? (workbook.trace_precedents?.(sheet.index, payload.row, payload.col) ?? [])
      : (workbook.trace_dependents?.(sheet.index, payload.row, payload.col) ?? [])

  return {
    sourceIsError: Boolean(sourceSnapshot?.isError),
    items: rawItems.map((item) => {
      const rawRange = (
        item as {
          range?: { rowStart?: number; colStart?: number; rowEnd?: number; colEnd?: number }
        }
      ).range
      const rowStart = item.rowStart ?? rawRange?.rowStart ?? 0
      const colStart = item.colStart ?? rawRange?.colStart ?? 0
      const rowEnd = item.rowEnd ?? rawRange?.rowEnd ?? rowStart
      const colEnd = item.colEnd ?? rawRange?.colEnd ?? colStart
      return {
        ...item,
        rowStart,
        colStart,
        rowEnd,
        colEnd,
        isRange: item.isRange ?? (rowStart !== rowEnd || colStart !== colEnd),
        sheetId: sheetIdByIndex(sheets, item.sheetIndex, sheet.id),
      }
    }),
  }
}

export function runFormulaAuditingEvaluate(
  context: FormulaAuditingWorkerContext,
  payload: { readonly sheetId: string; readonly row: number; readonly col: number },
): FormulaEvaluationTraceSnapshot {
  const workbook = context.workbook()
  const sheets = context.sheets()
  const sheet = sheets.get(payload.sheetId)
  if (!workbook || !sheet) {
    throw new Error('Formula auditing workbook is not initialized.')
  }
  const addr = coordToA1({ row: payload.row, col: payload.col })
  if (!workbook.evaluate_formula_steps) {
    const snap = workbook.snapshotCell(sheet.index, addr)
    const formula = snap.formula ? `=${snap.formula.replace(/^=/, '')}` : snap.display
    const finalResult = snap.formattedDisplay || snap.display
    return {
      sheetIndex: sheet.index,
      sheetId: sheet.id,
      sheetName: sheet.name,
      row: payload.row,
      col: payload.col,
      addr,
      formula,
      finalResult,
      isError: snap.isError,
      steps: snap.formula
        ? [
            {
              expressionBefore: formula,
              focusStart: 1,
              focusEnd: formula.length,
              stepResult: finalResult,
              expressionAfter: `=${finalResult}`,
            },
          ]
        : [],
    }
  }
  const trace = workbook.evaluate_formula_steps(sheet.index, payload.row, payload.col)
  return {
    ...trace,
    sheetId: sheetIdByIndex(sheets, trace.sheetIndex, sheet.id),
    steps: trace.steps.map((step) => {
      const rawSpan = (step as { focusSpan?: readonly [number, number] }).focusSpan
      const focusStart = step.focusStart ?? rawSpan?.[0] ?? 0
      const focusEnd = step.focusEnd ?? rawSpan?.[1] ?? 0
      return step.stepInTarget
        ? {
            ...step,
            focusStart,
            focusEnd,
            stepInTarget: {
              ...step.stepInTarget,
              sheetId: sheetIdByIndex(sheets, step.stepInTarget.sheetIndex, sheet.id),
            },
          }
        : {
            ...step,
            focusStart,
            focusEnd,
          }
    }),
  }
}

export function runFormulaAuditingWatch(
  context: FormulaAuditingWorkerContext,
  payload: {
    readonly targets: readonly {
      readonly sheetId: string
      readonly row: number
      readonly col: number
    }[]
  },
): readonly (WatchedCellSnapshot & { readonly sheetId: string })[] {
  const workbook = context.workbook()
  const sheets = context.sheets()
  if (!workbook) {
    throw new Error('Formula auditing workbook is not initialized.')
  }
  const resolvedTargets: {
    readonly sheetId: string
    readonly sheetIndex: number
    readonly sheetName: string
    readonly row: number
    readonly col: number
  }[] = []
  for (const target of payload.targets) {
    const sheet = sheets.get(target.sheetId)
    if (!sheet) continue
    resolvedTargets.push({
      sheetId: sheet.id,
      sheetIndex: sheet.index,
      sheetName: sheet.name,
      row: target.row,
      col: target.col,
    })
  }
  if (resolvedTargets.length === 0) return []
  if (workbook.inspect_watched_cells) {
    const snapshots = workbook.inspect_watched_cells(
      resolvedTargets.map(({ sheetIndex, row, col }) => ({
        sheet: sheetIndex,
        sheetIndex,
        row,
        col,
      })),
    )
    return snapshots.map((snapshot, idx) => ({
      ...snapshot,
      sheetId:
        resolvedTargets[idx]?.sheetId ??
        sheetIdByIndex(sheets, snapshot.sheetIndex, resolvedTargets[0]!.sheetId),
    }))
  }
  return resolvedTargets.map((target) => {
    const addr = coordToA1({ row: target.row, col: target.col })
    const snap = workbook.snapshotCell(target.sheetIndex, addr)
    return {
      sheetId: target.sheetId,
      sheetIndex: target.sheetIndex,
      sheetName: target.sheetName,
      row: target.row,
      col: target.col,
      addr,
      value: snap.formattedDisplay || snap.display,
      formula: snap.formula ? `=${snap.formula.replace(/^=/, '')}` : '',
      isError: snap.isError,
    }
  })
}
