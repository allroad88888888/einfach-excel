import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection/state'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import type { RustFilterValuesPage } from '../rust-workbook/filter-commands'
import { nativeFilterFeedbackAtom } from './command'
import { filterPanelStateAtom, type FilterValuesBrowser } from './panel-state'
import { filterSelectionWithinBudget } from '../advanced-filter/contracts'

const pageSize = 50
export const nativeFilterValuesAtom = atom((get) => {
  const state = get(filterPanelStateAtom)
  const browser = state.browser
  if (!browser) return null
  const condition = state.conditions[browser.index]
  return { ...browser, selected: condition?.kind === 'list' ? condition.values : [] }
})
export type FilterValuesAction = { type: 'open'; index: number } | { type: 'search-text'; value: string }
  | 'search'
  | { type: 'toggle'; value: string } | 'next' | 'previous' | 'retry' | 'close'
  | 'select-page' | 'clear-selection' | 'select-search' | 'clear-search'

/** Rust 页数据必须完整、唯一且匹配页界；拒绝坏页，不在前端修补或重新排序。 */
function validPage(page: RustFilterValuesPage, offset: number): boolean {
  return !!page && Number.isSafeInteger(page.total) && page.total >= 0 && page.total <= 50_000 &&
    page.offset === Math.min(offset, page.total) && Array.isArray(page.values) &&
    page.values.length === Math.min(pageSize, page.total - page.offset) &&
    page.values.every((entry) => entry && typeof entry.value === 'string' &&
      Number.isSafeInteger(entry.count) && entry.count > 0 && entry.count <= 50_000) &&
    new Set(page.values.map((entry) => entry.value)).size === page.values.length
}

/** 每次只取一页；对象身份丢弃关窗、换列、重开之后的旧响应，不加请求生命周期层。 */
export const configureNativeFilterValuesAtom = atom(null,
  async (get, set, action: FilterValuesAction): Promise<boolean> => {
    if (get(nativeFilterFeedbackAtom).busy) return false
    const state = get(filterPanelStateAtom)
    if (action === 'close') {
      set(filterPanelStateAtom, { ...state, browser: undefined })
      return true
    }
    const opening = typeof action === 'object' && action.type === 'open'
    const browser = state.browser
    const index = opening ? action.index : browser?.index
    const condition = index === undefined ? undefined : state.conditions[index]
    if (!state.sheetId || index === undefined || !condition) return false
    const connection = get(rustWorkbookConnectionAtom)
    const fail = (error: string) => {
      set(filterPanelStateAtom, { ...get(filterPanelStateAtom), browser: {
        index, search: get(filterPanelStateAtom).browser?.search ?? '', busy: false, error,
      } })
      return false
    }
    if (!connection || connection !== state.connection ||
      get(activeWorkbookSheetAtom)?.id !== state.sheetId ||
      typeof state.revision !== 'number' ||
      get(projectionSnapshotAtom).result?.revision !== state.revision)
      return fail('The workbook changed. Close and reopen Filter.')
    if (typeof action === 'object' && action.type === 'search-text') {
      if (!browser || action.value.length > 32767) return false
      set(filterPanelStateAtom, { ...state,
        browser: { index, search: action.value, busy: false, error: '' } })
      return true
    }
    if (!opening && (!browser || browser.busy)) return false

    if (action === 'select-page' || action === 'clear-selection' ||
      (typeof action === 'object' && action.type === 'toggle')) {
      if (!browser?.page) return false
      const selected = new Set(condition.kind === 'list' ? condition.values : [])
      if (action === 'clear-selection') selected.clear()
      else if (action === 'select-page') browser.page.values.forEach((entry) => selected.add(entry.value))
      else {
        if (!browser.page.values.some((entry) => entry.value === action.value)) return false
        if (selected.has(action.value)) selected.delete(action.value)
        else selected.add(action.value)
      }
      if (!filterSelectionWithinBudget([...selected])) {
        set(filterPanelStateAtom, { ...state, browser: { ...browser,
          error: 'Choose at most 1,000 values within 1 MiB, or narrow the search.' } })
        return false
      }
      set(filterPanelStateAtom, { ...state, error: '', browser: { ...browser, error: '' },
        conditions: state.conditions.map((item, i) =>
        i === index ? { ...item, kind: 'list' as const, values: [...selected] } : item) })
      return true
    }
    if (action === 'select-search' || action === 'clear-search') {
      if (!browser?.page) return false
      const pending: FilterValuesBrowser = { ...browser, busy: true, error: '' }
      set(filterPanelStateAtom, { ...state, browser: pending })
      try {
        const matches = await connection.request('sheet.filterValues', { sheetId: state.sheetId,
          column: condition.col, table: state.table, search: browser.search, offset: 0,
          limit: pageSize, allMatches: true, expectedRevision: state.revision })
        if (get(filterPanelStateAtom).browser !== pending) return false
        if (get(rustWorkbookConnectionAtom) !== connection ||
          get(activeWorkbookSheetAtom)?.id !== state.sheetId ||
          get(projectionSnapshotAtom).result?.revision !== state.revision)
          throw new Error('The workbook changed. Close and reopen Filter.')
        if (!matches || matches.revision !== state.revision || matches.offset !== 0 ||
          !Number.isSafeInteger(matches.total) || matches.total < 0 || matches.total > 1000 ||
          !Array.isArray(matches.values) || matches.values.length !== matches.total ||
          !matches.values.every((entry) => entry && typeof entry.value === 'string' &&
            Number.isSafeInteger(entry.count) && entry.count > 0 && entry.count <= 50_000) ||
          new Set(matches.values.map((entry) => entry.value)).size !== matches.total ||
          !filterSelectionWithinBudget(matches.values.map((entry) => entry.value)))
          throw new Error('Rust returned incomplete search matches. The selection was not changed.')
        const selected = new Set(condition.kind === 'list' ? condition.values : [])
        for (const { value } of matches.values) {
          if (action === 'select-search') selected.add(value)
          else selected.delete(value)
        }
        if (!filterSelectionWithinBudget([...selected]))
          throw new Error('All search matches exceed the 1,000-value or 1 MiB selection budget. Narrow the search.')
        set(filterPanelStateAtom, { ...state, error: '', browser: { ...browser, error: '' },
          conditions: state.conditions.map((item, i) => i === index
            ? { ...item, kind: 'list' as const, values: [...selected] } : item) })
        return true
      } catch (error) {
        if (get(filterPanelStateAtom).browser !== pending) return false
        set(filterPanelStateAtom, { ...state, browser: { ...browser,
          error: error instanceof Error ? error.message : String(error) } })
        return false
      }
    }
    let offset = 0
    if (action === 'next' || action === 'previous') {
      if (!browser?.page || browser.error) return false
      offset = browser.page.offset + (action === 'next' ? pageSize : -pageSize)
      if (offset < 0 || offset >= browser.page.total) return false
    }
    const search = opening ? '' : browser?.search ?? ''
    if (search.length > 32767) return fail('Search text is too long.')
    const pending: FilterValuesBrowser = { index, search, busy: true, error: '' }
    set(filterPanelStateAtom, { ...state, browser: pending })
    try {
      const page = await connection.request('sheet.filterValues', { sheetId: state.sheetId,
        column: condition.col, table: state.table, search, offset, limit: pageSize,
        expectedRevision: state.revision })
      if (get(filterPanelStateAtom).browser !== pending) return false
      if (get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== state.sheetId ||
        get(projectionSnapshotAtom).result?.revision !== state.revision)
        return fail('The workbook changed. Close and reopen Filter.')
      if (!page || page.revision !== state.revision || !validPage(page, offset))
        throw new Error('Rust returned an invalid filter values page. Try again.')
      set(filterPanelStateAtom, { ...get(filterPanelStateAtom),
        browser: { ...pending, busy: false, page } })
      return true
    } catch (error) {
      if (get(filterPanelStateAtom).browser !== pending) return false
      return fail(error instanceof Error ? error.message : String(error))
    }
  })
