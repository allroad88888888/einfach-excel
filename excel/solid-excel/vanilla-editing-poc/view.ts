// 一句话：把受控编辑状态渲染到原生 DOM，并只拥有自己的事件监听器。

import type { EditingSessionState } from '@einfach/spreadsheet-ui-core'

export interface VanillaEditingView {
  readonly destroy: () => void
  readonly render: (displayValue: string, editing: EditingSessionState) => void
}

interface VanillaEditingViewOptions {
  readonly onCommit: () => Promise<unknown>
  readonly onStart: () => void
  readonly onWriteDraft: (draft: string) => void
  readonly root: HTMLElement
}

export function createVanillaEditingView(options: VanillaEditingViewOptions): VanillaEditingView {
  const cell = document.createElement('output')
  const input = document.createElement('input')
  const commit = document.createElement('button')
  let disposed = false

  cell.dataset.testid = 'vanilla-editing-cell'
  input.dataset.testid = 'vanilla-editing-input'
  commit.dataset.testid = 'vanilla-editing-commit'
  commit.type = 'button'
  commit.textContent = 'Commit'
  options.root.replaceChildren(cell, input, commit)

  const start = () => options.onStart()
  const writeDraft = () => options.onWriteDraft(input.value)
  const runCommit = () => {
    void options.onCommit()
  }
  input.addEventListener('focus', start)
  input.addEventListener('input', writeDraft)
  commit.addEventListener('click', runCommit)

  return Object.freeze({
    destroy: () => {
      if (disposed) return
      disposed = true
      input.removeEventListener('focus', start)
      input.removeEventListener('input', writeDraft)
      commit.removeEventListener('click', runCommit)
      options.root.replaceChildren()
    },
    render: (displayValue: string, editing: EditingSessionState) => {
      if (disposed) return
      cell.textContent = displayValue
      input.value = editing.draft
      commit.disabled = editing.status !== 'drafting'
    },
  })
}
