import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  setSelectionAtom, type NativeCommentThread, type RustWorkbookConnection } from '@einfach-excel/spreadsheet-ui-core'
import type { RustCommentCommands } from '../../../../spreadsheet-ui-core/src/rust-workbook/comments/command'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { CommentTools } from '../../../src/workbook/comments/CommentTools'

export const firstThread = (): NativeCommentThread => ({ resolved: false,
  entries: [{ kind: 'message', author: '<b>Alice</b>', body: '<img src=x>\n第二行', createdAt: 1700000000000 }] })

export function setup(initial: NativeCommentThread | null = null): ReturnType<typeof render> & {
  request: Mock<(command: string, payload: unknown) => Promise<unknown>>
} {
  const store = createStore()
  let thread = initial
  let revision = 1
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision } })
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'comments.read') return { thread, revision }
    const input = payload as RustCommentCommands['comments.change']['payload']
    const action = input.change
    thread = { resolved: action.action === 'resolve', entries: [...(thread?.entries ?? []), {
      kind: action.action === 'create' || action.action === 'reply' ? 'message' : action.action,
      author: action.author, ...('body' in action ? { body: action.body } : {}), createdAt: 1700000001000,
    }] }
    revision += 1
    return { changed: true, thread, projection: { ...input.projection, cells: [], revision } }
  })
  const view = render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><CommentTools /></WorkbookStoreProvider>)
  return { request, ...view }
}
export async function click(name: string) {
  const exactName = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: exactName })) })
}
export async function change(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  })
}
