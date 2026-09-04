import { createStore } from '@einfach/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  editingDraftAtom,
  enterFormulaReferenceAtom,
  formulaReferenceSessionAtom,
  keyboardModeAtom,
  startEditingAtom,
} from '@einfach/spreadsheet-ui-core'
import {
  getFormulaReferenceFocusTarget,
  restoreFormulaReferenceFocus,
} from '../src/grid/grid-formula-reference-focus'
import { startFormulaReferencePointerSession } from '../src/grid/grid-formula-reference-pointer-session'

function pointerEvent(type: string, pointerId: number): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event as PointerEvent
}

function startSession(input: HTMLInputElement) {
  const store = createStore()
  const draft = '=A1+Z9'
  store.setter(startEditingAtom, {
    sheetId: 'sheet-1',
    cell: { row: 0, col: 0 },
    draft,
    source: 'cell',
  })
  store.setter(enterFormulaReferenceAtom, {
    sheetId: 'sheet-1',
    anchorCell: { row: 0, col: 0 },
    insertionCaret: 4,
    draft,
  })

  const handle = document.createElement('button')
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()
  Object.assign(handle, { setPointerCapture, releasePointerCapture })
  document.body.append(handle)
  let cancel: (() => void) | undefined
  handle.addEventListener('pointerdown', (event) => {
    cancel = startFormulaReferencePointerSession({
      event,
      store,
      sheetId: 'sheet-1',
      anchor: { row: 1, col: 1 },
      getCellCoordFromPoint: (moveEvent) =>
        moveEvent.type === 'pointermove' ? { row: 2, col: 2 } : null,
      restoreFocus: (caret) => restoreFormulaReferenceFocus(input, caret),
    })
  })
  handle.dispatchEvent(pointerEvent('pointerdown', 7))
  if (!cancel) throw new Error('Formula-reference pointer session did not start.')
  return { cancel, handle, input, releasePointerCapture, setPointerCapture, store }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('vNext formula-reference pointer session', () => {
  it('picks the dragged range and restores the Atom insertion caret instead of input end', async () => {
    const input = document.createElement('input')
    input.className = 'cell-input'
    input.value = '=A1+Z9'
    document.body.append(input)
    input.focus()
    const { releasePointerCapture, setPointerCapture, store } = startSession(input)

    window.dispatchEvent(pointerEvent('pointermove', 7))
    const draft = store.getter(editingDraftAtom)
    input.value = draft
    window.dispatchEvent(pointerEvent('pointerup', 7))
    await Promise.resolve()

    expect(draft).toBe('=A1+B2:C3Z9')
    expect(store.getter(formulaReferenceSessionAtom)).toMatchObject({
      dragging: false,
      tokenRange: { start: 4, end: 9 },
    })
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(9)
    expect(input.selectionEnd).toBe(9)
    expect(input.value.length).toBe(11)
    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
  })

  it('ignores other pointers and cancels once on browser blur at the last Atom caret', async () => {
    const input = document.createElement('input')
    input.className = 'formula-bar-input'
    input.value = '=A1+Z9'
    document.body.append(input)
    input.focus()
    const { cancel, store } = startSession(input)

    window.dispatchEvent(pointerEvent('pointermove', 7))
    input.value = store.getter(editingDraftAtom)
    window.dispatchEvent(pointerEvent('pointercancel', 8))
    expect(store.getter(formulaReferenceSessionAtom)).not.toBeNull()
    window.dispatchEvent(new Event('blur'))
    cancel()
    await Promise.resolve()

    expect(store.getter(formulaReferenceSessionAtom)).toBeNull()
    expect(store.getter(keyboardModeAtom)).toBe('editing')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(9)
    expect(input.selectionEnd).toBe(9)
  })

  it('uses the shared autocomplete anchor contract to reject unrelated focus targets', () => {
    const input = document.createElement('input')
    const supported = document.createElement('input')
    supported.className = 'cell-input'

    expect(getFormulaReferenceFocusTarget(input)).toBeNull()
    expect(getFormulaReferenceFocusTarget(supported)).toBe(supported)
  })
})
