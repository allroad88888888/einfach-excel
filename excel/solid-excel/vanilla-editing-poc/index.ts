// 一句话：组合 Vanilla POC 的 Core 会话、固定窗口与原生视图。

import { createStore } from '@einfach/core'
import { editingSessionAtom, projectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'

import { createVanillaEditingSession } from './editing-session'
import { createVanillaEditingProjectionSession } from './projection-session'
import { createFixedProjectionWindow } from './projection-window'
import type { VanillaEditingPoc, VanillaEditingPocOptions } from './types'
import { createVanillaEditingView } from './view'

const DEFAULT_CELL = { row: 0, col: 0 }

export async function mountVanillaEditingPoc(
  root: HTMLElement,
  options: VanillaEditingPocOptions,
): Promise<VanillaEditingPoc> {
  const store = createStore()
  const initialCell = options.initialCell ?? DEFAULT_CELL
  const projection = createVanillaEditingProjectionSession({
    backend: options.backend,
    sheetId: options.sheetId,
    store,
    window: createFixedProjectionWindow(options.window),
  })
  const editing = createVanillaEditingSession({
    backend: options.backend,
    projection,
    sheetId: options.sheetId,
    store,
  })
  const displayValue = () => projection.readCell(initialCell)?.displayValue ?? ''
  const view = createVanillaEditingView({
    root,
    onCommit: () => editing.commit(),
    onStart: () => editing.start(initialCell, displayValue()),
    onWriteDraft: (draft: string) => editing.writeDraft(draft),
  })
  const render = () => view.render(displayValue(), editing.state())
  const unsubscribeProjection = store.sub(projectionSnapshotAtom, render)
  const unsubscribeEditing = store.sub(editingSessionAtom, render)

  await projection.load()
  render()

  return Object.freeze({
    commit: () => editing.commit(),
    destroy: () => {
      unsubscribeProjection()
      unsubscribeEditing()
      view.destroy()
    },
    start: () => editing.start(initialCell, displayValue()),
    state: () => editing.state(),
    store,
    writeDraft: (draft: string) => editing.writeDraft(draft),
  })
}
