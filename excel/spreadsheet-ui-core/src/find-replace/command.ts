import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom, selectionRegionsAtom } from '../selection'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { applyProjectionSizes } from '../projection/projection-sizes'
import { findReplaceStateAtom, type FindReplaceForm } from './state'
import { navigateFindMatchAtom } from './navigation'

export type FindReplaceAction =
  | 'close'
  | 'next'
  | 'previous'
  | 'replace-current'
  | 'replace-all'
  | 'find-all'
  | { readonly page: number }
  | { readonly match: number }
  | { readonly open: 'find' | 'replace' }
  | { readonly form: Partial<FindReplaceForm> }

/** 一个事件对应一个命令；Rust 拥有匹配与写入，atom 只保存可见面板状态。 */
export const runFindReplaceAtom = atom(
  null,
  async (get, set, action: FindReplaceAction): Promise<boolean> => {
    const state = get(findReplaceStateAtom)
    if (state.busy === 'replace') return false
    if (action === 'close') {
      set(findReplaceStateAtom, {
        ...state,
        open: false,
        origin: null,
        busy: null,
        result: null,
        error: null,
        notice: null,
      })
      return true
    }
    const connection = get(rustWorkbookConnectionAtom)
    const active = get(activeWorkbookSheetAtom)
    if (!connection || !active || get(editingSessionAtom).source !== null) return false
    if (typeof action === 'object' && 'open' in action) {
      if (state.open) {
        set(findReplaceStateAtom, { ...state, tab: action.open, busy: null })
        return true
      }
      const selection = get(selectionSnapshotAtom)
      set(findReplaceStateAtom, {
        ...state,
        open: true,
        tab: action.open,
        busy: null,
        result: null,
        error: null,
        notice: null,
        origin: {
          sheetId: active.id,
          range: { ...selection.range },
          regions: get(selectionRegionsAtom).length,
        },
      })
      return true
    }
    if (!state.open || !state.origin) return false
    if (typeof action === 'object' && 'form' in action) {
      const onlyReplacement = Object.keys(action.form).every((key) => key === 'replacement')
      set(findReplaceStateAtom, {
        ...state,
        form: { ...state.form, ...action.form },
        busy: null,
        result: onlyReplacement ? state.result : null,
        error: null,
        notice: null,
      })
      return true
    }
    if (state.busy) return false
    const fail = (error: string) => {
      set(findReplaceStateAtom, {
        ...get(findReplaceStateAtom),
        busy: null,
        result: null,
        error,
        notice: null,
      })
      return false
    }
    const { needle, replacement, caseSensitive, wholeCell, lookIn, scope, wildcards } = state.form
    if (!needle.length) return fail('Enter text to find.')
    const workbook = get(workbookDocumentAtom)
    const sheets =
      scope === 'workbook'
        ? workbook.sheets
        : workbook.sheets.filter((sheet) => sheet.id === state.origin!.sheetId)
    if (!sheets.length) return fail('The search worksheet no longer exists.')
    if (scope === 'current-selection' && state.origin.regions !== 1)
      return fail('Choose one contiguous selection before opening Find.')
    const targets = sheets.map((sheet) => ({
      sheetId: sheet.id,
      range:
        scope === 'current-selection'
          ? state.origin!.range
          : {
              rowStart: 0,
              colStart: 0,
              rowEnd: sheet.rowCount - 1,
              colEnd: sheet.colCount - 1,
            },
    }))
    const query = { needle, caseSensitive, wholeCell, lookIn, wildcards }
    const requested =
      typeof action === 'object' ? ('page' in action ? action.page : action.match) : null
    if (requested !== null && (!Number.isSafeInteger(requested) || requested < 0))
      return fail('Invalid result position.')
    const picking = typeof action === 'object' && 'match' in action
    const listing = action === 'find-all' || (typeof action === 'object' && 'page' in action)
    if (picking && (!state.result?.page || requested! >= state.result.total))
      return fail('Find all before choosing a result.')
    const writing = action === 'replace-current' || action === 'replace-all'
    if (
      writing &&
      sheets.some(
        (sheet) => getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected',
      )
    )
      return fail('Unprotect the target worksheets before replacing.')
    if (action === 'replace-current' && !state.result?.current)
      return fail('Find a match before replacing it.')
    const pending = {
      ...state,
      busy: writing ? ('replace' as const) : ('find' as const),
      error: null,
      notice: null,
    }
    set(findReplaceStateAtom, pending)
    const current = () =>
      get(findReplaceStateAtom) === pending && get(rustWorkbookConnectionAtom) === connection
    try {
      // 同步写先锁住重复操作；退出当前 React 事件批次后发布等待态，慢 Worker 时按钮也立即禁用。
      await Promise.resolve()
      if (!current()) return false
      set(findReplaceStateAtom, pending)
      if (!writing) {
        let index =
          requested ??
          (action === 'find-all'
            ? 0
            : state.result && state.result.total > 0
              ? (state.result.index + (action === 'previous' ? -1 : 1) + state.result.total) %
                state.result.total
              : 0)
        let page = await connection.request('workbook.find', {
          targets,
          query,
          offset: index,
          limit: listing ? 100 : 1,
        })
        if (!current()) return false
        if (picking && page.revision !== state.result?.revision)
          return fail('The workbook changed. Find all again before choosing a result.')
        if (page.total > 0 && !page.matches.length) {
          index = action === 'previous' ? page.total - 1 : 0
          page = await connection.request('workbook.find', {
            targets,
            query,
            offset: index,
            limit: listing ? 100 : 1,
          })
          if (!current()) return false
        }
        const match = page.matches[0] ?? null
        if (get(workbookDocumentAtom) !== workbook) return fail('The workbook changed. Find again.')
        const notice = match ? set(navigateFindMatchAtom, match) : 'No matches found.'
        set(findReplaceStateAtom, {
          ...pending,
          busy: null,
          notice,
          result: {
            index,
            total: page.total,
            current: match,
            revision: page.revision,
            page: listing
              ? { offset: index, matches: page.matches }
              : page.revision === state.result?.revision
                ? state.result?.page
                : undefined,
          },
        })
        return true
      }
      const witness = get(projectionSnapshotAtom)
      const visible = witness.request
      if (
        witness.status !== 'ready' ||
        visible?.kind !== 'visible-window' ||
        visible.sheetId !== active.id
      )
        return fail('Wait for the worksheet to finish loading.')
      const revision = state.result?.revision ?? witness.result?.revision
      if (typeof revision !== 'number') return fail('Wait for the worksheet to finish loading.')
      const requestId = set(issueProjectionRequestIdAtom)
      if (requestId === null) return fail('Cannot issue a worksheet request.')
      const projection = createVisibleProjectionRequest({
        sheetId: active.id,
        requestId,
        window: visible.window,
        viewport: visible.viewport,
        reason: 'toolbar',
      })
      const result = await connection.request('workbook.replace', {
        targets,
        query,
        replacement,
        expectedRevision: revision,
        projection,
        ...(action === 'replace-current' ? { current: state.result!.current! } : {}),
      })
      if (!current()) return false
      if (!validateProjectionResult(result.projection, { request: projection }).ok)
        throw new Error('Rust returned a mismatched replacement projection.')
      applyProjectionSizes(get, set, {
        ...result.projection,
        window: {
          rowStart: 0,
          colStart: 0,
          rowEnd: active.rowCount - 1,
          colEnd: active.colCount - 1,
        },
        ...result.sizes,
      })
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(findReplaceStateAtom, {
        ...pending,
        busy: null,
        result: null,
        notice: `Replaced ${result.occurrences} occurrence(s) in ${result.cells} cell(s). Find next to continue.`,
      })
      return true
    } catch (error) {
      if (!current()) return false
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(findReplaceStateAtom) === pending && get(rustWorkbookConnectionAtom) !== connection)
        set(findReplaceStateAtom, {
          ...pending,
          open: false,
          origin: null,
          busy: null,
          result: null,
        })
    }
  },
)
runFindReplaceAtom.debugLabel = 'spreadsheet.findReplace.run'
