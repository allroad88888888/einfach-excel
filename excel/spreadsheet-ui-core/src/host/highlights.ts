import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { workbookDocumentAtom, activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { viewportMetricsAtom } from '../viewport/metrics'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { projectedFreezeAtom } from '../viewport/projected-freeze'
import { getRangeScreenRectangle } from '../viewport/range-screen-rectangle'
import { projectionSnapshotAtom } from '../projection/state'
import { mergeRangeAt } from '../shared/merge'
import type { WorkbookTarget } from './operation-types'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { CellCoord } from '../shared'
import { hostCommandError } from './errors'
import type { HostCommandFailure } from './types'

export interface WorkbookHighlight extends WorkbookTarget {
  readonly id: string
  readonly color?: string
}
const stateAtom = atom<{
  connection: RustWorkbookConnection | null
  highlights: readonly WorkbookHighlight[]
}>({ connection: null, highlights: [] })
const EMPTY: readonly WorkbookHighlight[] = Object.freeze([])
export const workbookHighlightsAtom = atom((get) => {
  const state = get(stateAtom)
  return state.connection === get(rustWorkbookConnectionAtom) ? state.highlights : EMPTY
})
/** Session annotations are bounded and do not modify selection, history or workbook content. */
export const setWorkbookHighlightsAtom = atom(
  null,
  (get, set, highlights: readonly WorkbookHighlight[]): { status: 'ok' } | HostCommandFailure => {
    try {
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('WORKBOOK_NOT_READY')
      if (!Array.isArray(highlights) || highlights.length > 128)
        throw new Error('HOST_HIGHLIGHT_LIMIT')
      const sheets = get(workbookDocumentAtom).sheets,
        ids = new Set<string>()
      const next = highlights.map((item) => {
        const sheet = sheets.find((candidate) => candidate.id === item?.sheetId),
          range = item?.range
        if (
          !sheet ||
          !range ||
          typeof item.id !== 'string' ||
          !item.id ||
          item.id.length > 128 ||
          ids.has(item.id)
        )
          throw new Error('INVALID_HIGHLIGHT')
        ids.add(item.id)
        if (
          ![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
            Number.isSafeInteger,
          ) ||
          range.rowStart < 0 ||
          range.colStart < 0 ||
          range.rowEnd < range.rowStart ||
          range.colEnd < range.colStart ||
          range.rowEnd >= sheet.rowCount ||
          range.colEnd >= sheet.colCount
        )
          throw new Error('INVALID_RANGE')
      if (item.color !== undefined &&
        (typeof item.color !== 'string' || !/^#[\da-f]{6}$/i.test(item.color)))
          throw new Error('INVALID_COLOR')
        return Object.freeze({
          id: item.id,
          sheetId: item.sheetId,
          range: Object.freeze({ ...range }),
          color: item.color ?? '#6654c7',
        })
      })
      set(stateAtom, { connection, highlights: Object.freeze(next) })
      return { status: 'ok' }
    } catch (error) {
      return { status: 'error', error: hostCommandError(error) }
    }
  },
)

/** Pixel visibility excludes overscan, hidden rows/columns and regions covered by frozen panes. */
export const isWorkbookCellVisibleAtom = atom(
  null,
  (get, _set, input: CellCoord & { sheetId?: string; fully?: boolean }): boolean => {
    const sheet = get(activeWorkbookSheetAtom),
      metrics = get(viewportMetricsAtom)
    if (
      !sheet ||
      sheet.hidden ||
      (input.sheetId && input.sheetId !== sheet.id) ||
      metrics.sheetId !== sheet.id ||
      ![input.row, input.col].every(Number.isSafeInteger) ||
      input.row < 0 ||
      input.col < 0 ||
      input.row >= sheet.rowCount ||
      input.col >= sheet.colCount
    )
      return false
    const projection = get(projectionSnapshotAtom).result
    if (!projection || projection.kind !== 'visible-window' || projection.sheetId !== sheet.id)
      return false
    const range = mergeRangeAt(projection.mergedRanges ?? [], input) ?? {
      rowStart: input.row,
      rowEnd: input.row,
      colStart: input.col,
      colEnd: input.col,
    }
    const freeze = get(projectedFreezeAtom)
    const rect = getRangeScreenRectangle(
      range,
      metrics,
      get(viewportGeometrySizesAtom),
      freeze?.sheetId === sheet.id ? freeze : null,
    )
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      (!input.fully || Object.values(rect.edges).every(Boolean))
    )
  },
)
stateAtom.debugLabel = 'spreadsheet.host.highlights.state'
workbookHighlightsAtom.debugLabel = 'spreadsheet.host.highlights'
setWorkbookHighlightsAtom.debugLabel = 'spreadsheet.host.setHighlights'
isWorkbookCellVisibleAtom.debugLabel = 'spreadsheet.host.isCellVisible'
