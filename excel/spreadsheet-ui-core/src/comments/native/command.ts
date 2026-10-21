import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../../rust-workbook/commands'
import { editingSessionAtom } from '../../editing/session-atoms'
import { resolveContentMutationAtom } from '../../editing/mutation-gateway'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../../selection'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../../projection'
import { isCellInRange, validateProjectionResult } from '../../projection/contracts'
import { rustHistoryPanelAtom } from '../../history/rust-history-command'
import { sheetTabsAtom } from '../../sheet-tabs/state'
import type { CellCoord } from '../../shared'
import type { ProjectionRevision } from '../../backend'
import { isNativeCommentThread, normalizeCommentAuthor, validateCommentDraft,
  type NativeCommentChange, type NativeCommentThread } from './types'

interface Panel {
  connection: RustWorkbookConnection | null
  sheetId: string
  cell: CellCoord
  revision?: ProjectionRevision
  thread: NativeCommentThread | null
  author: string
  body: string
  loaded: boolean
  phase: 'loading' | 'saving' | null
  error: string
}
const CLOSED: Panel = { connection: null, sheetId: '', cell: { row: 0, col: 0 },
  thread: null, author: '', body: '', loaded: false, phase: null, error: '' }
const panelAtom = atom<Panel>(CLOSED)

/** 当前对话框草稿不是工作簿镜像；每次打开从 Rust 读取完整线程。 */
export const nativeCommentPanelAtom = atom((get) => {
  const state = get(panelAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  const projection = get(projectionSnapshotAtom)
  const result = projection.result
  const selection = get(selectionSnapshotAtom)
  const current = state.connection === connection && state.sheetId === sheet?.id
  const ready =
    projection.status === 'ready' &&
    result?.kind === 'visible-window' &&
    result.sheetId === sheet?.id &&
    result.revision !== undefined
  const known =
    result?.kind === 'visible-window' &&
    (isCellInRange(selection.activeCell, result.window) ||
      result.frozen?.regions.some((region) => isCellInRange(selection.activeCell, region.window)))
  const single =
    selection.range.rowStart === selection.range.rowEnd &&
    selection.range.colStart === selection.range.colEnd
  const merged =
    result?.kind === 'visible-window' &&
    result.mergedRanges?.some(
      (range) =>
        range.rowStart === selection.range.rowStart &&
        range.rowEnd === selection.range.rowEnd &&
        range.colStart === selection.range.colStart &&
        range.colEnd === selection.range.colEnd,
    )
  return {
    ...state,
    open: Boolean(current && connection),
    busy: Boolean(current && state.phase),
    available: Boolean(
      sheet &&
        connection &&
        ready &&
        known &&
        get(selectionRegionsAtom).length === 1 &&
        (single || merged) &&
        !get(editingSessionAtom).source &&
        !get(rustHistoryPanelAtom).busy &&
        !get(sheetTabsAtom).mutation,
    ),
  }
})

export type NativeCommentAction =
  | 'open'
  | 'close'
  | 'post'
  | 'resolve'
  | 'reopen'
  | { author: string }
  | { body: string }

export const runNativeCommentAtom = atom(
  null,
  async (get, set, action: NativeCommentAction): Promise<boolean> => {
    const state = get(panelAtom)
    const panel = get(nativeCommentPanelAtom)
    if (action === 'close') {
      if (panel.phase === 'saving') return false
      set(panelAtom, { ...CLOSED, author: state.author })
      return true
    }
    if (panel.busy) return false
    const connection = get(rustWorkbookConnectionAtom)
    const sheet = get(activeWorkbookSheetAtom)
    if (!connection || !sheet) return false
    const witness = get(projectionSnapshotAtom)
    const result = witness.result
    const visible = witness.request
    const fail = (error: string) => {
      set(panelAtom, { ...get(panelAtom), error, phase: null })
      return false
    }
    if (action === 'open') {
      if (!panel.available || result?.kind !== 'visible-window') return false
      const cell = get(selectionSnapshotAtom).activeCell
      const pending: Panel = {
        ...CLOSED,
        author: state.author,
        connection,
        sheetId: sheet.id,
        cell: { ...cell },
        revision: result.revision,
        phase: 'loading',
      }
      set(panelAtom, pending)
      try {
        const request = connection.request('comments.read', {
          ...cell,
          sheetId: sheet.id,
          revision: result.revision!,
        })
        // 发布 async 入口同步批次后的 loading；慢 Worker 期间仍可取消。
        await Promise.resolve()
        if (get(panelAtom) === pending) set(panelAtom, pending)
        const reply = await request
        if (
          get(panelAtom) !== pending ||
          get(rustWorkbookConnectionAtom) !== connection ||
          get(activeWorkbookSheetAtom)?.id !== sheet.id
        )
          return false
        if (
          reply.revision !== result.revision ||
          get(projectionSnapshotAtom).result?.revision !== result.revision ||
          !(reply.thread === null || isNativeCommentThread(reply.thread))
        )
          throw new Error('The workbook changed. Reopen the comment editor.')
        set(panelAtom, { ...pending, thread: reply.thread, loaded: true, phase: null })
        return true
      } catch (error) {
        if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection)
          return false
        return fail(error instanceof Error ? error.message : String(error))
      }
    }
    if (!panel.open) return false
    if (typeof action === 'object') {
      if (!state.loaded) return false
      set(panelAtom, { ...state, ...action, error: '' })
      return true
    }
    if (
      !state.loaded ||
      !panel.available ||
      visible?.kind !== 'visible-window' ||
      result?.kind !== 'visible-window'
    )
      return fail('Finish the current operation before changing comments.')
    if (result.revision !== state.revision)
      return fail('The workbook changed. Reopen the comment editor.')
    if (action === 'post' && state.thread?.resolved)
      return fail('Reopen the thread before replying.')
    if (action !== 'post' && !state.thread) return false
    if (
      (action === 'resolve' && state.thread?.resolved) ||
      (action === 'reopen' && !state.thread?.resolved)
    )
      return false
    const body = state.body.replace(/\r\n?/gu, '\n')
    const draftError = validateCommentDraft(state.author, action === 'post' ? body : undefined)
    if (draftError) return fail(draftError)
    const gate = set(resolveContentMutationAtom, {
      kind: 'change-comment',
      sheetId: sheet.id,
      cell: state.cell,
    })
    if (gate.status !== 'allowed') return fail(gate.diagnostic.message)
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: sheet.id,
      requestId,
      window: visible.window,
      viewport: visible.viewport,
      reason: 'toolbar',
    })
    const change: NativeCommentChange =
      action === 'post'
        ? {
            action: state.thread ? 'reply' : 'create',
            author: normalizeCommentAuthor(state.author),
            body,
          }
        : { action, author: normalizeCommentAuthor(state.author) }
    const pending: Panel = { ...state, phase: 'saving', error: '' }
    set(panelAtom, pending)
    try {
      const request = connection.request('comments.change', {
        sheetId: sheet.id,
        ...state.cell,
        change,
        revision: state.revision!,
        projection,
      })
      await Promise.resolve()
      if (get(panelAtom) === pending) set(panelAtom, pending)
      const reply = await request
      if (
        get(panelAtom) !== pending ||
        get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== sheet.id
      )
        return false
      if (
        typeof reply.changed !== 'boolean' ||
        !isNativeCommentThread(reply.thread) ||
        reply.projection.revision !== Number(state.revision) + (reply.changed ? 1 : 0) ||
        !validateProjectionResult(reply.projection, { request: projection }).ok
      )
        throw new Error('Rust returned a mismatched comment result.')
      const previous = state.thread?.entries ?? []
      const entries = reply.thread.entries
      const last = entries[entries.length - 1]
      const kind = action === 'post' ? 'message' : action
      if (
        !reply.changed ||
        entries.length !== previous.length + 1 ||
        previous.some(
          (entry, index) =>
            entry.kind !== entries[index].kind ||
            entry.author !== entries[index].author ||
            entry.body !== entries[index].body ||
            entry.createdAt !== entries[index].createdAt,
        ) ||
        last.kind !== kind ||
        last.author !== change.author ||
        last.body !== ('body' in change ? change.body : undefined) ||
        reply.thread.resolved !== (action === 'resolve')
      )
        throw new Error('Rust returned a mismatched comment result.')
      if (get(projectionSnapshotAtom).result?.revision !== state.revision)
        throw new Error('The workbook changed. Reopen the comment editor.')
      set(applyVisibleProjectionAtom, { witness, request: projection, result: reply.projection })
      set(panelAtom, {
        ...pending,
        phase: null,
        thread: reply.thread,
        revision: reply.projection.revision,
        body: action === 'post' ? '' : state.body,
      })
      return true
    } catch (error) {
      if (get(panelAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
      return fail(error instanceof Error ? error.message : String(error))
    }
  },
)
