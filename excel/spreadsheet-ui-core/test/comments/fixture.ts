import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setSelectionAtom, setRustWorkbookConnectionAtom, type RustWorkbookConnection } from '../../src'
import { nativeCommentPanelAtom, runNativeCommentAtom } from '../../src/comments/native/command'
import type { NativeCommentThread } from '../../src/comments/native/types'
import type { RustCommentCommands } from '../../src/rust-workbook/comments/command'

type Change = RustCommentCommands['comments.change']['payload']
export const firstThread = (): NativeCommentThread => ({ resolved: false,
  entries: [{ kind: 'message', author: 'Alice', body: 'first\n第二行', createdAt: 1000 }] })

export function setupComment(initial: NativeCommentThread | null = null) {
  const store = createStore()
  let thread = initial
  let revision = 1
  const request = vi.fn(async (command: string, input: unknown): Promise<unknown> => {
    if (command === 'comments.read') return { thread, revision }
    const change = input as Change
    const action = change.change
    thread = { resolved: action.action === 'resolve', entries: [...(thread?.entries ?? []), {
      kind: action.action === 'create' || action.action === 'reply' ? 'message' : action.action,
      author: action.author, ...('body' in action ? { body: action.body } : {}), createdAt: 2000,
    }] }
    revision += 1
    return { changed: true, thread, projection: { ...change.projection, revision,
      cells: [{ row: 1, col: 1, displayValue: '3', formula: '=1+2', commentIndicator: true }] } }
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
    { id: 'other', index: 1, name: 'Other', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, { request: request as RustWorkbookConnection['request'], dispose() {} })
  const select = (row = 1, col = 1) => store.setter(setSelectionAtom,
    { sheetId: 's', kind: 'range', anchor: { row, col }, focus: { row, col } })
  const project = (nextRevision = 1) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
      reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
    if (read.status !== 'started') throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, { request: read.request,
      result: { ...read.request, cells: [], revision: nextRevision } })
  }
  select(); project()
  const run = (action: Parameters<typeof runNativeCommentAtom.write>[2]) =>
    store.setter(runNativeCommentAtom, action)
  return { store, request, run, select, project, panel: () => store.getter(nativeCommentPanelAtom) }
}
