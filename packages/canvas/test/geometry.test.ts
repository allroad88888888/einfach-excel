import { atom } from '@einfach/core'
import { afterEach, expect, test, vi } from 'vitest'
import { createCanvas } from '../src/canvas'
import { useAtomValue } from '../src/atom'
import { onPointerDown } from '../src/events'
import { canvasFixture, frameFixture, observedStore } from './support'

afterEach(() => vi.unstubAllGlobals())
test('moving cell bounds preserves setup, subscriptions, pointer targets and erases old pixels', () => {
  const frames = frameFixture(), f = canvasFixture(), probe = observedStore()
  const surface = createCanvas(f.canvas, { store: probe.store, width: 300, height: 100 })
  const pointer = vi.fn(), setup = vi.fn(() => {
    const value = useAtomValue(atom(1))
    onPointerDown(pointer)
    return () => { value() }
  })
  const cell = surface.createCell({ x: 0, y: 0, width: 100, height: 100 }, setup)
  frames.tick()
  cell.setBounds({ x: 100, y: 0, width: 100, height: 100 })
  frames.tick()
  expect(f.context.rect).toHaveBeenCalledWith(0, 0, 100, 100)
  expect(f.context.rect).toHaveBeenCalledWith(100, 0, 100, 100)
  const event = (x: number) => Object.assign(new Event('pointerdown'), {
    clientX: x, clientY: 10, pointerId: 1, isPrimary: true, pointerType: 'mouse',
  })
  f.canvas.dispatchEvent(event(10))
  expect(pointer).not.toHaveBeenCalled()
  f.canvas.dispatchEvent(event(110))
  expect(pointer).toHaveBeenCalledOnce()
  expect(setup).toHaveBeenCalledOnce()
  expect(probe.active()).toBe(1)
  surface.dispose()
  expect(probe.active()).toBe(0)
})
