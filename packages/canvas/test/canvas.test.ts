import { atom } from '@einfach/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanvas } from '../src/canvas.js'
import { useAtomValue, useSetAtom } from '../src/atom.js'
import { useCache } from '../src/cache.js'
import { onCleanup } from '../src/owner.js'
import { canvasFixture, frameFixture, observedStore } from './support.js'

const rect = { x: 0, y: 0, width: 100, height: 80 }

describe('Canvas cell lifetime and repaint', () => {
  let frames: ReturnType<typeof frameFixture>
  beforeEach(() => { frames = frameFixture() })
  afterEach(() => vi.unstubAllGlobals())

  it('subscribes once, coalesces 100 writes and leaves unrelated cells untouched', () => {
    const { canvas } = canvasFixture()
    const probe = observedStore()
    const source = atom(0)
    const surface = createCanvas(canvas, { store: probe.store, width: 300, height: 100 })
    const values: number[] = []
    const other = vi.fn()
    const setup = vi.fn(() => {
      const value = useAtomValue(source)
      return () => { values.push(value()) }
    })
    surface.createCell(rect, setup)
    surface.createCell({ ...rect, x: 150 }, () => other)
    expect(probe.active()).toBe(1)
    expect(frames.pending()).toBe(1)
    frames.tick()
    expect(values).toEqual([0])
    for (let value = 1; value <= 100; value++) probe.store.setter(source, value)
    expect(frames.pending()).toBe(1)
    frames.tick()
    expect(values).toEqual([0, 100])
    expect(other).toHaveBeenCalledOnce()
    expect(setup).toHaveBeenCalledOnce()
    surface.dispose()
    expect(probe.active()).toBe(0)
  })

  it('clears removed cells and repaints overlapping cells in their original order', () => {
    const { canvas, context } = canvasFixture()
    const probe = observedStore()
    const surface = createCanvas(canvas, { store: probe.store, width: 300, height: 100 })
    const order: string[] = []
    const bottom = surface.createCell(rect, () => () => { order.push('bottom') })
    const top = surface.createCell({ ...rect, x: 50 }, () => () => { order.push('top') })
    frames.tick()
    order.length = 0
    bottom.invalidate()
    frames.tick()
    expect(order).toEqual(['bottom', 'top'])
    order.length = 0
    top.dispose()
    frames.tick()
    expect(order).toEqual(['bottom'])
    expect(context.clearRect).toHaveBeenCalledTimes(3)
    surface.dispose()
  })

  it('cancels subscriptions and pending frames, invalidates the region cache', () => {
    const { canvas } = canvasFixture()
    const probe = observedStore()
    const source = atom(0)
    const surface = createCanvas(canvas, { store: probe.store, width: 100, height: 100 })
    const cached = surface.run(() => useCache((id: number) => atom(id)))
    expect(cached(1)).toBe(cached(1))
    let paints = 0
    const cell = surface.createCell(rect, () => {
      const value = useAtomValue(source)
      return () => { value(); paints++ }
    })
    frames.tick()
    cell.dispose()
    cell.dispose()
    expect(probe.active()).toBe(0)
    frames.tick()
    probe.store.setter(source, 2)
    cell.invalidate()
    expect(frames.pending()).toBe(0)
    expect(paints).toBe(1)
    surface.invalidate()
    surface.dispose()
    surface.dispose()
    expect(frames.pending()).toBe(0)
    expect(() => cached(1)).toThrow('disposed')
    expect(() => surface.createCell(rect, () => () => {})).toThrow('disposed')
  })

  it('cleans resources from failed setup and continues cleanup after a user error', () => {
    const { canvas, context } = canvasFixture()
    const probe = observedStore()
    const source = atom(0)
    const surface = createCanvas(canvas, { store: probe.store, width: 100, height: 100 })
    expect(() => surface.createCell(rect, () => {
      useAtomValue(source)
      throw new Error('setup')
    })).toThrow('setup')
    expect(probe.active()).toBe(0)
    surface.createCell(rect, () => {
      useAtomValue(source)
      onCleanup(() => { throw new Error('cleanup') })
      return () => {}
    })
    expect(() => surface.dispose()).toThrow('cleanup')
    expect(probe.active()).toBe(0)
    expect(frames.pending()).toBe(0)
    expect(context.clearRect).toHaveBeenCalled()
  })

  it('uses logical coordinates at device pixel ratio and repaints after resize', () => {
    const { canvas, context } = canvasFixture()
    const probe = observedStore()
    const surface = createCanvas(canvas, {
      store: probe.store, width: 100, height: 80, pixelRatio: 2,
    })
    const paint = vi.fn()
    surface.createCell(rect, () => paint)
    frames.tick()
    expect(canvas.width).toBe(200)
    expect(canvas.height).toBe(160)
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    surface.resize(120, 90, 3)
    frames.tick()
    expect(canvas.width).toBe(360)
    expect(canvas.height).toBe(270)
    expect(paint).toHaveBeenCalledTimes(2)
    surface.dispose()
  })

  it('restores clipping state after paint errors and allows an explicit retry', () => {
    const { canvas, context } = canvasFixture()
    const probe = observedStore()
    const surface = createCanvas(canvas, { store: probe.store, width: 100, height: 100 })
    let fail = true
    surface.createCell(rect, () => () => { if (fail) throw new Error('paint') })
    expect(() => surface.flush()).toThrow('paint')
    expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length)
    fail = false
    expect(() => surface.flush()).not.toThrow()
    surface.dispose()
  })

  it('honors same-reference Promise settlement notifications', async () => {
    const { canvas } = canvasFixture()
    const probe = observedStore()
    const source = atom(Promise.resolve(3))
    const surface = createCanvas(canvas, { store: probe.store, width: 100, height: 100 })
    let paints = 0
    surface.createCell(rect, () => {
      const value = useAtomValue(source)
      return () => { value(); paints++ }
    })
    frames.tick()
    await probe.store.getter(source)
    frames.tick()
    expect(paints).toBe(2)
    surface.dispose()
  })

  it('releases a subscription returned after synchronous region disposal', () => {
    const { canvas } = canvasFixture()
    const probe = observedStore()
    const surface = createCanvas(canvas, {
      width: 100, height: 100,
      store: { ...probe.store, sub(entity, listener) {
        const stop = probe.store.sub(entity, listener)
        surface.dispose()
        return stop
      } },
    })
    expect(() => surface.createCell(rect, () => {
      useAtomValue(atom(0))
      return () => {}
    })).toThrow('disposed')
    expect(probe.active()).toBe(0)
    expect(frames.pending()).toBe(0)
  })

  it('supports explicit stores and writes through the supplied Core store', () => {
    const { canvas } = canvasFixture()
    const first = observedStore(), second = observedStore()
    const source = atom(0)
    const surface = createCanvas(canvas, { store: first.store, width: 100, height: 100 })
    let latest = 0
    let set!: (value: number) => void
    surface.createCell(rect, () => {
      const value = useAtomValue(source, { store: second.store })
      set = useSetAtom(source, { store: second.store })
      return () => { latest = value() }
    })
    set(5)
    frames.tick()
    expect(latest).toBe(5)
    expect(first.active()).toBe(0)
    expect(second.active()).toBe(1)
    surface.dispose()
    expect(second.active()).toBe(0)
  })
})
