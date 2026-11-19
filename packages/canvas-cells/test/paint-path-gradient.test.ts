import { expect, test, vi } from 'vitest'
import { paintPathGradient } from '../src/paint-path-gradient'

test('huge partially visible merged gradients visit only destination device rows', () => {
  const addColorStop = vi.fn(), fillRect = vi.fn()
  const context = {
    canvas: { width: 300, height: 180 },
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: -1000, f: -20000 }),
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop })), fillRect, fillStyle: '',
  }
  paintPathGradient(context as unknown as CanvasRenderingContext2D,
    { x: 0, y: 0, width: 1_000_000, height: 1_000_000 },
    { kind: 'path-gradient', left: 0.5, right: 0.5, top: 0.5, bottom: 0.5,
      stops: [{ position: 0, color: '#ff0000' }, { position: 1, color: '#0000ff' }] })
  expect(fillRect).toHaveBeenCalledTimes(180)
  expect(context.createLinearGradient).toHaveBeenCalledTimes(180)
  expect(fillRect.mock.calls[0]).toEqual([0, 10_000, 1_000_000, 0.5])
  expect(fillRect.mock.calls.at(-1)).toEqual([0, 10_089.5, 1_000_000, 0.5])
  expect(addColorStop.mock.calls.every(([position]) => position >= 0 && position <= 1)).toBe(true)
  expect(context.restore).toHaveBeenCalledTimes(1)
})
