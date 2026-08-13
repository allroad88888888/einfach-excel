import { describe, expect, it, jest } from '@jest/globals'
import { createApp, defineComponent, h } from 'vue'
import { useSpreadsheetImeComposition } from '../src/use-spreadsheet-ime-composition'

interface MountedCompositionSurface {
  readonly app: ReturnType<typeof createApp>
  readonly editor: HTMLInputElement
  readonly onCancel: jest.Mock
  readonly onCommit: jest.Mock
}

function mountCompositionSurface(): MountedCompositionSurface {
  const onCommit = jest.fn()
  const onCancel = jest.fn()
  const Root = defineComponent({
    setup: function CompositionSurfaceSetup() {
      const handlers = useSpreadsheetImeComposition({ onCancel, onCommit })
      return () =>
        h('div', { ...handlers, 'data-testid': 'grid' }, [
          h('input', { ...handlers, 'data-testid': 'editor' }),
        ])
    },
  })
  const host = document.createElement('div')
  const app = createApp(Root)
  app.mount(host)

  const editor = host.querySelector<HTMLInputElement>('[data-testid="editor"]')
  if (editor === null) throw new Error('IME composition editor was not mounted.')
  return { app, editor, onCancel, onCommit }
}

function dispatchComposition(
  target: HTMLElement,
  type: 'compositionstart' | 'compositionend',
): void {
  target.dispatchEvent(new CompositionEvent(type, { bubbles: true }))
}

function dispatchKey(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
  target.dispatchEvent(event)
  return event
}

describe('useSpreadsheetImeComposition', () => {
  it('leaves Enter alone while composition bubbles from the editor to the grid', () => {
    const mounted = mountCompositionSurface()

    dispatchComposition(mounted.editor, 'compositionstart')
    const event = dispatchKey(mounted.editor, 'Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(mounted.onCommit).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('commits once after composition ends despite the shared editor and grid handler', () => {
    const mounted = mountCompositionSurface()

    dispatchComposition(mounted.editor, 'compositionstart')
    dispatchComposition(mounted.editor, 'compositionend')
    const event = dispatchKey(mounted.editor, 'Enter')

    expect(event.defaultPrevented).toBe(true)
    expect(mounted.onCommit).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })

  it('uses the native composition flag when composition lifecycle events are unavailable', () => {
    const mounted = mountCompositionSurface()
    const event = dispatchKey(mounted.editor, 'Enter', { isComposing: true })

    expect(event.defaultPrevented).toBe(false)
    expect(mounted.onCommit).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('cancels once for Escape and does not override a consumed event', () => {
    const mounted = mountCompositionSurface()

    const escape = dispatchKey(mounted.editor, 'Escape')
    expect(escape.defaultPrevented).toBe(true)
    expect(mounted.onCancel).toHaveBeenCalledTimes(1)

    mounted.editor.addEventListener('keydown', (event) => event.preventDefault(), {
      capture: true,
      once: true,
    })
    const consumed = dispatchKey(mounted.editor, 'Escape')

    expect(consumed.defaultPrevented).toBe(true)
    expect(mounted.onCancel).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })
})
