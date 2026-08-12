import { atom } from '@einfach/core'
import {
  createDeleteColumnsOperation,
  createInsertColumnsOperation,
  createInsertRowsOperation,
  runFilterVisibleRowDeleteAtom,
  runStructureOperationAtom,
} from '../operations'
import { groupSelectionAtom, ungroupSelectionAtom } from '../outline'
import { selectionSnapshotAtom } from '../selection'
import { hideColumnsAtom, hideRowsAtom, unhideViewportSelectionAtom } from '../viewport/hidden'
import {
  selectedAxisCount,
  selectedAxisIndices,
  resolveStructuralSelectionTarget,
} from './selection-target'
import type {
  RunStructuralCommandInput,
  StructuralCommand,
  StructuralCommandOutcome,
  StructuralCommandSource,
} from './types'

const structuralCommands: ReadonlySet<StructuralCommand> = new Set([
  'insert-rows-above',
  'insert-rows-below',
  'delete-rows',
  'insert-columns-left',
  'insert-columns-right',
  'delete-columns',
  'hide-rows',
  'unhide-rows',
  'hide-columns',
  'unhide-columns',
  'group-rows',
  'ungroup-rows',
  'group-columns',
  'ungroup-columns',
])

/**
 * Executes a validated structure command against the canonical selection
 * atom. This is a routing atom only: operations, hidden state, and outline
 * metadata remain owned by their existing domain atoms.
 */
export const runStructuralCommandAtom = atom(
  null,
  async (get, set, input: RunStructuralCommandInput): Promise<StructuralCommandOutcome> => {
    if (!input || !structuralCommands.has(input.command)) return 'invalid'

    const target = resolveStructuralSelectionTarget(get(selectionSnapshotAtom))
    if (target === null) return 'invalid'

    const source = input.source ?? {}
    const operationSource = input.operationSource ?? 'selection'

    switch (input.command) {
      case 'insert-rows-above':
        return runStructureCommand(set, {
          input,
          source,
          intent: createInsertRowsOperation({
            sheetId: target.sheetId,
            rowIndex: target.rowStart,
            count: 1,
            source: operationSource,
          }),
        })
      case 'insert-rows-below':
        return runStructureCommand(set, {
          input,
          source,
          intent: createInsertRowsOperation({
            sheetId: target.sheetId,
            rowIndex: target.rowEnd + 1,
            count: 1,
            source: operationSource,
          }),
        })
      case 'delete-rows':
        if (!input.refreshProjection || typeof input.historyEntryRecorder !== 'function')
          return 'invalid'
        return set(runFilterVisibleRowDeleteAtom, {
          sheetId: target.sheetId,
          rowIndex: target.rowStart,
          count: selectedAxisCount(target.rowStart, target.rowEnd),
          source,
          refreshProjection: input.refreshProjection,
          historyEntryRecorder: input.historyEntryRecorder,
          timeoutMs: input.timeoutMs,
          operationSource,
        })
      case 'insert-columns-left':
        return runStructureCommand(set, {
          input,
          source,
          intent: createInsertColumnsOperation({
            sheetId: target.sheetId,
            colIndex: target.colStart,
            count: 1,
            source: operationSource,
          }),
        })
      case 'insert-columns-right':
        return runStructureCommand(set, {
          input,
          source,
          intent: createInsertColumnsOperation({
            sheetId: target.sheetId,
            colIndex: target.colEnd + 1,
            count: 1,
            source: operationSource,
          }),
        })
      case 'delete-columns':
        return runStructureCommand(set, {
          input,
          source,
          intent: createDeleteColumnsOperation({
            sheetId: target.sheetId,
            colIndex: target.colStart,
            count: selectedAxisCount(target.colStart, target.colEnd),
            source: operationSource,
          }),
        })
      case 'hide-rows':
        return set(hideRowsAtom, {
          sheetId: target.sheetId,
          indices: selectedAxisIndices(target.rowStart, target.rowEnd),
          source,
        })
      case 'unhide-rows':
        return set(unhideViewportSelectionAtom, { action: 'unhide-rows', source })
      case 'hide-columns':
        return set(hideColumnsAtom, {
          sheetId: target.sheetId,
          indices: selectedAxisIndices(target.colStart, target.colEnd),
          source,
        })
      case 'unhide-columns':
        return set(unhideViewportSelectionAtom, { action: 'unhide-columns', source })
      case 'group-rows':
        return set(groupSelectionAtom, { axis: 'row', source })
      case 'ungroup-rows':
        return set(ungroupSelectionAtom, { axis: 'row', source })
      case 'group-columns':
        return set(groupSelectionAtom, { axis: 'column', source })
      case 'ungroup-columns':
        return set(ungroupSelectionAtom, { axis: 'column', source })
    }
  },
)
runStructuralCommandAtom.debugLabel = 'spreadsheet.structuralCommands.run'

function runStructureCommand(
  set: Parameters<typeof runStructureOperationAtom.write>[1],
  {
    input,
    source,
    intent,
  }: {
    readonly input: RunStructuralCommandInput
    readonly source: StructuralCommandSource
    readonly intent: Parameters<typeof runStructureOperationAtom.write>[2]['intent']
  },
): Promise<StructuralCommandOutcome> {
  if (!input.refreshProjection || typeof input.historyEntryRecorder !== 'function') {
    return Promise.resolve('invalid')
  }
  return set(runStructureOperationAtom, {
    intent,
    source,
    refreshProjection: input.refreshProjection,
    historyEntryRecorder: input.historyEntryRecorder,
    timeoutMs: input.timeoutMs,
  })
}
