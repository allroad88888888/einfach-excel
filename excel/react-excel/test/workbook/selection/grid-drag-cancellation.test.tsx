import { pointerSessionAtom, selectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  createProjectionConnection,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

afterEach(() => vi.unstubAllGlobals())

test.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
  '%s ends real grid selection and stops its pending scroll frame', async (type) => {
    const { connection } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    const cell = await screen.findByRole('cell', { name: 'SO-10001' })
    const frame = cell.closest<HTMLElement>('.sheet-grid-frame')!
    const scroll = screen.getByTestId('sheet-scroll')
    Object.defineProperties(frame, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
    })
    Object.defineProperties(scroll, {
      scrollHeight: { value: 2000 }, clientHeight: { value: 400 },
      scrollWidth: { value: 1600 }, clientWidth: { value: 800 },
    })
    scroll.getBoundingClientRect = () => ({
      top: 100, bottom: 500, left: 100, right: 900,
    }) as DOMRect
    const frames = new Map<number, FrameRequestCallback>()
    let nextId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const tick = () => act(() => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(0))
    })
    const pointer = (target: HTMLElement, eventType: string) => {
      const event = new Event(eventType, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: 7 }, button: { value: 0 }, isPrimary: { value: true },
        clientX: { value: 899 }, clientY: { value: 499 },
      })
      fireEvent(target, event)
    }
    pointer(cell, 'pointerdown')
    pointer(cell, 'pointermove')
    tick()
    expect(scroll.scrollTop).toBe(18)
    expect(scroll.scrollLeft).toBe(18)
    expect(frames.size).toBe(1)
    await act(async () => pointer(frame, type))
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
    expect(frames.size).toBe(0)
    const stopped = store.getter(selectionSnapshotAtom).range
    pointer(cell, 'pointermove')
    tick()
    expect(store.getter(selectionSnapshotAtom).range).toEqual(stopped)
    expect([scroll.scrollLeft, scroll.scrollTop]).toEqual([18, 18])
  },
)
