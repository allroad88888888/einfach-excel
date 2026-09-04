import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { startFillPointerSession } from '../src/grid/grid-fill-pointer-session'

interface SessionSpies {
  readonly move: Mock
  readonly commit: Mock
  readonly cancel: Mock
  readonly setCancel: Mock
}

function createSpies(): SessionSpies {
  return {
    move: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    setCancel: vi.fn(),
  }
}

function createPointerEvent(type: string, pointerId: number): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event as PointerEvent
}

function startSession(handle: HTMLButtonElement, spies: SessionSpies, pointerId = 7): () => void {
  let cancel: (() => void) | undefined
  handle.addEventListener('pointerdown', (event) => {
    cancel = startFillPointerSession(event, spies)
  })
  handle.dispatchEvent(createPointerEvent('pointerdown', pointerId))
  if (!cancel) throw new Error('Fill pointer session did not start.')
  return cancel
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('startFillPointerSession', () => {
  it('processes only the initiating pointer and commits it once', () => {
    const handle = document.createElement('button')
    const spies = createSpies()
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.assign(handle, { setPointerCapture, releasePointerCapture })
    document.body.append(handle)

    startSession(handle, spies)
    window.dispatchEvent(createPointerEvent('pointermove', 8))
    window.dispatchEvent(createPointerEvent('pointermove', 7))
    window.dispatchEvent(createPointerEvent('pointerup', 8))
    window.dispatchEvent(createPointerEvent('pointerup', 7))
    window.dispatchEvent(createPointerEvent('pointerup', 7))

    expect(spies.move).toHaveBeenCalledTimes(1)
    expect(spies.commit).toHaveBeenCalledTimes(1)
    expect(spies.cancel).not.toHaveBeenCalled()
    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    expect(spies.setCancel).toHaveBeenLastCalledWith(expect.any(Function))
  })

  it('cancels and unregisters a stream when the browser cancels its pointer', () => {
    const handle = document.createElement('button')
    const spies = createSpies()
    Object.assign(handle, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(() => {
        throw new Error('pointer capture already released')
      }),
    })
    document.body.append(handle)

    const cancel = startSession(handle, spies)
    window.dispatchEvent(createPointerEvent('pointercancel', 7))
    cancel()
    window.dispatchEvent(createPointerEvent('pointerup', 7))

    expect(spies.cancel).toHaveBeenCalledTimes(1)
    expect(spies.commit).not.toHaveBeenCalled()
    expect(spies.setCancel).toHaveBeenLastCalledWith(expect.any(Function))
  })
})
