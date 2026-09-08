import { atom } from '@einfach/core'
import type {
  BackendMutationResult,
  ProjectionRevision,
  SpreadsheetBorders,
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
import { nextNumberFormat, type NumberFormatAction } from './number-format-action'

export {
  SELECTION_PERCENT_FORMAT,
  SELECTION_CURRENCY_FORMAT,
  SELECTION_THOUSANDS_FORMAT,
} from './number-format-action'

export const SELECTION_TEXT_COLOR = '#c00000'
export const SELECTION_FILL_COLOR = '#fff2cc'
export const SELECTION_BORDER_COLOR = '#7f7f7f'

const SELECTION_BORDER_SPEC = Object.freeze({
  style: 'thin' as const,
  color: SELECTION_BORDER_COLOR,
})

export const SELECTION_ALL_BORDERS = Object.freeze({
  top: SELECTION_BORDER_SPEC,
  right: SELECTION_BORDER_SPEC,
  bottom: SELECTION_BORDER_SPEC,
  left: SELECTION_BORDER_SPEC,
}) satisfies SpreadsheetBorders

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

export type SelectionFormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'text-color'
  | 'fill-color'
  | 'horizontal-alignment'
  | 'vertical-alignment'
  | 'text-rotation'
  | 'all-borders'
  | 'wrap-text'
  | 'increase-indent'
  | 'decrease-indent'
  | NumberFormatAction
  | { readonly type: 'font-family'; readonly value: string }
  | { readonly type: 'font-size'; readonly value: number }

export type ApplySelectionFormatOutcome = 'completed' | 'blocked' | 'superseded' | 'rejected'

function nextPatch(
  current: SpreadsheetCellFormat,
  action: SelectionFormatAction,
  numericValue: number | undefined,
): {
  format: SpreadsheetCellFormat
  clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[]
} | null {
  if (typeof action !== 'string') {
    if (action.type === 'font-family') {
      const fontFamily = action.value.trim()
      return fontFamily && fontFamily.length <= 100 ? { format: { fontFamily } } : null
    }
    return Number.isFinite(action.value) && action.value > 0 && action.value <= 512
      ? { format: { fontSize: action.value } }
      : null
  }
  if (
    action === 'bold' ||
    action === 'italic' ||
    action === 'underline' ||
    action === 'strikethrough'
  ) {
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
  if (action === 'vertical-alignment') {
    const verticalAlign =
      current.verticalAlign === 'top'
        ? 'center'
        : current.verticalAlign === 'center'
          ? 'bottom'
          : 'top'
    return { format: { verticalAlign } }
  }
  if (action === 'text-rotation') {
    if (current.rotation === -45) {
      return { format: { rotation: 0 } }
    }
    return { format: { rotation: current.rotation === 45 ? -45 : 45 } }
  }
  if (action === 'all-borders') {
    const enabled = BORDER_SIDES.every((side) => {
      const border = current.borders?.[side]
      return border?.style === 'thin' && border.color === SELECTION_BORDER_COLOR
    })
    return enabled
      ? { format: {}, clearFormatFields: ['borders'] }
      : { format: { borders: SELECTION_ALL_BORDERS } }
  }
  if (action === 'increase-indent') {
    return { format: { indent: Math.min((current.indent ?? 0) + 1, 15) } }
  }
  if (action === 'decrease-indent') {
    return { format: { indent: Math.max((current.indent ?? 0) - 1, 0) } }
  }
  if (
    action === 'percent-format' ||
    action === 'currency-format' ||
    action === 'thousands-format' ||
    action === 'general-format' ||
    action === 'increase-decimal' ||
    action === 'decrease-decimal'
  ) {
    const numberFormat = nextNumberFormat(current.numberFormat, action, numericValue)
    return numberFormat ? { format: { numberFormat } } : null
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

    const activeCell = projectionWitness.result?.cells.find(
      (cell) => cell.row === selection.activeCell.row && cell.col === selection.activeCell.col,
    )
    const patch = nextPatch(get(activeCellFormatAtom), action, activeCell?.numericValue)
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
