import { createStore } from '@einfach/core'
import { Provider } from '@einfach/react'
import { render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { SpreadsheetGrid } from '../src/SpreadsheetGrid'

afterEach(() => vi.unstubAllGlobals())

test('ordinary cells allocate no observer and removing shrink disconnects its pending measurement', () => {
  const observe = vi.fn(), disconnect = vi.fn(), schedule = vi.fn(() => 17), cancel = vi.fn()
  let resize: (() => void) | undefined
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe = observe
    disconnect = disconnect
  })
  vi.stubGlobal('requestAnimationFrame', schedule)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const store = createStore()
  const view = (shrinkToFit: boolean) => <Provider store={store}><SpreadsheetGrid
    cells={[{ row: 0, col: 0, displayValue: 'Inventory', format: { fontSize: 24, shrinkToFit } }]}
    window={{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }} /></Provider>
  const { container, rerender, unmount } = render(view(false))
  expect(observe).not.toHaveBeenCalled()
  expect(container.querySelector('.cell-content')!.firstChild!.nodeType).toBe(Node.TEXT_NODE)
  rerender(view(true))
  expect(observe).toHaveBeenCalledTimes(1)
  resize?.()
  expect(schedule).toHaveBeenCalledTimes(1)
  rerender(view(false))
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(cancel).toHaveBeenCalledWith(17)
  resize?.()
  expect(schedule).toHaveBeenCalledTimes(1)
  expect(container.querySelector('.cell-content')!.firstChild!.nodeType).toBe(Node.TEXT_NODE)
  unmount()
})
