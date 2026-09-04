import { atom } from '@einfach/core'
import type {
  BackendMutationResult,
  ProjectionRevision,
  SpreadsheetCellFormat,
} from '../backend'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import {
  activeCellFormatAtom,
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustSetRangeFormatResult } from '../rust-workbook'
import { selectionSnapshotAtom } from '../selection'

export const SELECTION_TEXT_COLOR = '#c00000'
export const SELECTION_FILL_COLOR = '#fff2cc'

export type SelectionFormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'text-color'
  | 'fill-color'
  | 'horizontal-alignment'
  | 'wrap-text'
  | { readonly type: 'font-family'; readonly value: string }
  | { readonly type: 'font-size'; readonly value: number }

export type ApplySelectionFormatOutcome = 'completed' | 'blocked' | 'superseded' | 'rejected'

function nextPatch(
  current: SpreadsheetCellFormat,
  action: SelectionFormatAction,
):
  | { format: SpreadsheetCellFormat; clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[] }
  | null {
  if (typeof action !== 'string') {
    if (action.type === 'font-family') {
      const fontFamily = action.value.trim()
      return fontFamily && fontFamily.length <= 100 ? { format: { fontFamily } } : null
    }
    return Number.isFinite(action.value) && action.value > 0 && action.value <= 512
      ? { format: { fontSize: action.value } }
      : null
  }
  if (action === 'bold' || action === 'italic' || action === 'underline') {
    return { format: { [action]: !current[action] } }
  }
  if (action === 'wrap-text') {
    return { format: { wrap: !current.wrap } }
  }
  if (action === 'text-color') {
    return current.fgColor === SELECTION_TEXT_COLOR
      ? { format: {}, clearFormatFields: ['fgColor'] }
      : { format: { fgColor: SELECTION_TEXT_COLOR } }
  }
  if (action === 'fill-color') {
    return current.bgColor === SELECTION_FILL_COLOR
      ? { format: {}, clearFormatFields: ['bgColor'] }
      : { format: { bgColor: SELECTION_FILL_COLOR } }
  }
  const align = current.align === 'center' ? 'right' : current.align === 'right' ? 'left' : 'center'
  return { format: { align } }
}

function selectionStyleScope(kind: string): 'cell' | 'row' | 'column' {
  if (kind === 'row') return 'row'
  if (kind === 'column') return 'column'
  return 'cell'
}

function acknowledgementMatches(
  acknowledgement: BackendMutationResult,
  sheetId: string,
  requestId: number,
  revision: ProjectionRevision | undefined,
): boolean {
  return (
    acknowledgement.sheetId === sheetId &&
    acknowledgement.requestId === requestId &&
    acknowledgement.revision === revision
  )
}

/** Applies one selection format action and publishes the projection returned by Rust. */
export const applySelectionFormatAtom = atom(
  null,
  async (get, set, action: SelectionFormatAction): Promise<ApplySelectionFormatOutcome> => {
    const selection = get(selectionSnapshotAtom)
    const projectionWitness = get(projectionSnapshotAtom)
    const visibleRequest = projectionWitness.request
    const connection = get(rustWorkbookConnectionAtom)
    if (
      connection === null ||
      !selection.selection.sheetId ||
      visibleRequest?.kind !== 'visible-window' ||
      visibleRequest.sheetId !== selection.selection.sheetId
    ) {
      return 'blocked'
    }

    const resolution = set(resolveContentMutationAtom, {
      kind: 'set-format-range',
      sheetId: selection.selection.sheetId,
      range: selection.range,
    })
    if (resolution.status === 'blocked') return 'blocked'

    const requestId = set(issueProjectionRequestIdAtom)
    const range = resolution.ranges?.[0]
    if (requestId === null || !range) return 'blocked'

    const patch = nextPatch(get(activeCellFormatAtom), action)
    if (patch === null) return 'blocked'
    const request = Object.freeze({
      kind: 'set-format-range' as const,
      sheetId: selection.selection.sheetId,
      requestId,
      range: { ...range },
      format: patch.format,
      clearFormatFields: patch.clearFormatFields,
      writeMode: 'patch' as const,
      scope: selectionStyleScope(selection.selection.kind),
    })
    const projectionRequest = Object.freeze(
      createVisibleProjectionRequest({
        sheetId: visibleRequest.sheetId,
        window: visibleRequest.window,
        requestId,
        reason: 'toolbar',
      }),
    )

    let response: RustSetRangeFormatResult
    try {
      response = await connection.request('format.setRange', {
        request,
        projection: projectionRequest,
      })
    } catch {
      return 'rejected'
    }
    if (
      !acknowledgementMatches(
        response.acknowledgement,
        request.sheetId,
        requestId,
        response.projection.revision,
      )
    ) {
      return 'rejected'
    }

    const applied = set(applyVisibleProjectionAtom, {
      witness: projectionWitness,
      request: projectionRequest,
      result: response.projection,
    })
    return applied.status === 'applied' ? 'completed' : 'superseded'
  },
)
applySelectionFormatAtom.debugLabel = 'spreadsheet.toolbar.applySelectionFormat'
