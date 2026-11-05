import { bindDatePickerShortcut } from '../src/picker-shortcut'

function setup() {
  const editor = document.createElement('div')
  const textarea = document.createElement('textarea')
  const input = document.createElement('input')
  input.type = 'date'
  editor.append(textarea, input)
  document.body.append(editor)
  const outer = vi.fn()
  document.body.addEventListener('keydown', outer)
  const unbind = bindDatePickerShortcut(editor, input)
  const press = (init: KeyboardEventInit, target: HTMLElement = textarea) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
  }
  return { editor, textarea, input, outer, unbind, press }
}

afterEach(() => { document.body.replaceChildren() })

test('Alt+ArrowDown in the editor moves focus into the calendar and stops editor handling', () => {
  const { input, outer, press, textarea } = setup()
  textarea.focus()
  const event = press({ key: 'ArrowDown', altKey: true })
  expect(document.activeElement).toBe(input)
  expect(event.defaultPrevented).toBe(true)
  expect(outer).not.toHaveBeenCalled()
})

test('other keys, a disabled calendar and keys inside the calendar keep their normal behaviour', () => {
  const { input, outer, press, textarea } = setup()
  textarea.focus()
  press({ key: 'ArrowDown' })
  press({ key: 'Tab' })
  expect(document.activeElement).toBe(textarea)
  input.disabled = true
  press({ key: 'ArrowDown', altKey: true })
  expect(document.activeElement).toBe(textarea)
  input.disabled = false
  press({ key: 'ArrowDown', altKey: true }, input)
  expect(outer).toHaveBeenCalledTimes(4)
})

test('unbinding removes the shortcut', () => {
  const { input, press, textarea, unbind } = setup()
  unbind()
  textarea.focus()
  press({ key: 'ArrowDown', altKey: true })
  expect(document.activeElement).not.toBe(input)
})
