import { atom } from '@einfach/core'
import { applyGoToTargetAtom } from '../go-to'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import type { AuditingTraceArrow, RustFormulaAuditingTraceRequest } from './types'

interface TraceCellNode {
  readonly sheetId: string
  readonly sheetName: string
  readonly row: number
  readonly col: number
}

interface TraceFrontierState {
  readonly anchorKey: string
  readonly level: number
  readonly frontier: readonly TraceCellNode[]
}

export interface TraceAuditingState {
  readonly busy: boolean
  readonly arrows: readonly AuditingTraceArrow[]
  readonly precedentsState: TraceFrontierState | null
  readonly dependentsState: TraceFrontierState | null
  readonly notice?: string
}

const INITIAL_TRACE_STATE: TraceAuditingState = Object.freeze({
  busy: false,
  arrows: Object.freeze([]),
  precedentsState: null,
  dependentsState: null,
})

const traceAuditingBackingAtom = atom<TraceAuditingState>(INITIAL_TRACE_STATE)
traceAuditingBackingAtom.debugLabel = 'spreadsheet.formulaAuditing.traceBacking'

export const traceAuditingStateAtom = atom((get) => get(traceAuditingBackingAtom))
traceAuditingStateAtom.debugLabel = 'spreadsheet.formulaAuditing.traceState'

export const traceArrowsAtom = atom((get) => get(traceAuditingBackingAtom).arrows)
traceArrowsAtom.debugLabel = 'spreadsheet.formulaAuditing.traceArrows'

export const activeSheetTraceArrowsAtom = atom((get): readonly AuditingTraceArrow[] => {
  const activeSheet = get(activeWorkbookSheetAtom)
  if (!activeSheet) return []
  const arrows = get(traceAuditingBackingAtom).arrows
  return arrows.filter(
    (arrow) => arrow.fromSheetId === activeSheet.id || arrow.toSheetId === activeSheet.id,
  )
})
activeSheetTraceArrowsAtom.debugLabel = 'spreadsheet.formulaAuditing.activeSheetTraceArrows'

export const formulaAuditingAvailableAtom = atom((get) =>
  Boolean(get(rustWorkbookConnectionAtom) && get(activeWorkbookSheetAtom)),
)
formulaAuditingAvailableAtom.debugLabel = 'spreadsheet.formulaAuditing.available'

export type TraceAuditingAction =
  | 'trace-precedents'
  | 'trace-dependents'
  | 'remove-arrows'
  | {
      readonly navigate: {
        readonly sheetId: string
        readonly row: number
        readonly col: number
      }
    }

function cellNodeKey(sheetId: string, row: number, col: number): string {
  return `${sheetId}:${row}:${col}`
}

function expandRangeNodes(
  sheetId: string,
  sheetName: string,
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number,
): TraceCellNode[] {
  const nodes: TraceCellNode[] = []
  const maxRows = Math.min(rowEnd, rowStart + 7)
  const maxCols = Math.min(colEnd, colStart + 7)
  for (let row = rowStart; row <= maxRows; row += 1) {
    for (let col = colStart; col <= maxCols; col += 1) {
      nodes.push({ sheetId, sheetName, row, col })
    }
  }
  return nodes
}

export const runTraceAuditingAtom = atom(
  null,
  async (get, set, action: TraceAuditingAction): Promise<boolean> => {
    if (action === 'remove-arrows') {
      set(traceAuditingBackingAtom, INITIAL_TRACE_STATE)
      return true
    }

    if (typeof action === 'object' && 'navigate' in action) {
      const sheets = get(workbookDocumentAtom).sheets
      const active = get(activeWorkbookSheetAtom)
      const targetSheet = sheets.find((item) => item.id === action.navigate.sheetId)
      if (!targetSheet || !active) return false
      const { row, col } = action.navigate
      if (targetSheet.id !== active.id) {
        set(activateWorkbookSheetAtom, targetSheet)
      }
      set(applyGoToTargetAtom, {
        sheetId: targetSheet.id,
        sheetName: targetSheet.name,
        coord: { row, col },
        range: { rowStart: row, rowEnd: row, colStart: col, colEnd: col },
        source: 'A1',
      })
      set(scrollToCellAtom, {
        coord: { row, col },
        rowAlign: 'nearest',
        colAlign: 'nearest',
      })
      return true
    }

    const connection = get(rustWorkbookConnectionAtom)
    const activeSheet = get(activeWorkbookSheetAtom)
    if (!connection || !activeSheet) return false

    const current = get(traceAuditingBackingAtom)
    if (current.busy) return false

    const activeCell = get(selectionSnapshotAtom).activeCell
    const anchorKey = cellNodeKey(activeSheet.id, activeCell.row, activeCell.col)
    const direction = action === 'trace-precedents' ? 'precedents' : 'dependents'
    const dirState =
      direction === 'precedents' ? current.precedentsState : current.dependentsState

    const isExpanding = dirState !== null && dirState.anchorKey === anchorKey
    const level = isExpanding ? dirState.level + 1 : 1
    const sources: readonly TraceCellNode[] = isExpanding
      ? dirState.frontier
      : [
          {
            sheetId: activeSheet.id,
            sheetName: activeSheet.name,
            row: activeCell.row,
            col: activeCell.col,
          },
        ]

    if (sources.length === 0) return false

    set(traceAuditingBackingAtom, { ...current, busy: true, notice: undefined })

    try {
      const existingIds = new Set(current.arrows.map((arrow) => arrow.id))
      const newArrows: AuditingTraceArrow[] = []
      const nextFrontierMap = new Map<string, TraceCellNode>()

      for (const source of sources) {
        const request: RustFormulaAuditingTraceRequest = {
          direction,
          sheetId: source.sheetId,
          row: source.row,
          col: source.col,
        }
        const result = await connection.request('formulaAuditing.trace', request)
        for (const item of result.items) {
          const fromSheetId = direction === 'precedents' ? item.sheetId : source.sheetId
          const fromSheetName = direction === 'precedents' ? item.sheetName : source.sheetName
          const fromRange =
            direction === 'precedents'
              ? {
                  rowStart: item.rowStart,
                  colStart: item.colStart,
                  rowEnd: item.rowEnd,
                  colEnd: item.colEnd,
                }
              : {
                  rowStart: source.row,
                  colStart: source.col,
                  rowEnd: source.row,
                  colEnd: source.col,
                }
          const toSheetId = direction === 'precedents' ? source.sheetId : item.sheetId
          const toSheetName = direction === 'precedents' ? source.sheetName : item.sheetName
          const toCell =
            direction === 'precedents'
              ? { row: source.row, col: source.col }
              : { row: item.rowStart, col: item.colStart }
          const arrowId = `${direction}:${fromSheetId}:${fromRange.rowStart}:${fromRange.colStart}:${fromRange.rowEnd}:${fromRange.colEnd}->${toSheetId}:${toCell.row}:${toCell.col}`
          if (!existingIds.has(arrowId)) {
            existingIds.add(arrowId)
            newArrows.push(
              Object.freeze({
                id: arrowId,
                direction,
                level,
                fromSheetId,
                fromSheetName,
                fromRange: Object.freeze(fromRange),
                toSheetId,
                toSheetName,
                toCell: Object.freeze(toCell),
                isError: Boolean(result.sourceIsError || item.isError),
                isCrossSheet: fromSheetId !== toSheetId,
                ...(item.viaName ? { viaName: item.viaName } : {}),
              }),
            )
          }

          const expandedNodes = expandRangeNodes(
            item.sheetId,
            item.sheetName,
            item.rowStart,
            item.colStart,
            item.rowEnd,
            item.colEnd,
          )
          for (const node of expandedNodes) {
            const key = cellNodeKey(node.sheetId, node.row, node.col)
            if (!nextFrontierMap.has(key)) {
              nextFrontierMap.set(key, node)
            }
          }
        }
      }

      const nextDirState: TraceFrontierState = Object.freeze({
        anchorKey,
        level,
        frontier: Object.freeze([...nextFrontierMap.values()]),
      })
      const latest = get(traceAuditingBackingAtom)
      set(
        traceAuditingBackingAtom,
        Object.freeze({
          busy: false,
          arrows: Object.freeze([...latest.arrows, ...newArrows]),
          precedentsState:
            direction === 'precedents' ? nextDirState : latest.precedentsState,
          dependentsState:
            direction === 'dependents' ? nextDirState : latest.dependentsState,
        }),
      )
      return newArrows.length > 0
    } catch {
      const latest = get(traceAuditingBackingAtom)
      set(traceAuditingBackingAtom, Object.freeze({ ...latest, busy: false }))
      return false
    }
  },
)
runTraceAuditingAtom.debugLabel = 'spreadsheet.formulaAuditing.runTrace'
