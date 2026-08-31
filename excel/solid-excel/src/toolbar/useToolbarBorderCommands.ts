import type { ToolbarMutationStep } from '@einfach/spreadsheet-ui-core'
import { isVisibleProjectionResult } from '../provider'
import type { BordersPreset } from './BordersDropdown'
import type { ToolbarActionDeps } from './ToolbarActionDeps'
import { bordersPatchForCell, cloneToolbarFormat, rangeCellCount } from './ToolbarFormatLogic'

interface ToolbarMutationGateway {
  dispatchToolbarMutation: (input: {
    affectedRange: ReturnType<ToolbarActionDeps['selectionSnapshot']>['range']
    operation: 'border-batch'
    sheetId: string
    steps: ToolbarMutationStep[]
  }) => void
  resolveFormatSourceRanges: (
    sheetId: string,
    range: ReturnType<ToolbarActionDeps['selectionSnapshot']>['range'],
  ) => ReturnType<ToolbarActionDeps['selectionSnapshot']>['range'][] | null
}

/** Applies per-cell borders while retaining each projected cell's existing sides. */
export function useToolbarBorderCommands(deps: ToolbarActionDeps, gateway: ToolbarMutationGateway) {
  function projectionCellMap() {
    const snapshot = deps.projectionSnapshot()
    const selection = deps.selectionSnapshot()
    const cells = new Map<string, typeof snapshot.result extends infer _Result ? unknown : never>()
    if (
      !isVisibleProjectionResult(snapshot.result) ||
      snapshot.result.sheetId !== selection.selection.sheetId
    ) {
      return cells
    }
    for (const cell of snapshot.result.cells) cells.set(`${cell.row}:${cell.col}`, cell)
    return cells
  }

  function executeBordersPreset(preset: BordersPreset, sheetId: string) {
    const range = deps.selectionSnapshot().range
    const cells = projectionCellMap()
    const steps: ToolbarMutationStep[] = []
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      for (let col = range.colStart; col <= range.colEnd; col += 1) {
        const existing = cells.get(`${row}:${col}`) as
          | { format?: ReturnType<ToolbarActionDeps['activeCellFormat']> }
          | undefined
        const next = cloneToolbarFormat(existing?.format)
        const borders = bordersPatchForCell(preset, row, col, range, next.borders)
        if (!borders || Object.keys(borders).length === 0) delete next.borders
        else next.borders = borders
        const sourceRanges = gateway.resolveFormatSourceRanges(sheetId, {
          rowStart: row,
          rowEnd: row,
          colStart: col,
          colEnd: col,
        })
        if (sourceRanges === null) return
        steps.push({ kind: 'set-format-range', range: sourceRanges[0], format: next })
      }
    }
    gateway.dispatchToolbarMutation({
      sheetId,
      operation: 'border-batch',
      affectedRange: range,
      steps,
    })
  }

  function handleBordersSelect(preset: BordersPreset) {
    deps.closeSurface()
    const range = deps.selectionSnapshot().range
    if (preset === 'inner' && rangeCellCount(range) <= 1) return
    const sheetId = deps.getMutationSheetId()
    if (sheetId) executeBordersPreset(preset, sheetId)
  }

  return { handleBordersSelect }
}
