import { atom } from '@einfach/core'
import { workbookDocumentAtom, activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { goToReferenceAvailableAtom } from '../go-to/reference-command'
import { applyGoToTargetAtom } from '../go-to'
import { scrollToCellAtom } from '../viewport/metrics'
import { initializeViewportMetricsAtom } from '../viewport/metric-commands'
import { viewportMetricsAtom } from '../viewport/metrics'
import { zoomBySheetAtom } from '../zoom/state'
import { hostCommandError } from './errors'
import type { WorkbookTarget } from './operation-types'
import type { HostCommandFailure } from './types'

export type WorkbookViewAction =
  | ({ readonly type: 'select'; readonly scroll?: boolean } & WorkbookTarget)
  | { readonly type: 'activate'; readonly sheetId: string }
  | { readonly type: 'scroll'; readonly row: number; readonly col: number }
  | { readonly type: 'zoom'; readonly percent: number; readonly sheetId?: string }

/** Session-only navigation goes through the same selection/viewport commands as the grid. */
export const controlWorkbookViewAtom = atom(null, (get, set, input: WorkbookViewAction):
  { status: 'ok' } | HostCommandFailure => {
  try {
    if (!get(goToReferenceAvailableAtom)) throw new Error('HOST_VIEW_BUSY')
    const active = get(activeWorkbookSheetAtom)
    const id = 'sheetId' in input ? input.sheetId ?? active?.id : active?.id
    const sheet = get(workbookDocumentAtom).sheets.find(item => item.id === id && !item.hidden)
    if (!sheet) throw new Error('INVALID_SHEET')
    const range = input.type === 'select' ? input.range : input.type === 'scroll'
      ? { rowStart: input.row, rowEnd: input.row, colStart: input.col, colEnd: input.col } : null
    if (range && (![range.rowStart, range.rowEnd, range.colStart, range.colEnd]
      .every(Number.isSafeInteger) || range.rowStart < 0 || range.colStart < 0
      || range.rowEnd < range.rowStart || range.colEnd < range.colStart
      || range.rowEnd >= sheet.rowCount || range.colEnd >= sheet.colCount)) throw new Error('INVALID_RANGE')
    if (input.type === 'zoom') {
      if (!Number.isInteger(input.percent) || input.percent < 10 || input.percent > 400)
        throw new Error('INVALID_ZOOM')
      set(zoomBySheetAtom, { ...get(zoomBySheetAtom), [sheet.id]: input.percent })
      return { status: 'ok' }
    }
    if (active?.id !== sheet.id) set(activateWorkbookSheetAtom, sheet)
    set(initializeViewportMetricsAtom, { ...get(viewportMetricsAtom), sheetId: sheet.id,
      rowCount: sheet.rowCount, colCount: sheet.colCount,
      rowHeight: sheet.defaults?.rowHeight ?? 28, colWidth: sheet.defaults?.colWidth ?? 120 })
    if (input.type === 'select') set(applyGoToTargetAtom, { sheetId: sheet.id, range: input.range })
    if (range && (input.type === 'scroll' || (input.type === 'select' && input.scroll !== false)))
      set(scrollToCellAtom, { coord: { row: range.rowStart, col: range.colStart } })
    return { status: 'ok' }
  } catch (error) { return { status: 'error', error: hostCommandError(error) } }
})
controlWorkbookViewAtom.debugLabel = 'spreadsheet.host.controlView'
