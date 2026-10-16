import { act, renderHook } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { useGridDragAutoscroll } from '../../../src/workbook/selection/use-grid-drag-autoscroll'

afterEach(() => vi.unstubAllGlobals())

/** 显式推进每帧，不靠真实时间；只替换浏览器几何与 RAF。 */
function setup() {
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const scroll = document.createElement('div')
  Object.defineProperties(scroll, {
    scrollHeight: { value: 1000 }, clientHeight: { value: 400 },
    scrollWidth: { value: 1600 }, clientWidth: { value: 800 },
  })
  scroll.getBoundingClientRect = () => ({
    top: 100, bottom: 500, left: 100, right: 900,
  }) as DOMRect
  const scrollRef = { current: scroll }
  const onStep = vi.fn()
  const hook = renderHook(({ enabled }) => useGridDragAutoscroll({
    enabled, scrollRef, onStep,
  }), { initialProps: { enabled: true } })
  const frame = () => act(() => {
    const current = [...frames.values()]
    frames.clear()
    current.forEach((callback) => callback(0))
  })
  const pointer = (pointerId = 7, clientX = 899, clientY = 499) =>
    ({ pointerId, clientX, clientY }) as PointerEvent<HTMLElement>
  return { ...hook, frames, frame, scroll, onStep, pointer }
}

test('matching pointer cancellation stops both axes and cannot be restarted by a late move', () => {
  const h = setup()
  act(() => h.result.current.start(h.pointer()))
  h.frame()
  expect([h.scroll.scrollLeft, h.scroll.scrollTop]).toEqual([18, 18])
  expect(h.onStep).toHaveBeenCalledTimes(1)
  act(() => h.result.current.stop(7))
  expect(h.frames.size).toBe(0)
  act(() => h.result.current.track(h.pointer()))
  h.frame()
  expect([h.scroll.scrollLeft, h.scroll.scrollTop]).toEqual([18, 18])
  expect(h.onStep).toHaveBeenCalledTimes(1)
})

test('another pointer cannot move or cancel the active drag', () => {
  const h = setup()
  act(() => {
    h.result.current.start(h.pointer())
    h.result.current.track(h.pointer(8, 101, 101))
    h.result.current.stop(8)
  })
  h.frame()
  expect([h.scroll.scrollLeft, h.scroll.scrollTop]).toEqual([18, 18])
  act(() => h.result.current.stop())
  expect(h.frames.size).toBe(0)
})

test.each(['disable', 'unmount'])('%s clears scheduled work without another selection update', (mode) => {
  const h = setup()
  act(() => h.result.current.start(h.pointer()))
  h.frame()
  if (mode === 'disable') h.rerender({ enabled: false })
  else h.unmount()
  expect(h.frames.size).toBe(0)
  h.frame()
  expect(h.onStep).toHaveBeenCalledTimes(1)
  if (mode === 'disable') {
    h.rerender({ enabled: true })
    act(() => h.result.current.track(h.pointer()))
    expect(h.frames.size).toBe(0)
    act(() => h.result.current.start(h.pointer()))
    h.frame()
    expect(h.onStep).toHaveBeenCalledTimes(2)
  }
})

test('moving back to the center stops scheduling and returning to the edge resumes one loop', () => {
  const h = setup()
  act(() => {
    h.result.current.start(h.pointer())
    h.result.current.track(h.pointer(7, 300, 300))
  })
  h.frame()
  expect(h.frames.size).toBe(0)
  expect(h.onStep).not.toHaveBeenCalled()
  act(() => {
    h.result.current.track(h.pointer())
    h.result.current.track(h.pointer())
  })
  expect(h.frames.size).toBe(1)
  h.frame()
  expect(h.onStep).toHaveBeenCalledTimes(1)
})

test('scrolling clamps at the content boundary and does not leave a busy animation loop', () => {
  const h = setup()
  h.scroll.scrollTop = 595
  h.scroll.scrollLeft = 795
  act(() => h.result.current.start(h.pointer(7, 1000, 600)))
  h.frame()
  expect([h.scroll.scrollLeft, h.scroll.scrollTop]).toEqual([800, 600])
  expect(h.onStep).toHaveBeenLastCalledWith({ clientX: 899, clientY: 499 })
  h.frame()
  expect(h.frames.size).toBe(0)
  h.frame()
  expect(h.onStep).toHaveBeenCalledTimes(2)
})
