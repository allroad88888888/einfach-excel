import type { CellRange, ToolbarMutationStep } from '@einfach/spreadsheet-ui-core'
import { isVisibleProjectionResult } from '../provider'
import type { MergePreset } from './MergeDropdown'
import type { ToolbarActionDeps } from './ToolbarActionDeps'

interface ToolbarMutationGateway {
  dispatchToolbarMutation: (input: {
    affectedRange: CellRange
    operation: 'merge' | 'unmerge'
    sheetId: string
    steps: ToolbarMutationStep[]
  }) => void
}

/** Executes the existing merge menu presets through the Core mutation lifecycle. */
export function useToolbarMergeCommands(deps: ToolbarActionDeps, gateway: ToolbarMutationGateway) {
  function activeCellMergeRange(): CellRange | null {
    const snapshot = deps.projectionSnapshot()
    const selection = deps.selectionSnapshot()
    if (
      !isVisibleProjectionResult(snapshot.result) ||
      snapshot.result.sheetId !== selection.selection.sheetId
    ) {
      return null
    }
    const active = selection.activeCell
    for (const anchor of snapshot.result.cells) {
      if (!anchor.mergedSpan) continue
      const range = {
        rowStart: anchor.row,
        rowEnd: anchor.row + Math.max(1, Math.trunc(anchor.mergedSpan.rows)) - 1,
        colStart: anchor.col,
        colEnd: anchor.col + Math.max(1, Math.trunc(anchor.mergedSpan.cols)) - 1,
      }
      if (
        active.row >= range.rowStart &&
        active.row <= range.rowEnd &&
        active.col >= range.colStart &&
        active.col <= range.colEnd
      )
        return range
    }
    return null
  }

  function executeMergePreset(preset: MergePreset) {
    const sheetId = deps.getMutationSheetId()
    if (!sheetId) return
    const selectionRange = deps.selectionSnapshot().range
    if (preset === 'unmerge') {
      const range = activeCellMergeRange() ?? selectionRange
      gateway.dispatchToolbarMutation({
        sheetId,
        operation: 'unmerge',
        affectedRange: range,
        steps: [{ kind: 'unmerge-range', range }],
      })
      return
    }
    if (preset === 'merge-center') {
      gateway.dispatchToolbarMutation({
        sheetId,
        operation: 'merge',
        affectedRange: selectionRange,
        steps: [{ kind: 'merge-range', range: selectionRange }],
      })
      return
    }
    const steps = mergeAxisSteps(preset, selectionRange)
    if (steps.length)
      gateway.dispatchToolbarMutation({
        sheetId,
        operation: 'merge',
        affectedRange: selectionRange,
        steps,
      })
  }

  function handleMergeSelect(preset: MergePreset) {
    deps.closeSurface()
    executeMergePreset(preset)
  }

  return { activeCellMergeRange, handleMergeSelect }
}

function mergeAxisSteps(
  preset: Exclude<MergePreset, 'merge-center' | 'unmerge'>,
  range: CellRange,
): ToolbarMutationStep[] {
  if (preset === 'across-rows') {
    if (range.colEnd <= range.colStart) return []
    return Array.from({ length: range.rowEnd - range.rowStart + 1 }, (_, offset) => ({
      kind: 'merge-range',
      range: {
        rowStart: range.rowStart + offset,
        rowEnd: range.rowStart + offset,
        colStart: range.colStart,
        colEnd: range.colEnd,
      },
    }))
  }
  if (range.rowEnd <= range.rowStart) return []
  return Array.from({ length: range.colEnd - range.colStart + 1 }, (_, offset) => ({
    kind: 'merge-range',
    range: {
      rowStart: range.rowStart,
      rowEnd: range.rowEnd,
      colStart: range.colStart + offset,
      colEnd: range.colStart + offset,
    },
  }))
}
