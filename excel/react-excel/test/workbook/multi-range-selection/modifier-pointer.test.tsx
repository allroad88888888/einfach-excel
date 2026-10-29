import { createStore } from '@einfach/core'
import { useAtomValue } from '@einfach/react'
import {
  dispatchKeyboardInputAtom, pointerSessionAtom, selectionCellCountAtom, selectionRegionsAtom,
  selectionSnapshotAtom, setMultiRegionSelectionAtom, setSelectionBoundsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { useGridPointerSelection } from '../../../src/workbook/selection/use-grid-pointer-selection'

function Surface({ sheetId = 's', enabled = true, label = 'surface' }) {
  const selection = useAtomValue(selectionSnapshotAtom)
  const regions = useAtomValue(selectionRegionsAtom)
  const count = useAtomValue(selectionCellCountAtom)
  const handlers = useGridPointerSelection({ sheetId, enabled,
    getCellCoord: event => ({ row: event.clientY, col: event.clientX }),
  })
  return <div aria-label={label} {...handlers} onPointerDown={event => {
    event.currentTarget.dataset.accepted = String(handlers.onPointerDown(event))
  }}>
    {regions.length} areas / {count} cells / {selection.activeCell.row}:{selection.activeCell.col}
  </div>
}

function pointer(target: Element, type: string, row: number, col: number,
  keys: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}, id = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 }, pointerId: { value: id }, isPrimary: { value: true },
    clientX: { value: col }, clientY: { value: row },
    ctrlKey: { value: keys.ctrlKey ?? false }, metaKey: { value: keys.metaKey ?? false },
    shiftKey: { value: keys.shiftKey ?? false },
  })
  fireEvent(target, event)
}
function setup() {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
  return store
}

describe('modifier pointer DOM dispatch', () => {
  it.each(['ctrlKey', 'metaKey'] as const)('%s click and drag append, then ordinary click restores one area', key => {
    const store = setup()
    render(<WorkbookStoreProvider store={store}><Surface /></WorkbookStoreProvider>)
    const surface = screen.getByLabelText('surface')
    pointer(surface, 'pointerdown', 1, 1)
    pointer(surface, 'pointerup', 1, 1)
    pointer(surface, 'pointerdown', 4, 4, { [key]: true })
    pointer(surface, 'pointerup', 4, 4, { [key]: true })
    expect(surface).toHaveTextContent('2 areas / 2 cells / 4:4')
    pointer(surface, 'pointerdown', 6, 6, { [key]: true })
    pointer(surface, 'pointermove', 7, 7)
    pointer(surface, 'pointerup', 7, 7)
    expect(surface).toHaveTextContent('3 areas / 6 cells / 7:7')
    pointer(surface, 'pointerdown', 3, 3)
    expect(surface).toHaveTextContent('1 areas / 1 cells / 3:3')
  })

  it('Shift wins over modifiers and a different pointer cannot update or end the drag', () => {
    const store = setup()
    render(<WorkbookStoreProvider store={store}><Surface /></WorkbookStoreProvider>)
    const surface = screen.getByLabelText('surface')
    pointer(surface, 'pointerdown', 2, 2)
    pointer(surface, 'pointerup', 2, 2)
    pointer(surface, 'pointerdown', 4, 4, { ctrlKey: true, shiftKey: true })
    pointer(surface, 'pointermove', 8, 8, {}, 2)
    pointer(surface, 'pointerup', 8, 8, {}, 2)
    expect(surface).toHaveTextContent('1 areas / 9 cells / 4:4')
    expect(store.getter(pointerSessionAtom).status).toBe('active')
    pointer(surface, 'pointerup', 4, 4)
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
  })

  it('pointercancel preserves areas and late events cannot change the settled selection', () => {
    const store = setup()
    render(<WorkbookStoreProvider store={store}><Surface /></WorkbookStoreProvider>)
    const surface = screen.getByLabelText('surface')
    pointer(surface, 'pointerdown', 1, 1)
    pointer(surface, 'pointerup', 1, 1)
    pointer(surface, 'pointerdown', 4, 4, { metaKey: true })
    pointer(surface, 'pointermove', 5, 5)
    pointer(surface, 'pointercancel', 5, 5)
    pointer(surface, 'pointermove', 8, 8)
    pointer(surface, 'pointerup', 8, 8)
    expect(surface).toHaveTextContent('2 areas / 5 cells / 5:5')
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
  })

  it('Core Escape releases native capture and clears other areas before a late move', () => {
    const store = setup()
    render(<WorkbookStoreProvider store={store}><Surface /></WorkbookStoreProvider>)
    const surface = screen.getByLabelText('surface')
    const capture = vi.fn()
    const release = vi.fn()
    Object.assign(surface, { setPointerCapture: capture, releasePointerCapture: release })
    pointer(surface, 'pointerdown', 1, 1)
    pointer(surface, 'pointerup', 1, 1)
    pointer(surface, 'pointerdown', 4, 4, { ctrlKey: true })
    act(() => { store.setter(dispatchKeyboardInputAtom, { key: 'Escape' }) })
    expect(release).toHaveBeenLastCalledWith(1)
    pointer(surface, 'pointermove', 8, 8)
    expect(surface).toHaveTextContent('1 areas / 1 cells / 4:4')
    expect(capture).toHaveBeenCalledTimes(2)
  })

  it('budget rejection returns false to the scroll adapter and never captures a pointer', () => {
    const store = setup()
    store.setter(setMultiRegionSelectionAtom, { regions: Array.from({ length: 10_000 }, () => ({
      kind: 'cell' as const, sheetId: 's', anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 },
    })) })
    render(<WorkbookStoreProvider store={store}><Surface /></WorkbookStoreProvider>)
    const surface = screen.getByLabelText('surface')
    const capture = vi.fn()
    Object.assign(surface, { setPointerCapture: capture })
    pointer(surface, 'pointerdown', 4, 4, { metaKey: true })
    expect(surface).toHaveAttribute('data-accepted', 'false')
    expect(capture).not.toHaveBeenCalled()
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
    expect(store.getter(selectionRegionsAtom)).toHaveLength(10_000)
  })

  it.each(['sheet', 'disabled'] as const)('%s changes end capture and ignore events from the old stream', change => {
    const store = setup()
    const view = (sheetId: string, enabled: boolean) =>
      <WorkbookStoreProvider store={store}>
        <Surface sheetId={sheetId} enabled={enabled} />
      </WorkbookStoreProvider>
    const { rerender } = render(view('s', true))
    const surface = screen.getByLabelText('surface')
    pointer(surface, 'pointerdown', 1, 1)
    pointer(surface, 'pointerup', 1, 1)
    pointer(surface, 'pointerdown', 4, 4, { ctrlKey: true })
    rerender(view(change === 'sheet' ? 'other' : 's', change !== 'disabled'))
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
    pointer(surface, 'pointermove', 8, 8)
    expect(surface).toHaveTextContent('2 areas / 2 cells / 4:4')
  })

  it('different workbook providers do not share selection or append sessions', () => {
    const first = setup()
    const second = setup()
    render(<>
      <WorkbookStoreProvider store={first}><Surface label="first" /></WorkbookStoreProvider>
      <WorkbookStoreProvider store={second}><Surface label="second" /></WorkbookStoreProvider>
    </>)
    const surface = screen.getByLabelText('first')
    pointer(surface, 'pointerdown', 1, 1)
    pointer(surface, 'pointerup', 1, 1)
    pointer(surface, 'pointerdown', 4, 4, { ctrlKey: true })
    expect(surface).toHaveTextContent('2 areas / 2 cells / 4:4')
    expect(screen.getByLabelText('second')).toHaveTextContent('1 areas / 1 cells / 0:0')
  })
})
