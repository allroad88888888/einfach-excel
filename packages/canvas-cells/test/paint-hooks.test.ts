import { afterEach, expect, test, vi } from 'vitest'
import { createLayout } from '../src/layout'
import { paintCellWithHooks } from '../src/paint-hooks'
import { defaultTheme } from '../src/types'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
const item = createLayout({ window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
  cells: [{ row: 0, col: 0, displayValue: 'Native value' }] }).items[0]
const model = { item, appearance: {
  hovered: false, selected: false, edges: 0, reference: false, showFormulas: false,
} }

test('custom cell painting is clipped and balanced even when the host throws', () => {
  const { context } = fixture()
  const onError = vi.fn(), after = vi.fn()
  paintCellWithHooks(context as unknown as CanvasRenderingContext2D, model, defaultTheme, {
    before: () => { throw new Error('host painter') }, after, onError,
  })
  expect(onError).toHaveBeenCalledOnce()
  expect(context.clip).toHaveBeenCalled()
  expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length)
  expect(context.fillText).toHaveBeenCalledWith('Native value', expect.any(Number), expect.any(Number))
  expect(after).toHaveBeenCalledOnce()
})

test('a false before hook replaces default paint and still invokes after', () => {
  const { context } = fixture(), after = vi.fn()
  paintCellWithHooks(context as unknown as CanvasRenderingContext2D, model, defaultTheme, {
    before: input => { expect(Object.isFrozen(input.range)).toBe(true); return false }, after,
  })
  expect(context.fillText).not.toHaveBeenCalled()
  expect(after).toHaveBeenCalledOnce()
})
