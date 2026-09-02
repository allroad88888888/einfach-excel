import { createStore } from '@einfach/core'
import {
  pointerSessionAtom,
  setSelectionBoundsAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { WorkbookRuntimeProvider } from '../../../src/workbook/runtime/WorkbookRuntimeProvider'
import { useGridPointerSelection } from '../../../src/workbook/selection/use-grid-pointer-selection'
import { useWorkbookSelection } from '../../../src/workbook/selection/use-workbook-selection'

function SelectionSurface() {
  const selection = useWorkbookSelection()
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
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: col },
    clientY: { value: row },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
  })
  fireEvent(target, event)
}

describe('React pointer selection adapter', () => {
  it('preserves click, drag, commit and cancel behavior', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })
    render(
      <WorkbookRuntimeProvider backend={{} as SpreadsheetBackend} store={store}>
        <SelectionSurface />
      </WorkbookRuntimeProvider>,
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
