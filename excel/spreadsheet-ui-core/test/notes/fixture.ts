import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setSelectionAtom, setRustWorkbookConnectionAtom, type RustWorkbookConnection } from '../../src'
import { notePanelAtom, runNoteAtom } from '../../src/notes/command'
import type { RustNoteCommands } from '../../src/rust-workbook/notes/command'

type Change = RustNoteCommands['notes.change']['payload']
export function setupNote(text: string | null = null) {
  const store = createStore()
  const request = vi.fn(async (command: string, input: unknown): Promise<unknown> => {
    if (command === 'notes.read') return { text, revision: 1 }
    const change = input as Change
    return { changed: true, projection: { ...change.projection,
      cells: [{ row: 1, col: 1, displayValue: '3', formula: '=1+2', noteIndicator: change.text !== null }],
      revision: 2 } }
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, { request: request as RustWorkbookConnection['request'], dispose() {} })
  const select = (row = 1, col = 1) => store.setter(setSelectionAtom,
    { sheetId: 's', kind: 'range', anchor: { row, col }, focus: { row, col } })
  const project = (revision = 1) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
      reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
    if (read.status !== 'started') throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, { request: read.request,
      result: { ...read.request, cells: [], revision } })
  }
  select(); project()
  const run = (action: Parameters<typeof runNoteAtom.write>[2]) => store.setter(runNoteAtom, action)
  return { store, request, run, select, project, panel: () => store.getter(notePanelAtom) }
}
