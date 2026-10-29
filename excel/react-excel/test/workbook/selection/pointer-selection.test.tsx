import { createStore } from '@einfach/core'
import { useAtomValue } from '@einfach/react'
import {
  pointerSessionAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { useGridPointerSelection } from '../../../src/workbook/selection/use-grid-pointer-selection'

function SelectionSurface() {
  const selection = useAtomValue(selectionSnapshotAtom)
  const handlers = useGridPointerSelection({
    sheetId: 'sheet-1',
    getCellCoord: (event: ReactPointerEvent<HTMLElement>) => ({
      row: event.clientY,
      col: event.clientX,
    }),
  })
  const range = selection.range
  return (
    <div aria-label="selection surface" {...handlers}>
      {range.rowStart}:{range.colStart}-{range.rowEnd}:{range.colEnd}
    </div>
  )
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  row: number,
  col: number,
  shiftKey = false,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: col },
    clientY: { value: row },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    shiftKey: { value: shiftKey },
  })
  fireEvent(target, event)
}

describe('React pointer selection adapter', () => {
  it('Shift click and drag preserve the original anchor, then a plain click starts over', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })
    render(<WorkbookStoreProvider store={store}><SelectionSurface /></WorkbookStoreProvider>)
    const surface = screen.getByLabelText('selection surface')
    dispatchPointer(surface, 'pointerdown', 1, 2, 1)
    dispatchPointer(surface, 'pointerup', 1, 2, 1)
    dispatchPointer(surface, 'pointerdown', 2, 5, 4, true)
    expect(surface).toHaveTextContent('2:1-5:4')
    dispatchPointer(surface, 'pointermove', 2, 6, 5, true)
    expect(surface).toHaveTextContent('2:1-6:5')
    dispatchPointer(surface, 'pointerup', 2, 6, 5, true)
    dispatchPointer(surface, 'pointerdown', 3, 3, 2, true)
    expect(surface).toHaveTextContent('2:1-3:2')
    dispatchPointer(surface, 'pointerup', 3, 3, 2, true)
    dispatchPointer(surface, 'pointerdown', 4, 4, 4)
    expect(surface).toHaveTextContent('4:4-4:4')
  })

  it('preserves click, drag, commit and cancel behavior', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })
    render(
      <WorkbookStoreProvider store={store}>
        <SelectionSurface />
      </WorkbookStoreProvider>,
    )
    const surface = screen.getByLabelText('selection surface')

    dispatchPointer(surface, 'pointerdown', 7, 2, 3)
    dispatchPointer(surface, 'pointerup', 7, 2, 3)
    expect(surface).toHaveTextContent('2:3-2:3')
    expect(store.getter(pointerSessionAtom).status).toBe('idle')

    dispatchPointer(surface, 'pointerdown', 8, 4, 1)
    dispatchPointer(surface, 'pointermove', 8, 7, 5)
    expect(surface).toHaveTextContent('4:1-7:5')
    dispatchPointer(surface, 'pointercancel', 8, 7, 5)
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
  })
})
