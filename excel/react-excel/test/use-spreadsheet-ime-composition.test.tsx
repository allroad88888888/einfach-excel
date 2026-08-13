import { describe, expect, it, jest } from '@jest/globals'
import { createEvent, fireEvent, render } from '@testing-library/react'
import { useSpreadsheetImeComposition } from '../src/use-spreadsheet-ime-composition'

interface CompositionSurfaceProps {
  readonly onCancel: () => void
  readonly onCommit: () => void
}

function CompositionSurface({ onCancel, onCommit }: CompositionSurfaceProps) {
  const handlers = useSpreadsheetImeComposition({ onCancel, onCommit })
  return (
    <div data-testid="grid" {...handlers}>
      <input data-testid="editor" {...handlers} />
    </div>
  )
}

function renderSurface() {
  const onCommit = jest.fn()
  const onCancel = jest.fn()
  const view = render(<CompositionSurface onCommit={onCommit} onCancel={onCancel} />)
  return { ...view, onCommit, onCancel }
}

function dispatchKey(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = createEvent.keyDown(target, { bubbles: true, cancelable: true, key, ...init })
  fireEvent(target, event)
  return event
}

describe('useSpreadsheetImeComposition', () => {
  it('leaves Enter alone while composition bubbles from the editor to the grid', () => {
    const { getByTestId, onCommit } = renderSurface()
    const editor = getByTestId('editor')

    fireEvent.compositionStart(editor)
    const event = dispatchKey(editor, 'Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits once after composition ends despite the shared editor and grid handler', () => {
    const { getByTestId, onCommit } = renderSurface()
    const editor = getByTestId('editor')

    fireEvent.compositionStart(editor)
    fireEvent.compositionEnd(editor)
    const event = dispatchKey(editor, 'Enter')

    expect(event.defaultPrevented).toBe(true)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('uses the native composition flag when composition lifecycle events are unavailable', () => {
    const { getByTestId, onCommit } = renderSurface()
    const event = dispatchKey(getByTestId('editor'), 'Enter', { isComposing: true })

    expect(event.defaultPrevented).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancels once for Escape and does not override a consumed event', () => {
    const { getByTestId, onCancel } = renderSurface()
    const editor = getByTestId('editor')

    const escape = dispatchKey(editor, 'Escape')
    expect(escape.defaultPrevented).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)

    editor.addEventListener('keydown', (event) => event.preventDefault(), { once: true })
    const consumed = dispatchKey(editor, 'Escape')
    expect(consumed.defaultPrevented).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
