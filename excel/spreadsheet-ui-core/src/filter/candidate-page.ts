import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection/state'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import type { RustFilterValuesPage } from '../rust-workbook/filter-commands'
import { validFilterColorValue, type FilterColorSource } from './rule-types'
import { filterPanelStateAtom } from './panel-state'

interface Request {
  readonly index: number
  readonly offset: number
  readonly limit: number
  readonly colorSource: FilterColorSource
}

/** Scope a plugin candidate read to the same workbook and revision as its open filter. */
export const readNativeFilterCandidatePageAtom = atom(null,
  async (get, _set, request: Request): Promise<RustFilterValuesPage> => {
    const panel = get(filterPanelStateAtom)
    const condition = panel.conditions[request.index]
    const connection = get(rustWorkbookConnectionAtom)
    const current = () => {
      const live = get(filterPanelStateAtom)
      const item = live.conditions[request.index]
      return live.session === panel.session && live.connection === connection &&
        get(rustWorkbookConnectionAtom) === connection &&
        live.sheetId === panel.sheetId && get(activeWorkbookSheetAtom)?.id === panel.sheetId &&
        live.table === panel.table && live.revision === panel.revision &&
        get(projectionSnapshotAtom).result?.revision === panel.revision &&
        item?.col === condition?.col && item?.kind === 'color' &&
        item.nativeRule?.kind === 'color' && item.nativeRule.source === request.colorSource
    }
    if (!connection || !condition || !panel.session || !panel.sheetId ||
      typeof panel.revision !== 'number' || !current())
      throw new Error('The workbook changed. Close and reopen Filter.')
    const page = await connection.request('sheet.filterValues', {
      sheetId: panel.sheetId, table: panel.table, column: condition.col, search: '',
      expectedRevision: panel.revision, offset: request.offset, limit: request.limit,
      colorSource: request.colorSource,
    })
    if (!current()) throw new Error('The workbook changed. Close and reopen Filter.')
    if (!page || page.revision !== panel.revision || !Number.isSafeInteger(page.total) ||
      page.total < 0 || page.total > 50_000 ||
      page.offset !== Math.min(request.offset, page.total) || !Array.isArray(page.values) ||
      page.values.length !== Math.min(request.limit, page.total - page.offset) ||
      !page.values.every(entry => entry && validFilterColorValue(entry.value) &&
        Number.isSafeInteger(entry.count) && entry.count > 0 && entry.count <= 50_000) ||
      new Set(page.values.map(entry => entry.value)).size !== page.values.length)
      throw new Error('Rust returned an invalid filter colors page.')
    return page
  })
readNativeFilterCandidatePageAtom.debugLabel = 'spreadsheet.filter.readNativeCandidatePage'
