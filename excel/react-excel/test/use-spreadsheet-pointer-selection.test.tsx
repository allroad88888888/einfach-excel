import { createStore, type Store } from '@einfach/core'
import {
  pointerIntentAtom,
  pointerSessionAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { act, fireEvent, render } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetPointerSelection } from '../src/use-spreadsheet-pointer-selection'

const backend = {} as SpreadsheetBackend

interface PointerSurfaceProps {
  readonly id: string
}

function PointerSurface({ id }: PointerSurfaceProps) {
  const handlers = useSpreadsheetPointerSelection({
    sheetId: id,
    getCellCoord: (event) => {
      const row = event.clientY
      const col = event.clientX
      return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
    },
  })

  return <div data-testid={id} {...handlers} />
}

function renderSurface(store: Store, id = 'sheet-1') {
  store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
  return render(
    <SpreadsheetUiProvider backend={backend} store={store}>
      <PointerSurface id={id} />
    </SpreadsheetUiProvider>,
  )
}

type PointerEventType = 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup'

interface PointerEventInit {
  readonly button?: number
  readonly clientX?: number
  readonly clientY?: number
  readonly isPrimary?: boolean
  readonly pointerId: number
}

function dispatchPointerEvent(
  target: HTMLElement,
  type: PointerEventType,
  init: PointerEventInit,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    isPrimary: { value: init.isPrimary ?? true },
    pointerId: { value: init.pointerId },
  })
  fireEvent(target, event)
}

function dragStart(target: HTMLElement, pointerId: number, row: number, col: number): void {
  dispatchPointerEvent(target, 'pointerdown', {
    button: 0,
    clientX: col,
    clientY: row,
    isPrimary: true,
    pointerId,
  })
}

describe('useSpreadsheetPointerSelection', () => {
  it('keeps pointer selection state isolated in independent provider stores', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    firstStore.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
    secondStore.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
    const view = render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <PointerSurface id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <PointerSurface id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    const first = view.getByTestId('first')
    const second = view.getByTestId('second')
    act(() => {
      dragStart(first, 11, 1, 2)
      dispatchPointerEvent(first, 'pointermove', { clientX: 4, clientY: 3, pointerId: 11 })
      dispatchPointerEvent(first, 'pointerup', { pointerId: 11 })
      dragStart(second, 12, 6, 7)
    })

    expect(firstStore.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 1,
      rowEnd: 3,
      colStart: 2,
      colEnd: 4,
    })
    expect(firstStore.getter(pointerIntentAtom)).toMatchObject({
      type: 'pointer.drag-selection.commit',
      sheetId: 'first',
      anchor: { row: 1, col: 2 },
      focus: { row: 3, col: 4 },
    })
    expect(secondStore.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: { sheetId: 'second', anchor: { row: 6, col: 7 } },
    })
  })

  it('starts only primary-button drags and ignores pointers outside the active stream', () => {
    const store = createStore()
    const view = renderSurface(store)
    const target = view.getByTestId('sheet-1')

    act(() => {
      dispatchPointerEvent(target, 'pointerdown', {
        button: 2,
        clientX: 1,
        clientY: 1,
        isPrimary: true,
        pointerId: 1,
      })
      dispatchPointerEvent(target, 'pointerdown', {
        button: 0,
        clientX: 2,
        clientY: 2,
        isPrimary: false,
        pointerId: 2,
      })
    })
    expect(store.getter(pointerSessionAtom).status).toBe('idle')

    act(() => {
      dragStart(target, 3, 2, 3)
      dispatchPointerEvent(target, 'pointermove', { clientX: 8, clientY: 9, pointerId: 4 })
      dispatchPointerEvent(target, 'pointerup', { pointerId: 4 })
    })
    expect(store.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: { focus: { row: 2, col: 3 } },
    })

    act(() => dispatchPointerEvent(target, 'pointercancel', { pointerId: 3 }))
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
  })

  it('cancels an active pointer session when the binding unmounts', () => {
    const store = createStore()
    const view = renderSurface(store)

    act(() => dragStart(view.getByTestId('sheet-1'), 5, 4, 5))
    view.unmount()

    expect(store.getter(pointerSessionAtom).status).toBe('idle')
    expect(store.getter(pointerIntentAtom)).toBeNull()
  })
})
