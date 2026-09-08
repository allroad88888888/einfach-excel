import { atom } from '@einfach/core'
import type { SpreadsheetCellFormat } from '../backend'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { editingSessionAtom } from '../editing/session-atoms'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustClearRangeMode, RustSetRangeFormatResult } from '../rust-workbook/commands'
import { selectionSnapshotAtom } from '../selection'
import { selectionStructureFeedbackAtom } from './selection-structure-state'
import { selectionMergeFeedbackAtom } from './selection-merge-state'

export type SelectionMutationOutcome = 'completed' | 'blocked' | 'superseded' | 'rejected'
type SelectionMutation =
  | {
      readonly kind: 'format'
      readonly format: SpreadsheetCellFormat
      readonly clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[]
    }
  | { readonly kind: 'clear'; readonly mode: RustClearRangeMode }

/** 区域写入共用一次保护检查、一次 Rust RPC 和一次返回投影发布。 */
export const runSelectionMutationAtom = atom(
  null,
  async (get, set, input: SelectionMutation): Promise<SelectionMutationOutcome> => {
    if (get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy) return 'blocked'
    const selection = get(selectionSnapshotAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    const connection = get(rustWorkbookConnectionAtom)
    if (
      !connection ||
      !selection.selection.sheetId ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== selection.selection.sheetId
    )
      return 'blocked'
    if (input.kind === 'clear' && get(editingSessionAtom).source !== null) return 'blocked'
    const resolution = set(resolveContentMutationAtom, {
      kind: input.kind === 'format' ? 'set-format-range' : 'clear-range',
      sheetId: selection.selection.sheetId,
      range: selection.range,
    })
    if (resolution.status === 'blocked') return 'blocked'
    const range = resolution.ranges?.[0]
    const requestId = set(issueProjectionRequestIdAtom)
    if (!range || requestId === null) return 'blocked'

    const base = {
      sheetId: selection.selection.sheetId,
      requestId,
      range: { ...range },
      scope:
        selection.selection.kind === 'row'
          ? ('row' as const)
          : selection.selection.kind === 'column'
            ? ('column' as const)
            : ('cell' as const),
    }
    const projection = createVisibleProjectionRequest({
      sheetId: visible.sheetId,
      window: visible.window,
      viewport: visible.viewport,
      requestId,
      reason: 'toolbar',
    })
    let result: RustSetRangeFormatResult
    try {
      result =
        input.kind === 'format'
          ? await connection.request('format.setRange', {
              request: {
                ...base,
                kind: 'set-format-range',
                format: input.format,
                clearFormatFields: input.clearFormatFields,
                writeMode: 'patch',
              },
              projection,
            })
          : await connection.request('range.clear', {
              request: { ...base, mode: input.mode },
              projection,
            })
    } catch {
      return 'rejected'
    }
    const ack = result.acknowledgement
    if (
      ack.sheetId !== base.sheetId ||
      ack.requestId !== requestId ||
      ack.revision !== result.projection.revision
    )
      return 'rejected'
    const applied = set(applyVisibleProjectionAtom, {
      witness,
      request: projection,
      result: result.projection,
    })
    return applied.status === 'applied' ? 'completed' : 'superseded'
  },
)
runSelectionMutationAtom.debugLabel = 'spreadsheet.toolbar.runSelectionMutation'

/** 清除命令只指定模式，目标范围始终来自当前选区。 */
export const clearSelectionAtom = atom(null, (_get, set, mode: RustClearRangeMode) =>
  set(runSelectionMutationAtom, { kind: 'clear', mode }),
)
clearSelectionAtom.debugLabel = 'spreadsheet.toolbar.clearSelection'
